"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { api } from "./_generated/api";
import { vly } from "../lib/vly-integrations";
import { FOOD_LIBRARY } from "../lib/mealLibrary";

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-flash-latest";

/** Кандидаты моделей: основной + запасные (перебираются до первого успеха). */
const GEMINI_MODELS = [
  GEMINI_MODEL,
  "gemini-flash-latest",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
].filter((m, i, arr) => m && arr.indexOf(m) === i);

const MAX_OUTPUT_TOKENS = 1024;

/** Приводит русские/английские названия приёмов пищи к валидным значениям. */
const MEAL_TYPE_ALIASES: Record<string, string> = {
  завтрак: "breakfast",
  breakfast: "breakfast",
  обед: "lunch",
  lunch: "lunch",
  ужин: "dinner",
  dinner: "dinner",
  перекус: "snack",
  снек: "snack",
  snack: "snack",
};

function toMealType(raw: unknown): string {
  const key = String(raw ?? "")
    .trim()
    .toLowerCase();
  return MEAL_TYPE_ALIASES[key] ?? "snack";
}

function clampNum(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? parseFloat(value)
        : NaN;
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n * 10) / 10));
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;
}

/** Достаёт JSON-блок из ответа модели (между <<<LOG>>> и <<<END>>> или в
 *  тройных кавычках). Устойчив к обрезанным ответам. Возвращает null, если
 *  блока нет. */
function extractLogBlock(text: string): string | null {
  const marker = text.match(/<<<LOG>>>([\s\S]*?)<<<END>>>/);
  if (marker) return marker[1].trim();

  // Обрезанный ответ: маркер есть, а <<<END>>> нет. Пробуем извлечь из хвоста
  // валидный JSON (до последней закрывающей скобки).
  const start = text.indexOf("<<<LOG>>>");
  if (start !== -1) {
    const tail = text.slice(start + "<<<LOG>>>".length);
    const lastBrace = tail.lastIndexOf("}");
    if (lastBrace !== -1) {
      const json = tail.slice(0, lastBrace + 1);
      try {
        JSON.parse(json);
        return json;
      } catch {
        // невалидно — пробуем другие варианты ниже
      }
    }
  }

  const fenced = text.match(/```(?:json)?([\s\S]*?)```/);
  if (fenced) {
    const candidate = fenced[1].trim();
    if (candidate.startsWith("{") && candidate.endsWith("}")) return candidate;
  }
  const bare = text.match(/\{[\s\S]*?\}/);
  return bare ? bare[0] : null;
}

/** Убирает служебные JSON-блоки из текста, оставляя только ответ пользователю.
 *  Не допускает утечки сырых блоков даже при обрезанном ответе модели. */
