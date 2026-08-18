/**
 * Юнит-тесты чистого диспетчера Telegram-бота (src/lib/telegram/bot.ts):
 * нормализация апдейтов, команды, инлайн-кнопки и флоу «поиск → порция →
 * добавить». BotDeps мокается фейком — Convex и Telegram API не нужны.
 */
import { describe, expect, it, vi } from "vitest";
import {
  handleUpdate,
  normalizeUpdate,
  type BotDeps,
  type BotOp,
  type ChatState,
  type NormalizedUpdate,
  type SearchFood,
} from "./bot";

const FOODS: SearchFood[] = [
  { key: "Курица", name: "Курица", unit: "г", servingGrams: 100, calories: 165, protein: 31, carbs: 0, fat: 3.6 },
  { key: "Куриная грудка", name: "Куриная грудка", unit: "г", servingGrams: 150, calories: 110, protein: 23, carbs: 0, fat: 1.2 },
  { key: "Творог 5%", name: "Творог 5%", unit: "г", servingGrams: 200, calories: 121, protein: 17, carbs: 3, fat: 5 },
  { key: "Яйцо", name: "Яйцо", unit: "шт", servingGrams: 60, calories: 155, protein: 13, carbs: 1, fat: 11 },
];

interface FakeDeps extends BotDeps {
  state: Map<number, ChatState>;
}

function makeDeps(overrides: Partial<BotDeps> = {}): FakeDeps {
  const state = new Map<number, ChatState>();
  const deps: BotDeps = {
    findUserByTelegram: vi.fn(async () => ({ userId: "u1" })),
    linkByCode: vi.fn(
      async (): Promise<{ ok: boolean; error?: string }> => ({ ok: true }),
    ),
    unlinkByTelegram: vi.fn(async () => ({ linked: true })),
    getDaySummary: vi.fn(async () => ({
      calories: 1320,
      caloriesTarget: 2145,
      protein: 82,
      proteinTarget: 152,
      carbs: 150,
      carbsTarget: 245,
      fat: 45,
      fatTarget: 60,
      waterMl: 1250,
      waterTarget: 2500,
    })),
    searchFoods: vi.fn(async (query: string) =>
      FOODS.filter((f) => f.name.toLowerCase().includes(query.toLowerCase())),
    ),
    getRecentFoods: vi.fn(async () => [
      { ...FOODS[0], grams: 150 },
      { ...FOODS[2], grams: 200 },
    ]),
    addMealEntry: vi.fn(async (_userId, _food, grams) => ({
      grams,
      calories: 248,
      protein: 46,
      carbs: 0,
      fat: 5,
    })),
    addWater: vi.fn(async (_userId, amountMl) => ({
      totalMl: 1250 + amountMl,
      goalMl: 2500,
    })),
    getTodayWorkout: vi.fn(async () => ({
      focus: "Жим/Тяга/Ноги",
      approxMinutes: 60,
      exercises: [
        { name: "Жим лёжа", sets: 4, reps: "8-10", last: "70×8", advice: "72.5 кг × 8–10" },
      ],
    })),
    getChatState: vi.fn(async (chatId: number) => state.get(chatId) ?? null),
    setChatState: vi.fn(async (chatId: number, s: ChatState) => {
      state.set(chatId, s);
    }),
    clearChatState: vi.fn(async (chatId: number) => {
      state.delete(chatId);
    }),
    lookupUserNameByCode: vi.fn(async () => "Тестер"),
    ...overrides,
  };
  return { ...deps, state };
}

const msg = (text: string, fromId = 1, chatId = 1): NormalizedUpdate => ({
  updateId: 1,
  kind: "message",
  chatId,
  from: { id: fromId, username: "tester" },
  text,
});

const callback = (
  data: string,
  fromId = 1,
  chatId = 1,
  messageId = 5,
): NormalizedUpdate => ({
  updateId: 1,
  kind: "callback",
  chatId,
  from: { id: fromId, username: "tester" },
  callbackData: data,
  callbackQueryId: "cq1",
  callbackMessageId: messageId,
});

function sendOp(ops: BotOp[]): BotOp {
  const op = ops.find((o) => o.op === "sendMessage");
  if (!op || op.op !== "sendMessage") throw new Error("Нет sendMessage");
  return op;
}

