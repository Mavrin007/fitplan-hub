/**
 * Юнит-тесты хендлера assistant.chat (src/convex/assistant.ts) без
 * Convex-рантайма: замоканы рантайм-импорты (auth, api, vly, fetch).
 *
 * Проверяем серверный барьер квоты (limited=true, провайдер НЕ вызывается),
 * внешние вызовы обоих провайдеров (Gemini через fetch, VLY через
 * vly.ai.completion), запись logMeal/logWorkout/logWeight из JSON-блока
 * модели, санитизацию ответа и понятную ошибку при отсутствии ключей.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@convex-dev/auth/server", () => ({ getAuthUserId: vi.fn() }));
vi.mock("../lib/vly-integrations", () => ({
  vly: { ai: { completion: vi.fn() } },
}));

const { checkAndConsume } = vi.hoisted(() => ({
  checkAndConsume: vi.fn(),
}));
vi.mock("./_generated/api", () => ({
  api: {
    profiles: { getMyProfile: {} },
    mealLog: { getByDate: {}, addEntries: {} },
    foods: { listMyFoods: {} },
    workouts: { getMyPlan: {}, logWorkout: {} },
    weightEntries: { addWeight: {} },
  },
  internal: { assistantLimits: { checkAndConsume } },
}));

import { ConvexError } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { vly } from "../lib/vly-integrations";
import { chat } from "./assistant";

/** Внутренние мутации (checkAndConsume) — реальные vi.fn; публичные рефы
 *  (api.*) — не функции, их вызовы просто записываем. */
const runMutationImpl = async (fn: unknown, args: unknown) =>
  typeof fn === "function" ? (fn as (a: unknown) => unknown)(args) : undefined;

type ChatArgs = { messages: { role: "user" | "assistant"; content: string }[]; date: string };

type ChatResult = {
  reply: string;
  logged: { kind: string; label: string }[];
  error: boolean;
  limited: boolean;
  remaining?: number;
};

type ChatCtx = {
  runMutation: ReturnType<typeof vi.fn>;
  runQuery: ReturnType<typeof vi.fn>;
};

const runChat = (
  chat as unknown as {
    _handler: (ctx: ChatCtx, args: ChatArgs) => Promise<ChatResult>;
  }
)._handler;

const PROFILE = {
  age: 30,
  gender: "male",
  heightCm: 180,
  weightKg: 85,
  targetWeightKg: null,
  activityLevel: "moderate",
  fitnessGoal: "fat_loss",
  experienceLevel: "beginner",
};

/** Фейковый ctx: runQuery отдаёт фикстуры по порядку вызовов, runMutation
 *  исполняет внутренние мутации (vi.fn) и записывает публичные. */
function makeCtx(queries: unknown[] = [PROFILE, [], [], null]): ChatCtx {
  const runQuery = vi.fn(async () => queries.shift());
  const runMutation = vi.fn(runMutationImpl);
  return { runQuery, runMutation };
}

/** Вызовы runMutation, относящиеся к записи данных (не к квоте). */
function dataMutations(ctx: ChatCtx) {
  return ctx.runMutation.mock.calls
    .map((c) => c[1] as Record<string, unknown>)
    .filter((args) =>
      ["entries", "exercises", "weightKg"].some((k) => k in args),
    );
}

const vlyCompletion = vly.ai.completion as unknown as ReturnType<typeof vi.fn>;