function stripLogBlock(text: string): string {
  let cleaned = text
    .replace(/<<<LOG>>>[\s\S]*?<<<END>>>/g, "")
    .replace(/```(?:json)?[\s\S]*?```/g, "");
  // Обрезанный ответ: блок начался, но не закрылся — отрезаем весь хвост.
  const logIdx = cleaned.indexOf("<<<LOG>>>");
  if (logIdx !== -1) cleaned = cleaned.slice(0, logIdx);
  // Незакрытый код-фенс тоже отрезаем (нечётное количество ```).
  const backticks = (cleaned.match(/```/g) ?? []).length;
  if (backticks % 2 === 1) {
    const fenceIdx = cleaned.indexOf("```");
    if (fenceIdx !== -1) cleaned = cleaned.slice(0, fenceIdx);
  }
  return cleaned.replace(/\n{3,}/g, "\n\n").trim();
}

interface CompletionResult {
  success: boolean;
  text: string;
  model?: string;
  error?: string;
}

/** Превращает сырую ошибку ИИ-провайдера в понятное сообщение на русском
 *  с подсказкой, что делать. */
function describeError(raw: string): string {
  const e = raw.toLowerCase();

  if (/не задан|ключ/.test(e) && !/invalid/.test(e)) {
    return (
      "Для работы ассистента нужен ключ ИИ: добавьте GEMINI_API_KEY (или " +
      "VLY_INTEGRATION_KEY) в переменные окружения проекта. Как только ключ " +
      "появится, ассистент заработает без изменений кода."
    );
  }
  if (/429|quota|rate.?limit|too many|exhausted|resource|лимит/.test(e)) {
    return (
      "Исчерпан дневной лимит бесплатного тарифа Gemini — это временно. " +
      "Лимит обычно обновляется раз в сутки (у flash-моделей ~1500 запросов). " +
      "Попробуйте ещё раз позже."
    );
  }
  if (
    /401|403|invalid|api.?key|permission|forbidden|unauthorized|not.?valid/.test(
      e,
    )
  ) {
    return (
      "Похоже, API-ключ недействителен. Проверьте GEMINI_API_KEY в переменных " +
      "окружения проекта: скопируйте его заново из Google AI Studio и сохраните."
    );
  }
  if (/404|not.?found/.test(e)) {
    return (
      "Выбранная модель ИИ сейчас недоступна (возможно, Google переименовал " +
      "её). Нажмите «Проверить подключение» — ассистент подберёт рабочую модель."
    );
  }
  if (
    /fetch|network|econn|timeout|dns|socket|unreachable|offline|нет связи/.test(
      e,
    )
  ) {
    return (
      "Нет связи с сервисом ИИ — возможно, временный сбой сети. Попробуйте " +
      "ещё раз через несколько секунд."
    );
  }
  return (
    `Сервис ИИ временно недоступен (${raw}). Попробуйте ещё раз или нажмите ` +
    "«Проверить подключение» в шапке чата."
  );
}

/** Один запрос к Gemini. Возвращает текст или сообщение об ошибке. */
async function geminiGenerate(
  key: string,
  model: string,
  system: string,
  contents: { role: "user" | "model"; parts: { text: string }[] }[],
  maxTokens: number,
): Promise<{ ok: boolean; text?: string; error?: string }> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": key,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents,
          generationConfig: { temperature: 0.3, maxOutputTokens: maxTokens },
        }),
      },
    );
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const err = (await res.json()) as { error?: { message?: string } };
        if (err.error?.message) detail = err.error.message;
      } catch {
        // Тело ошибки не JSON — оставляем статус.
      }
      return { ok: false, error: detail };
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text =
      data.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? "")
        .join("") ?? "";
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Вызывает Gemini с автоподбором рабочей модели. */
async function geminiChat(
  key: string,
  system: string,
  messages: { role: "user" | "assistant"; content: string }[],
): Promise<CompletionResult> {
  // Gemini ожидает чередование ролей user/model — склеиваем подряд идущие.
  const contents: { role: "user" | "model"; parts: { text: string }[] }[] = [];
  for (const m of messages) {
    const role = m.role === "assistant" ? "model" : "user";
    const last = contents[contents.length - 1];
    if (last && last.role === role) {
      last.parts[0].text += "\n\n" + m.content;
    } else {
      contents.push({ role, parts: [{ text: m.content }] });
    }
  }

  let lastError = "unknown error";
  for (const model of GEMINI_MODELS) {
    const result = await geminiGenerate(
      key,
      model,
      system,
      contents,
      MAX_OUTPUT_TOKENS,
    );
    if (result.ok) {
      return { success: true, text: result.text ?? "", model };
    }
    lastError = result.error ?? lastError;
  }
  return { success: false, text: "", error: lastError };
}

/** Вызывает модель ИИ: Gemini (GEMINI_API_KEY) или, если его нет, VLY-шлюз
 *  (VLY_INTEGRATION_KEY). Возвращает текст ответа или понятную ошибку. */