function sendText(ops: BotOp[]): string {
  const op = sendOp(ops);
  return op.op === "sendMessage" ? op.text : "";
}

/**
 * Telegram parse_mode=HTML принимает только ограниченный набор тегов
 * (<b>/<i>/<a>/<code>/<pre>/<tg-spoiler> и т.п.); любой другой `<...>`
 * роняет sendMessage с 400 «Unsupported start tag», а вебхук молча
 * глотает ошибку — пользователь не видит вообще ничего.
 * Проверяем: после удаления разрешённых тегов в тексте не остаётся
 * ни одного `<` или `>`.
 */
function expectHtmlSafe(text: string): void {
  const withoutTags = text.replace(
    /<\/?(?:b|strong|i|em|u|ins|s|strike|del|code|pre|tg-spoiler|a)(?:\s[^>]*)?>/gi,
    "",
  );
  expect(withoutTags).not.toMatch(/[<>]/);
}

describe("normalizeUpdate", () => {
  it("парсит текстовое сообщение", () => {
    const u = normalizeUpdate({
      update_id: 7,
      message: { message_id: 1, chat: { id: 42 }, from: { id: 9, username: "a" }, text: "/start" },
    });
    expect(u).toEqual({
      updateId: 7,
      kind: "message",
      chatId: 42,
      from: { id: 9, username: "a" },
      text: "/start",
      messageId: 1,
    });
  });

  it("парсит callback_query", () => {
    const u = normalizeUpdate({
      update_id: 8,
      callback_query: {
        id: "q1",
        from: { id: 9 },
        data: "water:250",
        message: { message_id: 3, chat: { id: 42 } },
      },
    });
    expect(u).toEqual({
      updateId: 8,
      kind: "callback",
      chatId: 42,
      from: { id: 9 },
      callbackData: "water:250",
      callbackQueryId: "q1",
      callbackMessageId: 3,
    });
  });

  it("игнорирует мусор и сообщения без текста", () => {
    expect(normalizeUpdate(null)).toBeNull();
    expect(normalizeUpdate({})).toBeNull();
    expect(
      normalizeUpdate({ update_id: 1, message: { message_id: 1, chat: { id: 1 }, from: { id: 1 }, sticker: {} } }),
    ).toBeNull();
  });
});

describe("/start и привязка", () => {
  it("без привязки показывает инструкцию по коду", async () => {
    const deps = makeDeps({ findUserByTelegram: vi.fn(async () => null) });
    const ops = await handleUpdate(msg("/start"), deps);
    const text = sendText(ops);
    expect(text).toContain("привяжите аккаунт");
    expect(text).toContain("/link");
  });

  it("с привязкой показывает меню с кнопками", async () => {
    const deps = makeDeps();
    const ops = await handleUpdate(msg("/start"), deps);
    const text = sendText(ops);
    expect(text).toContain("Аккаунт привязан");
    expect(text).toContain("/day");
    const op = sendOp(ops);
    expect(op.op === "sendMessage" && op.buttons).toBeTruthy();
  });

  it("/link без кода подсказывает формат", async () => {
    const deps = makeDeps();
    const ops = await handleUpdate(msg("/link"), deps);
    expect(sendText(ops)).toContain("/link ABC123");
  });

  it("/link с кодом показывает подтверждение", async () => {
    const linkByCode = vi.fn(async () => ({ ok: true }));
    const deps = makeDeps({ linkByCode });
    const ops = await handleUpdate(msg("/link AbC123"), deps);
    // Confirmation flow: linkByCode is NOT called yet.
    expect(linkByCode).not.toHaveBeenCalled();
    expect(sendText(ops)).toContain("Вы привязываете Telegram");
    expect(sendText(ops)).toContain("Тестер");
    // State saved for confirmation.
    expect(deps.state.get(1)).toMatchObject({ kind: "link_confirm", code: "ABC123" });
  });

  it("/link с пустым кодом просит ввести код", async () => {
    const deps = makeDeps();
    const ops = await handleUpdate(msg("/link"), deps);
    expect(sendText(ops)).toContain("Отправьте код привязки");
  });
});

