"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { api, internal } from "./_generated/api";
import { vly } from "../lib/vly-integrations";
import {
  AI_REQUEST_TIMEOUT_MS,
  AI_TOTAL_BUDGET_MS,
  MAX_OUTPUT_TOKENS,
  describeError,
  estimateTokens,
  extractLogBlock,
  stripLogBlock,
  withTimeout,
} from "../lib/assistantCore";
import { geminiGenerateContent, type GeminiMessage } from "../lib/geminiClient";
import {
  parseCommandJson,
  type AssistantCommand,
} from "./assistant/commands";
import {
  resolveOrEstimate,
  scalePortion,
  quantityToStore,
  type ResolvedNutrition,
} from "./assistant/nutrition";
import { buildSystemPrompt } from "./assistant/prompt";
import { ErrorCode } from "./errors";

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

/* ------------------------------------------------------------------ */
/* Исполнение команд (доменные сервисы, а не произвольная запись)     */
/* ------------------------------------------------------------------ */

/** Минимальный ctx действия, нужный исполнителям команд. */
interface ChatCtx {
  runMutation(fn: unknown, args: unknown): Promise<unknown>;
  runQuery(fn: unknown, args?: unknown): Promise<unknown>;
}

/** Детерминированный хэш (djb2) для idempotency-ключа команды ассистента. */
function hashString(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

/** Безопасное логирование ошибки ассистента (без промптов и данных). */
function logAssistantError(kind: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err ?? "unknown");
  // Сообщение может содержать данные — обрезаем до безопасного префикса.
  console.error(`[assistant] ${kind}: ${msg.slice(0, 300)}`);
}

/** Пытается отследить событие аналитики (никогда не ломает чат). */
async function trackSafe(
  ctx: ChatCtx,
  name: string,
  meta: Record<string, string | number | boolean>,
): Promise<void> {
  try {
    await ctx.runMutation(api.analytics.track, { name, meta });
  } catch {
    // Аналитика best-effort: ошибка не должна влиять на ответ.
  }
}

/** Разрешает КБЖУ одного item команды logMeal и собирает запись дневника. */
function resolveMealItem(
  item: { name: string; quantity: number; unit?: string },
  customFoods: CustomFoodLike[],
): { nutrition: ResolvedNutrition; macros: { calories: number; protein: number; carbs: number; fat: number }; quantity: number } {
  const nutrition = resolveOrEstimate(item.name, customFoods);
  const macros = scalePortion(
    nutrition,
    item.quantity,
    (item.unit ?? undefined) as QuantityUnitArg,
  );
  const quantity = quantityToStore(nutrition, item.quantity, (item.unit ?? undefined) as QuantityUnitArg);
  return { nutrition, macros, quantity };
}

type QuantityUnitArg = "г" | "g" | "шт" | "serving" | "piece" | undefined;

/** Форма своего продукта, принимаемая nutrition-модулем. */
type CustomFoodLike = {
  name: string;
  amount: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  _id?: string;
};

/** Исполняет команду logMeal: серверное разрешение продуктов + запись. */
async function executeLogMeal(
  ctx: ChatCtx,
  command: Extract<AssistantCommand, { action: "logMeal" }>,
  args: { date: string },
  idemKey: string,
  customFoods: CustomFoodLike[],
): Promise<{ kind: string; label: string }[]> {
  const mealType =
    (command.mealType as "breakfast" | "lunch" | "dinner" | "snack" | undefined) ?? "snack";

  const entries = command.items.map((item) => {
    const { nutrition, macros, quantity } = resolveMealItem(item, customFoods);
    return {
      date: args.date,
      mealType,
      name: nutrition.name,
      quantity,
      calories: macros.calories,
      protein: macros.protein,
      carbs: macros.carbs,
      fat: macros.fat,
      nutritionSource: nutrition.source,
      sourceId: nutrition.sourceId,
    };
  });

  const estimates = entries.filter((e) => e.nutritionSource === "ai_estimate");
  try {
    await ctx.runMutation(api.mealLog.addEntries, {
      entries,
      idempotencyKey: idemKey,
    });
  } catch (err) {
    // Повторная отправка того же сообщения (ретрай) — запись уже была.
    const data = (err as { data?: { code?: string } }).data;
    if (data?.code === ErrorCode.DUPLICATE_REQUEST) {
      return [{ kind: "meals", label: "Уже записано ранее (повтор не создан)" }];
    }
    throw err;
  }

  const totalCal = entries.reduce((s, e) => s + e.calories, 0);
  const estimateNote =
    estimates.length > 0
      ? ` · ${estimates.length} поз. оценены приблизительно`
      : "";
  await trackSafe(ctx, "assistant_command_success", {
    command: "logMeal",
    items: entries.length,
    estimates: estimates.length,
  });
  return [
    {
      kind: "meals",
      label: `В дневник добавлено: ${entries.length} поз. · ${totalCal} ккал${estimateNote}`,
    },
  ];
}