async function getCompletion(
  system: string,
  messages: { role: "user" | "assistant"; content: string }[],
): Promise<CompletionResult> {
  const geminiKey = process.env.GEMINI_API_KEY;

  if (geminiKey) {
    return geminiChat(geminiKey, system, messages);
  }

  const vlyKey = process.env.VLY_INTEGRATION_KEY;
  if (vlyKey) {
    try {
      const completion = await vly.ai.completion({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: system }, ...messages],
        temperature: 0.3,
        maxTokens: MAX_OUTPUT_TOKENS,
      });
      if (!completion.success || !completion.data) {
        return {
          success: false,
          text: "",
          error: completion.error ?? "unknown error",
        };
      }
      const text = completion.data.choices[0]?.message?.content ?? "";
      return { success: true, text };
    } catch (e) {
      return {
        success: false,
        text: "",
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  return {
    success: false,
    text: "",
    error:
      "не задан ни один ключ: добавьте GEMINI_API_KEY или VLY_INTEGRATION_KEY в переменные окружения проекта",
  };
}

/** Диагностика интеграции: какой провайдер настроен и отвечает ли он. */
export const envStatus = action({
  args: {},
  handler: async () => {
    const gemini = process.env.GEMINI_API_KEY;
    const vlyKey = process.env.VLY_INTEGRATION_KEY;

    let geminiPing: {
      ok: boolean;
      model?: string;
      error?: string;
    } | null = null;
    if (gemini) {
      const probe = await geminiChat(gemini, "Отвечай одним словом: ОК", [
        { role: "user", content: "Проверка связи" },
      ]);
      geminiPing = {
        ok: probe.success,
        model: probe.model,
        error: probe.error,
      };
    }

    return {
      provider: gemini ? "gemini" : vlyKey ? "vly" : "none",
      gemini: !!gemini,
      geminiKeyPrefix: gemini ? gemini.slice(0, 6) : null,
      geminiModels: GEMINI_MODELS,
      geminiPing,
      vly: !!vlyKey,
      vlyKeyPrefix: vlyKey ? vlyKey.slice(0, 4) : null,
      // Имена ВСЕХ переменных окружения бэкенда (без значений!) — для диагностики.
      envNames: Object.keys(process.env).sort(),
    };
  },
});

/** Проверка подключения для кнопки в чате: реальный пинг провайдера и
 *  понятный статус на русском. */
export const checkConnection = action({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Не авторизован");

    const gemini = process.env.GEMINI_API_KEY;
    const vlyKey = process.env.VLY_INTEGRATION_KEY;

    if (!gemini && !vlyKey) {
      return {
        ok: false,
        provider: "none",
        message:
          "Не задан ни один ключ ИИ. Добавьте GEMINI_API_KEY (или VLY_INTEGRATION_KEY) в переменные окружения проекта.",
      };
    }

    if (gemini) {
      const probe = await geminiChat(gemini, "Отвечай одним словом: ОК", [
        { role: "user", content: "Проверка связи" },
      ]);
      if (probe.success) {
        return {
          ok: true,
          provider: "gemini",
          model: probe.model,
          message: `Подключение работает — Gemini (${probe.model}) отвечает.`,
        };
      }
      return {
        ok: false,
        provider: "gemini",
        model: probe.model,
        message: describeError(probe.error ?? "unknown error"),
      };
    }

    // VLY-шлюз: проверяем реальным коротким запросом.
    try {
      const completion = await vly.ai.completion({
        model: "gpt-4o-mini",
        messages: [
          { role: "user", content: "Проверка связи — ответь одним словом: ОК" },
        ],
        temperature: 0,
        maxTokens: 5,
      });
      if (completion.success && completion.data) {
        return {
          ok: true,
          provider: "vly",
          message: "Подключение работает — VLY-шлюз отвечает.",
        };
      }
      return {
        ok: false,
        provider: "vly",
        message: describeError(completion.error ?? "unknown error"),
      };
    } catch (e) {
      return {
        ok: false,
        provider: "vly",
        message: describeError(e instanceof Error ? e.message : String(e)),
      };
    }
  },
});