describe("HTML-безопасность сообщений (parse_mode=HTML)", () => {
  it("/start без привязки экранирует <код> (иначе Telegram 400 и тишина)", async () => {
    const deps = makeDeps({ findUserByTelegram: vi.fn(async () => null) });
    const ops = await handleUpdate(msg("/start"), deps);
    const text = sendText(ops);
    expect(text).toContain("&lt;код&gt;");
    expect(text).not.toContain("<код>");
    expectHtmlSafe(text);
  });

  it("все ключевые команды шлют HTML-безопасный текст", async () => {
    const deps = makeDeps({ findUserByTelegram: vi.fn(async () => null) });
    for (const command of ["/start", "/help", "/link", "/menu"]) {
      const ops = await handleUpdate(msg(command), deps);
      expectHtmlSafe(sendText(ops));
    }
  });
});

describe("обычный текст = поиск еды", () => {
  it("без привязки просит привязать аккаунт", async () => {
    const deps = makeDeps({ findUserByTelegram: vi.fn(async () => null) });
    const ops = await handleUpdate(msg("курица"), deps);
    expect(sendText(ops)).toContain("привяжите аккаунт");
  });

  it("с привязкой ищет и показывает список", async () => {
    const deps = makeDeps();
    const ops = await handleUpdate(msg("курица"), deps);
    const text = sendText(ops);
    expect(text).toContain("Курица");
    expect(text).toContain("165 ккал");
  });
});

describe("/day", () => {
  it("показывает калории, белок и остаток белка", async () => {
    const deps = makeDeps();
    const ops = await handleUpdate(msg("/day"), deps);
    const text = sendText(ops);
    expect(text).toContain((1320).toLocaleString("ru-RU"));
    expect(text).toContain((2145).toLocaleString("ru-RU"));
    expect(text).toContain("Белок");
    expect(text).toContain("осталось <b>70 г</b>");
    expect(text).toContain("Вода");
  });

  it("без профиля объясняет, что нужно заполнить профиль", async () => {
    const deps = makeDeps({ getDaySummary: vi.fn(async () => null) });
    const ops = await handleUpdate(msg("/day"), deps);
    expect(sendText(ops)).toContain("Профиль ещё не заполнен");
  });
});

describe("вода", () => {
  it("/water показывает текущий итог и кнопки", async () => {
    const deps = makeDeps();
    const ops = await handleUpdate(msg("/water"), deps);
    const text = sendText(ops);
    expect(text).toContain((1250).toLocaleString("ru-RU"));
    expect(text).toContain((2500).toLocaleString("ru-RU"));
  });

  it("кнопка +250 добавляет воду и правит сообщение", async () => {
    const addWater = vi.fn(async (_userId: string, amountMl: number) => ({
      totalMl: 1250 + amountMl,
      goalMl: 2500,
    }));
    const deps = makeDeps({ addWater });
    const ops = await handleUpdate(callback("water:250"), deps);
    expect(addWater).toHaveBeenCalledWith("u1", 250);
    const edit = ops.find((o) => o.op === "editMessage");
    expect(edit).toBeTruthy();
    if (edit && edit.op === "editMessage") {
      expect(edit.messageId).toBe(5);
      expect(edit.text).toContain((1500).toLocaleString("ru-RU"));
    }
  });
});