/** Исполняет команду logWorkout. */
async function executeLogWorkout(
  ctx: ChatCtx,
  command: Extract<AssistantCommand, { action: "logWorkout" }>,
  args: { date: string },
  idemKey: string,
): Promise<{ kind: string; label: string }[]> {
  const mapped = command.exercises.map((ex) => ({
    name: ex.name,
    sets: ex.sets,
    reps: ex.reps,
    weightKg: ex.weightKg,
    ...(ex.rpe !== undefined ? { rpe: ex.rpe } : {}),
  }));
  try {
    await ctx.runMutation(api.workouts.logWorkout, {
      date: args.date,
      workoutName: command.workoutName ?? "Тренировка",
      exercises: mapped,
      idempotencyKey: idemKey,
    });
  } catch (err) {
    const data = (err as { data?: { code?: string } }).data;
    if (data?.code === ErrorCode.DUPLICATE_REQUEST) {
      return [{ kind: "workout", label: "Уже записано ранее (повтор не создан)" }];
    }
    throw err;
  }
  await trackSafe(ctx, "assistant_command_success", {
    command: "logWorkout",
    exercises: mapped.length,
  });
  return [{ kind: "workout", label: `Тренировка записана: ${mapped.length} упр.` }];
}

/** Исполняет команду logWeight. */
async function executeLogWeight(
  ctx: ChatCtx,
  command: Extract<AssistantCommand, { action: "logWeight" }>,
  args: { date: string },
  idemKey: string,
): Promise<{ kind: string; label: string }[]> {
  try {
    await ctx.runMutation(api.weightEntries.addWeight, {
      date: args.date,
      weightKg: command.weightKg,
      idempotencyKey: idemKey,
    });
  } catch (err) {
    const data = (err as { data?: { code?: string } }).data;
    if (data?.code === ErrorCode.DUPLICATE_REQUEST) {
      return [{ kind: "weight", label: "Вес уже записан ранее" }];
    }
    throw err;
  }
  await trackSafe(ctx, "assistant_command_success", { command: "logWeight" });
  return [{ kind: "weight", label: `Вес записан: ${command.weightKg} кг` }];
}

/** Исполняет команду logWater. */
async function executeLogWater(
  ctx: ChatCtx,
  command: Extract<AssistantCommand, { action: "logWater" }>,
  args: { date: string },
  idemKey: string,
): Promise<{ kind: string; label: string }[]> {
  try {
    await ctx.runMutation(api.water.addWater, {
      date: args.date,
      amountMl: command.amountMl,
      idempotencyKey: idemKey,
    });
  } catch (err) {
    const data = (err as { data?: { code?: string } }).data;
    if (data?.code === ErrorCode.DUPLICATE_REQUEST) {
      return [{ kind: "water", label: "Вода уже записана ранее" }];
    }
    throw err;
  }
  await trackSafe(ctx, "assistant_command_success", { command: "logWater" });
  return [{ kind: "water", label: `Вода записана: ${command.amountMl} мл` }];
}