function vlyResolve(content: string) {
  vlyCompletion.mockResolvedValue({
    success: true,
    data: { choices: [{ message: { content } }] },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  (getAuthUserId as ReturnType<typeof vi.fn>).mockResolvedValue("user-1");
});

afterEach(() => {
  // Гигиена: глобальные стабы (fetch) и спайки (console.error) не должны
  // утекать в следующие тесты, даже если ассерт упал раньше ручного restore.
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("квота ассистента (барьер ДО вызова провайдера)", () => {
  it("без сессии бросает «Не авторизован» ещё до квоты", async () => {
    (getAuthUserId as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(
      runChat(makeCtx(), { messages: [], date: "2026-08-07" }),
    ).rejects.toThrow(/Не авторизован/);
    expect(checkAndConsume).not.toHaveBeenCalled();
  });

  it("на успешном пути квота списывается с (userId, estimatedTokens)", async () => {
    checkAndConsume.mockResolvedValue({ remaining: 29 });
    vi.stubEnv("VLY_INTEGRATION_KEY", "vly-key");
    vlyResolve("Ок.");

    await runChat(makeCtx(), { messages: [], date: "2026-08-07" });

    // runMutation вызывает внутреннюю мутацию с единым объектом args.
    expect(checkAndConsume).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        estimatedTokens: expect.any(Number),
      }),
    );
  });

  it("исчерпанная дневная квота → limited=true, провайдер не вызывается", async () => {
    checkAndConsume.mockRejectedValue(
      new ConvexError({
        code: "assistant_limit_reached",
        message: "Дневной лимит ассистента исчерпан (30 сообщений).",
        remaining: 0,
      }),
    );
    vi.stubEnv("VLY_INTEGRATION_KEY", "vly-key");

    const ctx = makeCtx();
    const res = await runChat(ctx, { messages: [], date: "2026-08-07" });

    expect(res.limited).toBe(true);
    expect(res.error).toBe(true);
    expect(res.remaining).toBe(0);
    expect(res.reply).toMatch(/Дневной лимит ассистента исчерпан/);
    // Провайдер не дёргался — кредиты не потрачены.
    expect(vlyCompletion).not.toHaveBeenCalled();
    // Контекст пользователя даже не собирался.
    expect(ctx.runQuery).not.toHaveBeenCalled();
  });

  it("исчерпанная квота токенов → limited=true с сообщением про токены", async () => {
    checkAndConsume.mockRejectedValue(
      new ConvexError({
        code: "assistant_token_limit_reached",
        message: "Исчерпан дневной лимит токенов ассистента.",
        remaining: 0,
      }),
    );
    vi.stubEnv("VLY_INTEGRATION_KEY", "vly-key");

    const res = await runChat(makeCtx(), { messages: [], date: "2026-08-07" });
    expect(res.limited).toBe(true);
    expect(res.reply).toMatch(/лимит токенов/);
    expect(vlyCompletion).not.toHaveBeenCalled();
  });

  it("анти-спам (слишком часто) → limited=true без remaining", async () => {
    checkAndConsume.mockRejectedValue(
      new ConvexError({
        code: "assistant_rate_limited",
        message: "Слишком быстро — подождите 2 с",
        remaining: 29,
        retryAfterSec: 2,
      }),
    );
    vi.stubEnv("VLY_INTEGRATION_KEY", "vly-key");

    const res = await runChat(makeCtx(), { messages: [], date: "2026-08-07" });
    expect(res.limited).toBe(true);
    expect(res.remaining).toBeUndefined();
    expect(res.reply).toMatch(/Слишком быстро/);
    expect(vlyCompletion).not.toHaveBeenCalled();
  });

  it("неизвестная ошибка квоты не блокирует чат (история продолжается)", async () => {
    checkAndConsume.mockRejectedValue(new Error("boom"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("VLY_INTEGRATION_KEY", "vly-key");
    vlyResolve("Привет! Чем помочь?");

    const res = await runChat(makeCtx(), { messages: [], date: "2026-08-07" });
    expect(res.error).toBe(false);
    expect(res.reply).toBe("Привет! Чем помочь?");
    expect(vlyCompletion).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalled();
    // Восстанавливаем сразу, а не полагаясь только на afterEach.
    consoleSpy.mockRestore();
  });
});

describe("внешние вызовы ИИ-провайдеров", () => {
  it("VLY-шлюз: vly.ai.completion вызывается с системным промптом и историей", async () => {
    checkAndConsume.mockResolvedValue({ remaining: 29 });
    vi.stubEnv("VLY_INTEGRATION_KEY", "vly-key");
    vlyResolve("Ваша норма — 2200 ккал.");

    const res = await runChat(makeCtx(), {
      messages: [{ role: "user", content: "Сколько мне калорий?" }],
      date: "2026-08-07",
    });

    expect(res.error).toBe(false);
    expect(res.reply).toBe("Ваша норма — 2200 ккал.");
    expect(vlyCompletion).toHaveBeenCalledTimes(1);
    const call = vlyCompletion.mock.calls[0][0] as {
      messages: { role: string; content: string }[];
    };
    expect(call.messages[0].role).toBe("system");
    // Пользовательские данные отделены от инструкций разделом USER_DATA.
    expect(call.messages[0].content).toMatch(/USER_DATA:ПРОФИЛЬ/);
    expect(call.messages[0].content).toMatch(/недоверенные данные/);
    // История диалога передана следом.
    expect(call.messages).toContainEqual({
      role: "user",
      content: "Сколько мне калорий?",
    });
  });

  it("Gemini: fetch вызывается с x-goog-api-key, ответ берётся из candidates", async () => {
    checkAndConsume.mockResolvedValue({ remaining: 29 });
    vi.stubEnv("GEMINI_API_KEY", "gemini-key");
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "Вам нужно 2000 ккал." }] } }],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await runChat(makeCtx(), { messages: [], date: "2026-08-07" });

    expect(res.error).toBe(false);
    expect(res.reply).toBe("Вам нужно 2000 ккал.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { headers: Record<string, string> },
    ];
    expect(url).toMatch(/generativelanguage\.googleapis\.com/);
    expect(init.headers["x-goog-api-key"]).toBe("gemini-key");
    expect(vlyCompletion).not.toHaveBeenCalled();
  });

  it("ошибка провайдера → понятный ответ на русском (error=true)", async () => {
    checkAndConsume.mockResolvedValue({ remaining: 29 });
    vi.stubEnv("VLY_INTEGRATION_KEY", "vly-key");
    vlyCompletion.mockResolvedValue({
      success: false,
      error: "429 Quota exceeded",
    });

    const res = await runChat(makeCtx(), { messages: [], date: "2026-08-07" });
    expect(res.error).toBe(true);
    expect(res.limited).toBe(false);
    expect(res.reply).toMatch(/дневной лимит/);
  });

  it("нет ни одного ключа → понятная подсказка, без внешних вызовов", async () => {
    checkAndConsume.mockResolvedValue({ remaining: 29 });
    const res = await runChat(makeCtx(), { messages: [], date: "2026-08-07" });

    expect(res.error).toBe(true);
    expect(res.reply).toMatch(/GEMINI_API_KEY/);
    expect(vlyCompletion).not.toHaveBeenCalled();
  });
});