describe("флоу еды: поиск → порция → добавить", () => {
  it("/meal с запросом показывает результаты и сохраняет состояние", async () => {
    const deps = makeDeps();
    const ops = await handleUpdate(msg("/meal курица"), deps);
    const text = sendText(ops);
    expect(text).toContain("1. Курица");
    const state = deps.state.get(1);
    expect(state?.kind).toBe("meal_search");
  });

  it("выбор продукта открывает порцию с кнопками −/+", async () => {
    const deps = makeDeps();
    await handleUpdate(msg("/meal курица"), deps);
    const ops = await handleUpdate(callback("meal_pick:0"), deps);
    const edit = ops.find((o) => o.op === "editMessage");
    expect(edit).toBeTruthy();
    if (edit && edit.op === "editMessage") {
      expect(edit.text).toContain("Курица");
      expect(edit.text).toContain("165 ккал");
      expect(edit.buttons?.[0]?.map((b) => b.text)).toEqual(["−50", "100 г", "+50"]);
    }
    expect(deps.state.get(1)?.kind).toBe("meal_portion");
  });

  it("+50 меняет порцию на 150 г", async () => {
    const deps = makeDeps();
    await handleUpdate(msg("/meal курица"), deps);
    await handleUpdate(callback("meal_pick:0"), deps);
    const ops = await handleUpdate(callback("meal_gram:+50"), deps);
    const edit = ops.find((o) => o.op === "editMessage");
    if (edit && edit.op === "editMessage") {
      expect(edit.text).toContain("150 г");
      expect(edit.text).toContain("248 ккал");
    }
  });

  it("✅ Добавить логирует еду, чистит состояние и подтверждает", async () => {
    const addMealEntry = vi.fn(async (_userId: string, food: SearchFood, grams: number) => ({
      grams,
      calories: 248,
      protein: 46,
      carbs: 0,
      fat: 5,
    }));
    const deps = makeDeps({ addMealEntry });
    await handleUpdate(msg("/meal курица"), deps);
    await handleUpdate(callback("meal_pick:0"), deps);
    const ops = await handleUpdate(callback("meal_add"), deps);
    expect(addMealEntry).toHaveBeenCalledWith("u1", expect.objectContaining({ name: "Курица" }), 100);
    expect(sendText(ops)).toContain("Добавлено: Курица 100 г");
    expect(sendText(ops)).toContain("248 ккал");
    expect(deps.state.get(1)).toBeUndefined();
  });

  it("🔙 Назад возвращает к списку", async () => {
    const deps = makeDeps();
    await handleUpdate(msg("/meal курица"), deps);
    await handleUpdate(callback("meal_pick:0"), deps);
    const ops = await handleUpdate(callback("meal_back"), deps);
    const edit = ops.find((o) => o.op === "editMessage");
    if (edit && edit.op === "editMessage") {
      expect(edit.text).toContain("1. Курица");
    }
  });

  it("после истечения состояния просит начать заново", async () => {
    const deps = makeDeps();
    const ops = await handleUpdate(callback("meal_pick:0"), deps);
    expect(ops).toHaveLength(1);
    expect(ops[0].op).toBe("answerCallback");
  });
});

describe("недавнее", () => {
  it("/recent показывает список и повторяет запись", async () => {
    const addMealEntry = vi.fn(async (_userId: string, food: SearchFood, grams: number) => ({
      grams,
      calories: 248,
      protein: 46,
      carbs: 0,
      fat: 5,
    }));
    const deps = makeDeps({ addMealEntry });
    const ops = await handleUpdate(msg("/recent"), deps);
    const text = sendText(ops);
    expect(text).toContain("Курица");
    expect(text).toContain("Творог 5%");

    const ops2 = await handleUpdate(callback("recent_pick:0"), deps);
    expect(addMealEntry).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ name: "Курица" }),
      150,
    );
    expect(sendText(ops2)).toContain("Добавлено: Курица 150 г");
  });
});

describe("тренировка", () => {
  it("/today показывает фокус и рекомендацию", async () => {
    const deps = makeDeps();
    const ops = await handleUpdate(msg("/today"), deps);
    const text = sendText(ops);
    expect(text).toContain("Жим/Тяга/Ноги");
    expect(text).toContain("Жим лёжа");
    expect(text).toContain("70×8");
    expect(text).toContain("72.5 кг × 8–10");
  });

  it("без плана подсказывает собрать его в приложении", async () => {
    const deps = makeDeps({ getTodayWorkout: vi.fn(async () => null) });
    const ops = await handleUpdate(msg("/today"), deps);
    expect(sendText(ops)).toContain("соберите план");
  });
});

describe("кнопки меню", () => {
  it("callback 'day' присылает итог дня", async () => {
    const deps = makeDeps();
    const ops = await handleUpdate(callback("day"), deps);
    expect(ops.some((o) => o.op === "answerCallback")).toBe(true);
    expect(sendText(ops)).toContain("Итог дня");
  });

  it("callback без аккаунта отвечает отказом", async () => {
    const deps = makeDeps({ findUserByTelegram: vi.fn(async () => null) });
    const ops = await handleUpdate(callback("water:250"), deps);
    const answer = ops.find((o) => o.op === "answerCallback");
    expect(answer && answer.op === "answerCallback" && answer.text).toContain(
      "привяжите аккаунт",
    );
  });

  it("неизвестная команда показывает справку", async () => {
    const deps = makeDeps();
    const ops = await handleUpdate(msg("/foobar"), deps);
    expect(sendText(ops)).toContain("Не знаю такой команды");
  });
});