/** Разбирает команду из ответа модели и исполняет её через доменные сервисы. */
async function handleCommandBlock(
  ctx: ChatCtx,
  userId: string,
  text: string,
  args: { date: string },
  customFoods: CustomFoodLike[],
): Promise<{ logged: { kind: string; label: string }[]; rejected: boolean; rejectedReason?: string }> {
  const block = extractLogBlock(text);
  if (!block) return { logged: [], rejected: false };

  const result = parseCommandJson(block);
  if (!result.ok) {
    // Безопасно логируем причину (код + тип, без данных пользователя).
    console.warn(
      `[assistant] command rejected: ${result.code}${result.message ? ` — ${result.message.slice(0, 120)}` : ""}`,
    );
    await trackSafe(ctx, "assistant_command_rejected", {
      reason: result.code,
    });
    return {
      logged: [],
      rejected: true,
      rejectedReason: result.message,
    };
  }

  const command = result.command;
  // Idempotency-ключ: один запрос = один ключ. Повторная отправка того же
  // сообщения (ретрай клиента) не создаст дубликат.
  const idemKey = `assistant:${userId}:${args.date}:${hashString(
    JSON.stringify(command),
  )}`;

  const logged: { kind: string; label: string }[] = [];
  try {
    switch (command.action) {
      case "logMeal":
        logged.push(...(await executeLogMeal(ctx, command, args, idemKey, customFoods)));
        break;
      case "logWorkout":
        logged.push(...(await executeLogWorkout(ctx, command, args, idemKey)));
        break;
      case "logWeight":
        logged.push(...(await executeLogWeight(ctx, command, args, idemKey)));
        break;
      case "logWater":
        logged.push(...(await executeLogWater(ctx, command, args, idemKey)));
        break;
    }
  } catch (err) {
    logAssistantError("command execution failed", err);
    // Ошибка исполнения (лимит, валидация сервера) — не валим чат, сообщаем.
    throw new Error("Не удалось записать данные. Попробуйте ещё раз.");
  }

  return { logged, rejected: false };
}

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
    try {
      await ctx.runMutation(internal.assistantLimits.checkAndConsume, {
        userId,
        estimatedTokens: estimateTokens(messages.map((m) => m.content)),
      });
    } catch (err) {
      const data = (err as { data?: { code?: string; message?: string } }).data;
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
      console.error("[assistant] limit check failed:", err);
    }

    // Компактный контекст: только необходимые данные (не вся БД).
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

    const lastUserMessage =
      [...messages].reverse().find((m) => m.role === "user")?.content ?? "";

    const system = buildSystemPrompt({
      date,
      profile,
      todayTotals,
      plan,
      customFoods: customFoods ?? [],
      lastUserMessage,
    });

    const completion = await getCompletion(system, messages);

    if (!completion.success) {
      return {
        reply: describeError(completion.error ?? "unknown error"),
        logged: [],
        error: true,
        limited: false,
      };
    }

    let text = completion.text;
    let logged: { kind: string; label: string }[] = [];

    const customFoodsLike: CustomFoodLike[] = (customFoods ?? []).map((f) => ({
      name: f.name,
      amount: f.amount,
      unit: f.unit,
      calories: f.calories,
      protein: f.protein,
      carbs: f.carbs,
      fat: f.fat,
      _id: f._id,
    }));

    // Исполнение команды: сбой записи (лимит, серверная валидация) не валит
    // чат целиком — возвращаем понятный ответ с error=true.
    let rejected: { reason: string } | null = null;
    try {
      const result = await handleCommandBlock(ctx, userId, text, { date }, customFoodsLike);
      logged = result.logged;
      if (result.rejected && result.rejectedReason) {
        rejected = { reason: result.rejectedReason };
      }
    } catch (err) {
      logAssistantError("command execution failed", err);
      return {
        reply: "Не удалось записать данные — попробуйте ещё раз.",
        logged: [],
        error: true,
        limited: false,
      };
    }

    // Один повтор запроса с уточнением, если модель вернула невалидную команду:
    // дешёвый способ «починить» формат, не сжигая квоту повторно.
    if (rejected) {
      const retrySystem =
        system +
        "\n\nВАЖНО: предыдущий JSON-блок был отклонён строгой валидацией (" +
        rejected.reason.slice(0, 200) +
        "). Верни ТОЛЬКО валидную команду по схеме выше. Не добавляй КБЖУ в items. Если не уверен — не выводи блок вообще.";
      const retry = await getCompletion(retrySystem, messages);
      if (retry.success) {
        try {
          const retryResult = await handleCommandBlock(
            ctx,
            userId,
            retry.text,
            { date },
            customFoodsLike,
          );
          if (!retryResult.rejected) {
            logged = retryResult.logged;
            text = retry.text;
            await trackSafe(ctx, "assistant_command_corrected", {
              reason: rejected.reason.slice(0, 100),
            });
          }
        } catch (err) {
          logAssistantError("retry execution failed", err);
        }
      }
    }

    await trackSafe(ctx, "assistant_message", {
      hasCommand: logged.length > 0,
    });

    return {
      reply: stripLogBlock(text),
      logged,
      error: false,
      limited: false,
    };
  },
});