describe("запись данных из JSON-блока модели", () => {
  it("logMeal: КБЖУ считаются сервером из источника/оценки, модель их не передаёт", async () => {
    checkAndConsume.mockResolvedValue({ remaining: 29 });
    vi.stubEnv("VLY_INTEGRATION_KEY", "vly-key");
    // Команда БЕЗ макросов: питательная ценность определяется приложением.
    vlyResolve([
      "Записал: 500 г шашлыка.",
      "<<<LOG>>>",
      '{"action":"logMeal","mealType":"обед","items":[{"name":"Шашлык","quantity":500}]}',
      "<<<END>>>",
    ].join("\n"));

    const ctx = makeCtx();
    const res = await runChat(ctx, { messages: [], date: "2026-08-07" });

    const dataCalls = dataMutations(ctx);
    expect(dataCalls).toHaveLength(1);
    const args = dataCalls[0] as { entries: Record<string, unknown>[] };
    expect(args.entries).toEqual([
      expect.objectContaining({
        date: "2026-08-07",
        mealType: "lunch", // русский «обед» приведён к валидному значению
        name: "Шашлык",
        quantity: 500,
        // КБЖУ посчитаны сервером (детерминированная оценка: 250 ккал/100 г
        // для шашлыка × 500 г = 1250 ккал) и помечены как оценка ИИ.
        calories: 1250,
        protein: 125,
        nutritionSource: "ai_estimate",
      }),
    ]);
    expect(res.logged).toEqual([
      expect.objectContaining({
        kind: "meals",
        label: expect.stringContaining("1250 ккал"),
      }),
    ]);
    expect(res.reply).toContain("Записал: 500 г шашлыка");
    expect(res.reply).not.toContain("<<<LOG>>>");
  });

  it("logMeal: модель не может передать КБЖУ (запрещённые поля отклоняются, БД не меняется)", async () => {
    checkAndConsume.mockResolvedValue({ remaining: 29 });
    vi.stubEnv("VLY_INTEGRATION_KEY", "vly-key");
    // Попытка обойти границу: модель кладёт калории/белки прямо в items.
    vlyResolve(
      "<<<LOG>>>\n" +
        '{"action":"logMeal","mealType":"lunch","items":[{"name":"Курица","quantity":150,"calories":300,"protein":40}]}\n' +
        "<<<END>>>\nЗаписал.",
    );

    const ctx = makeCtx();
    const res = await runChat(ctx, { messages: [], date: "2026-08-07" });

    // БД не тронута: addEntries не вызывался ни в первый раз, ни в ретрае
    // (тот же невалидный ответ).
    expect(dataMutations(ctx)).toHaveLength(0);
    expect(res.error).toBe(false);
  });

  it("logWorkout: тренировка уходит в workouts.logWorkout", async () => {
    checkAndConsume.mockResolvedValue({ remaining: 29 });
    vi.stubEnv("VLY_INTEGRATION_KEY", "vly-key");
    vlyResolve(
      "<<<LOG>>>\n" +
        '{"action":"logWorkout","workoutName":"Силовая","exercises":[{"name":"Жим лёжа","sets":3,"reps":10,"weightKg":40}]}\n' +
        "<<<END>>>\nТренировка записана.",
    );

    const ctx = makeCtx();
    const res = await runChat(ctx, { messages: [], date: "2026-08-07" });

    const calls = dataMutations(ctx) as { workoutName?: string }[];
    expect(calls).toContainEqual(
      expect.objectContaining({
        workoutName: "Силовая",
        exercises: [{ name: "Жим лёжа", sets: 3, reps: 10, weightKg: 40 }],
      }),
    );
    expect(res.logged).toEqual([
      expect.objectContaining({ kind: "workout" }),
    ]);
  });

  it("logWeight: вес уходит в weightEntries.addWeight", async () => {
    checkAndConsume.mockResolvedValue({ remaining: 29 });
    vi.stubEnv("VLY_INTEGRATION_KEY", "vly-key");
    vlyResolve(
      "<<<LOG>>>\n{\"action\":\"logWeight\",\"weightKg\":72.5}\n<<<END>>>\nВес записан.",
    );

    const ctx = makeCtx();
    const res = await runChat(ctx, { messages: [], date: "2026-08-07" });

    expect(dataMutations(ctx)).toContainEqual(
      expect.objectContaining({ date: "2026-08-07", weightKg: 72.5 }),
    );
    expect(res.logged).toEqual([
      expect.objectContaining({ kind: "weight", label: "Вес записан: 72.5 кг" }),
    ]);
  });

  it("невалидный JSON от модели не ломает ответ (блок игнорируется)", async () => {
    checkAndConsume.mockResolvedValue({ remaining: 29 });
    vi.stubEnv("VLY_INTEGRATION_KEY", "vly-key");
    vlyResolve("Ответ без валидного блока: <<<LOG>>>\n{битый json");

    const ctx = makeCtx();
    const res = await runChat(ctx, { messages: [], date: "2026-08-07" });

    expect(res.error).toBe(false);
    // Квота проверена (это норма), но в данные ничего не записано.
    expect(dataMutations(ctx)).toHaveLength(0);
    expect(res.reply).toBe("Ответ без валидного блока:");
  });
});
