"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { api, internal } from "./_generated/api";
import { vly } from "../lib/vly-integrations";
import { FOOD_LIBRARY } from "../lib/mealLibrary";
import {
  AI_REQUEST_TIMEOUT_MS,
  AI_TOTAL_BUDGET_MS,
  MAX_OUTPUT_TOKENS,
  asString,
  clampNum,
  describeError,
  estimateTokens,
  extractLogBlock,
  stripLogBlock,
  toMealType,
  withTimeout,
} from "../lib/assistantCore";
import { geminiGenerateContent, type GeminiMessage } from "../lib/geminiClient";

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-flash-latest";

/** Кандидаты моделей: основной + запасные (перебираются до первого успеха). */
const GEMINI_MODELS = [
  GEMINI_MODEL,
  "gemini-flash-latest",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
].filter((m, i, arr) => m && arr.indexOf(m) === i);

interface CompletionResult {
  success: boolean;
  text: string;
  model?: string;
  error?: string;
}

/** Вызывает Gemini с автоподбором рабочей модели. */
async function geminiChat(
  key: string,
  system: string,
  messages: { role: "user" | "assistant"; content: string }[],
): Promise<CompletionResult> {
  // Gemini ожидает чередование ролей user/model — склеиваем подряд идущие.
  const contents: GeminiMessage[] = [];
  for (const m of messages) {
    const role = m.role === "assistant" ? "model" : "user";
    const last = contents[contents.length - 1];
    if (last && last.role === role) {
      last.parts[0].text = (last.parts[0].text ?? "") + "\n\n" + m.content;
    } else {
      contents.push({ role, parts: [{ text: m.content }] });
    }
  }

  let lastError = "unknown error";
  // Общий бюджет: оставшееся время передаётся каждой попытке, чтобы цикл
  // автоподбора моделей не превысил дедлайн всего ответа (Convex обрывает
  // action на 120с — пользователь не должен упираться в этот лимит).
  const deadline = Date.now() + AI_TOTAL_BUDGET_MS;
  for (const model of GEMINI_MODELS) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    const result = await geminiGenerateContent(
      key,
      model,
      system,
      contents,
      MAX_OUTPUT_TOKENS,
      // Таймаут попытки не длиннее оставшегося бюджета.
      Math.min(AI_REQUEST_TIMEOUT_MS, remaining),
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
      // VLY-шлюз: свой таймаут через Promise.race (vly.ai.completion не
      // принимает signal) — зависший шлюз не вешает чат.
      const completion = await withTimeout(
        vly.ai.completion({
          model: "gpt-4o-mini",
          messages: [{ role: "system", content: system }, ...messages],
          temperature: 0.3,
          maxTokens: MAX_OUTPUT_TOKENS,
        }),
        AI_TOTAL_BUDGET_MS,
      );
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
  handler: async (ctx, { messages, date }): Promise<{
    reply: string;
    logged: { kind: string; label: string }[];
    error: boolean;
    limited: boolean;
    remaining?: number;
  }> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Не авторизован");

    // Дневная квота (сообщения + токены) и анти-спам интервал. Проверяем ДО
    // вызова ИИ-провайдера: исчерпанный лимит не тратит кредиты Gemini/VLY.
    // estimatedTokens — консервативная оценка «сколько мы собираемся сжечь»
    // (вход: system + история + реплики; выход: полный бюджет ответа), чтобы
    // дорогой разговор с длинной историей исчерпывал квоту раньше, чем 30
    // коротких сообщений. Ошибка ConvexError приходит с кодом — превращаем
    // в понятный ответ UI (limited: true). internalMutation доступен только
    // через `internal` (public-фильтр `api` его скрывает — это и есть
    // серверный барьер квоты).
    try {
      await ctx.runMutation(internal.assistantLimits.checkAndConsume, {
        userId,
        estimatedTokens: estimateTokens(
          // Системный промпт уже учтён константой SYSTEM_PROMPT_ESTIMATE_TOKENS
          // внутри estimateTokens — здесь только история диалога.
          messages.map((m) => m.content),
        ),
      });
    } catch (err) {
      const data = (err as { data?: { code?: string; message?: string } })
        .data;
      const code = data?.code;
      const message = data?.message;
      if (code === "assistant_limit_reached") {
        return {
          reply: message ?? "Дневной лимит ассистента исчерпан.",
          logged: [],
          error: true,
          limited: true,
          remaining: 0,
        };
      }
      if (code === "assistant_token_limit_reached") {
        return {
          reply: message ?? "Исчерпан дневной лимит токенов ассистента.",
          logged: [],
          error: true,
          limited: true,
          remaining: 0,
        };
      }
      if (code === "assistant_rate_limited") {
        return {
          reply: message ?? "Слишком часто — попробуйте через несколько секунд.",
          logged: [],
          error: true,
          limited: true,
        };
      }
      // Любая другая ошибка лимита — не блокируем чат, но и не списываем.
      console.error("[assistant] limit check failed:", err);
    }

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
        limited: false,
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

    return { reply: stripLogBlock(text), logged, error: false, limited: false };
  },
});