export const chat = action({
  args: {
    messages: v.array(
      v.object({
        role: v.union(v.literal("user"), v.literal("assistant")),
        content: v.string(),
      }),
    ),
    date: v.string(),
  },
  handler: async (ctx, { messages, date }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Не авторизован");

    // Собираем контекст из данных пользователя (только его собственные записи).
    const [profile, todaysMeals, customFoods, plan] = await Promise.all([
      ctx.runQuery(api.profiles.getMyProfile),
      ctx.runQuery(api.mealLog.getByDate, { date }),
      ctx.runQuery(api.foods.listMyFoods, {}),
      ctx.runQuery(api.workouts.getMyPlan),
    ]);

    const todayTotals = (todaysMeals ?? []).reduce(
      (acc, m) => ({
        calories: acc.calories + m.calories,
        protein: acc.protein + m.protein,
        carbs: acc.carbs + m.carbs,
        fat: acc.fat + m.fat,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 },
    );

    const profileText = profile
      ? `Возраст: ${profile.age}, пол: ${profile.gender === "male" ? "мужской" : "женский"}, рост: ${profile.heightCm} см, вес: ${profile.weightKg} кг${profile.targetWeightKg ? `, целевой вес: ${profile.targetWeightKg} кг` : ""}, активность: ${profile.activityLevel}, цель: ${profile.fitnessGoal}, опыт: ${profile.experienceLevel}.`
      : "Профиль ещё не заполнен. Подскажи пользователю заполнить профиль на странице «Профиль», чтобы считать точные цели.";

    const customFoodText =
      customFoods && customFoods.length > 0
        ? customFoods
            .map(
              (f) =>
                `${f.name} — ${f.calories} ккал, Б ${f.protein} г, У ${f.carbs} г, Ж ${f.fat} г (на ${f.amount} ${f.unit})`,
            )
            .join("\n")
        : "Нет своих продуктов.";

    // План тренировок: антропометрическая адаптация + цикл прогрессии нагрузки.
    const planText = plan
      ? `${plan.name}${plan.adaptedFor ? ` · адаптация: ${plan.adaptedFor}` : ""}:\n` +
        (plan.weeks && plan.weeks.length > 0
          ? `Цикл прогрессии ${plan.weeks.length} недели: ` +
            plan.weeks
              .map(
                (w) =>
                  `${w.week}-я — ${w.label.replace(/^Неделя \d+ · /, "")}${w.weightNote ? ` (${w.weightNote})` : ""}`,
              )
              .join("; ") +
            ".\n"
          : "Базовый недельный план (без цикла прогрессии).\n") +
        plan.days
          .slice()
          .sort((a, b) => a.day - b.day)
          .map(
            (d) =>
              `День ${d.day + 1} («${d.focus}»): ${d.exercises
                .map(
                  (e) =>
                    `${e.name} ${e.sets}×${e.reps}${e.priority ? " [приоритет для этого телосложения]" : ""}${e.weightNote ? ` (${e.weightNote})` : ""}`,
                )
                .join("; ")}` +
              (d.notes && d.notes.length
                ? ` — заметки: ${d.notes.join(" ")}`
                : ""),
          )
          .join("\n")
      : "План тренировок ещё не сгенерирован.";

    const foodRef = FOOD_LIBRARY.map(
      (f) =>
        `${f.name} — ${f.calories} ккал, Б ${f.protein} г, У ${f.carbs} г, Ж ${f.fat} г (на 100 г)`,
    ).join("\n");

    const system = `Ты — «Кило», встроенный ИИ-ассистент фитнес-приложения для подсчёта калорий и тренировок.

ОТВЕЧАЙ ТОЛЬКО НА РУССКОМ. Будь краток, по делу, с цифрами. НЕ размышляй вслух, не пиши промежуточных соображений и рассуждений — сразу выдавай финальный ответ пользователю. Ты видишь данные пользователя и можешь ВНОСИТЬ записи в его дневник — для этого возвращай специальный JSON-блок.

ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ:
${profileText}

СВОИ ПРОДУКТЫ ПОЛЬЗОВАТЕЛЯ:
${customFoodText}

ПЛАН ТРЕНИРОВОК ПОЛЬЗОВАТЕЛЯ (сгенерирован с учётом его роста и телосложения, с циклом прогрессии нагрузки):
${planText}

Если пользователь спрашивает про тренировки или упражнения — объясняй, почему выбраны именно эти упражнения и какие замены сделаны под его рост/телосложение (смотри «заметки» в плане), и подсказывай прогрессию: на 2-й неделе те же веса и +1 повтор, на 3-й — +2.5 кг к рабочим весам, на 4-й — разгрузка (−20% веса). Не выдумывай упражнения, которых нет в плане.

ЗАПИСАНО СЕГОДНЯ (${date}):
- Калории: ${todayTotals.calories} ккал
- Белки: ${todayTotals.protein} г, Углеводы: ${todayTotals.carbs} г, Жиры: ${todayTotals.fat} г

СПРАВОЧНИК ПРОДУКТОВ (макросы на 100 г, используй их для расчёта КБЖУ):
${foodRef}

КАК ВНОСИТЬ ЗАПИСИ: когда пользователь сообщает, что съел или выпил, выведи JSON-блок, а после него — короткое подтверждение текстом на русском (например: «Записал: 500 г шашлыка — 950 ккал»).

JSON-блок всегда начинай с <<<LOG>>> и ОБЯЗАТЕЛЬНО полностью закрывай <<<END>>> — никогда не обрывай его на середине:

<<<LOG>>>
{"action":"logMeal","mealType":"breakfast","items":[{"name":"Овсянка","quantity":50,"calories":195,"protein":8.5,"carbs":33,"fat":3.5}]}
<<<END>>>

Правила для logMeal:
- mealType — одно из: breakfast, lunch, dinner, snack (завтрак/обед/ужин/перекус).
- calories/protein/carbs/fat — ИТОГО за указанное количество (посчитай по справочнику, масштабируя на 100 г).
- quantity — количество в граммах или штуках, число.
- Если продукта нет в справочнике, возьми типичные значения из общих знаний.
- Можно вернуть несколько items в одном блоке.

Когда пользователь сообщает о тренировке (упражнения, подходы, повторы, вес):

<<<LOG>>>
{"action":"logWorkout","workoutName":"Силовая тренировка","exercises":[{"name":"Жим лёжа","sets":3,"reps":10,"weightKg":40}]}
<<<END>>>

Правила для logWorkout: name — название упражнения, sets — подходы, reps — повторения, weightKg — рабочий вес в кг (0, если только вес тела). workoutName — короткое название тренировки.

Когда пользователь сообщает свой вес:

<<<LOG>>>
{"action":"logWeight","weightKg":72.5}
<<<END>>>

ВАЖНО:
- ВСЕГДА используй сегодняшнюю дату ${date} для записей.
- Отвечай только на русском языке, даже если пользователь пишет иначе.
- Не выдумывай данные профиля. Если пользователь не заполнил профиль — предложи заполнить.
- Если данных не хватает (например, неизвестно количество еды), спроси уточняющий вопрос вместо записи.
- Никогда не выводи JSON-блок, если пользователь просто задаёт вопрос.`;

    const completion = await getCompletion(system, messages);

    if (!completion.success) {
      return {
        reply: describeError(completion.error ?? "unknown error"),
        logged: [],
        error: true,
      };
    }

    const text = completion.text;
    const logged: { kind: string; label: string }[] = [];
    const logJson = extractLogBlock(text);

    if (logJson) {
      try {
        const parsed = JSON.parse(logJson) as Record<string, unknown>;
        const actionName = String(parsed.action ?? "");

        if (actionName === "logMeal") {
          const items = Array.isArray(parsed.items) ? parsed.items : [];
          if (items.length > 0) {
            const mealType = toMealType(parsed.mealType);
            const entries = items.map((item) => {
              const obj = (item ?? {}) as Record<string, unknown>;
              return {
                date,
                mealType: mealType as "breakfast" | "lunch" | "dinner" | "snack",
                name: asString(obj.name, "Продукт"),
                quantity: clampNum(obj.quantity, 1, 5000, 1),
                calories: clampNum(obj.calories, 0, 5000, 0),
                protein: clampNum(obj.protein, 0, 500, 0),
                carbs: clampNum(obj.carbs, 0, 500, 0),
                fat: clampNum(obj.fat, 0, 500, 0),
              };
            });
            await ctx.runMutation(api.mealLog.addEntries, { entries });
            const totalCal = entries.reduce((s, e) => s + e.calories, 0);
            logged.push({
              kind: "meals",
              label: `В дневник добавлено: ${entries.length} поз. · ${totalCal} ккал`,
            });
          }
        }

        if (actionName === "logWorkout") {
          const exercises = Array.isArray(parsed.exercises)
            ? parsed.exercises
            : [];
          if (exercises.length > 0) {
            const mapped = exercises.map((ex) => {
              const obj = (ex ?? {}) as Record<string, unknown>;
              return {
                name: asString(obj.name, "Упражнение"),
                sets: clampNum(obj.sets, 1, 50, 3),
                reps: clampNum(obj.reps, 1, 500, 10),
                weightKg: clampNum(obj.weightKg, 0, 1000, 0),
              };
            });
            await ctx.runMutation(api.workouts.logWorkout, {
              date,
              workoutName: asString(parsed.workoutName, "Тренировка"),
              exercises: mapped,
            });
            logged.push({
              kind: "workout",
              label: `Тренировка записана: ${mapped.length} упр.`,
            });
          }
        }

        if (actionName === "logWeight") {
          const weightKg = clampNum(parsed.weightKg, 20, 500, 0);
          if (weightKg > 0) {
            await ctx.runMutation(api.weightEntries.addWeight, {
              date,
              weightKg,
            });
            logged.push({ kind: "weight", label: `Вес записан: ${weightKg} кг` });
          }
        }
      } catch {
        // Невалидный JSON от модели — просто показываем текст ответа.
      }
    }

    return { reply: stripLogBlock(text), logged };
  },
});
