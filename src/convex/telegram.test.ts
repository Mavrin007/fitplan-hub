/**
 * Юнит-тесты Convex-слоя Telegram (src/convex/telegram.ts) без рантайма:
 * общий фейковый ctx.db (src/test/convex-db-mock.ts) + мокнутый
 * getAuthUserId; хендлеры дёргаются напрямую через `_handler`.
 *
 * Покрываем серверную защиту: одноразовость и срок жизни кодов, запрет
 * привязки чужого Telegram к другому аккаунту, и полный флоу processBotUpdate
 * (день, вода, еда) через реальный слой БД.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@convex-dev/auth/server", () => ({ getAuthUserId: vi.fn() }));

import { getAuthUserId } from "@convex-dev/auth/server";
import {
  linkByCode,
  myLink,
  processBotUpdate,
  requestLinkCode,
  unlink,
} from "./telegram";
import {
  errorMessage,
  makeConvexDb,
  mockAuth,
  type ConvexDbMock,
} from "@/test/convex-db-mock";
import { toDateKey } from "../lib/dates";
import type { BotOp } from "../lib/telegram/bot";

type Ctx = { db: ConvexDbMock };

const runRequestLinkCode = (
  requestLinkCode as unknown as {
    _handler: (
      ctx: Ctx,
      args: {},
    ) => Promise<{ code: string; expiresAt: number }>;
  }
)._handler;

const runMyLink = (
  myLink as unknown as {
    _handler: (
      ctx: Ctx,
      args: {},
    ) => Promise<{
      username: string | null;
      firstName: string | null;
      linkedAt: number;
    } | null>;
  }
)._handler;

const runUnlink = (
  unlink as unknown as {
    _handler: (ctx: Ctx, args: {}) => Promise<void>;
  }
)._handler;

const runLinkByCode = (
  linkByCode as unknown as {
    _handler: (
      ctx: Ctx,
      args: {
        code: string;
        telegramUserId: number;
        username?: string;
        firstName?: string;
        chatId?: number;
      },
    ) => Promise<{ linked: boolean; username: string | null }>;
  }
)._handler;

/** ctx processBotUpdate: db + runMutation (для linkByCode из deps). */
type BotCtx = Ctx & {
  runMutation: () => Promise<never>;
};

const runProcessBotUpdate = (
  processBotUpdate as unknown as {
    _handler: (ctx: BotCtx, args: { update: unknown }) => Promise<BotOp[]>;
  }
)._handler;

/** Типовый профиль, чтобы day/water имели цели. */
function seedProfile(db: ConvexDbMock, userId = "u1"): void {
  db.insert("profiles", {
    userId,
    age: 30,
    gender: "male",
    heightCm: 180,
    weightKg: 80,
    activityLevel: "moderate",
    fitnessGoal: "lose_weight",
    experienceLevel: "intermediate",
    updatedAt: 0,
  });
}

/** Привязанный аккаунт Telegram (как если бы пользователь уже прошёл /link). */
function seedTelegram(db: ConvexDbMock, userId = "u1", telegramUserId = 111): void {
  db.insert("telegramAccounts", {
    telegramUserId,
    userId,
    username: "tester",
    linkedAt: 1,
  });
}

describe("requestLinkCode", () => {
  beforeEach(() => {
    mockAuth(getAuthUserId);
  });

  it("без сессии кидает ошибку", async () => {
    mockAuth(getAuthUserId, "anonymous");
    const { db } = makeConvexDb();
    await expect(runRequestLinkCode({ db }, {})).rejects.toThrow();
  });

  it("генерирует код из 6 символов и сохраняет его", async () => {
    const { db, store } = makeConvexDb();
    const res = await runRequestLinkCode({ db }, {});
    expect(res.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(store.linkCodes).toHaveLength(1);
    expect(store.linkCodes[0]).toMatchObject({
      userId: "user-1",
      code: res.code,
    });
  });

  it("перевыпускает код: старый удаляется", async () => {
    const { db, store } = makeConvexDb();
    const first = await runRequestLinkCode({ db }, {});
    const second = await runRequestLinkCode({ db }, {});
    expect(second.code).not.toBe(first.code);
    expect(store.linkCodes).toHaveLength(1);
  });
});

describe("myLink / unlink", () => {
  beforeEach(() => {
    mockAuth(getAuthUserId);
  });

  it("возвращает null без привязки", async () => {
    const { db } = makeConvexDb();
    await expect(runMyLink({ db }, {})).resolves.toBeNull();
  });

  it("возвращает данные привязки", async () => {
    const { db } = makeConvexDb();
    seedTelegram(db, "user-1", 111);
    const res = await runMyLink({ db }, {});
    expect(res).toMatchObject({ username: "tester" });
  });

  it("unlink удаляет привязку", async () => {
    const { db, store } = makeConvexDb();
    seedTelegram(db, "user-1", 111);
    await runUnlink({ db }, {});
    expect(store.telegramAccounts).toHaveLength(0);
  });
});

describe("linkByCode", () => {
  beforeEach(() => {
    mockAuth(getAuthUserId);
  });

  const seedCode = (
    db: ConvexDbMock,
    code = "ABC123",
    expiresAt = Date.now() + 60_000,
  ) => {
    db.insert("linkCodes", { userId: "u1", code, expiresAt, createdAt: Date.now() });
    return code;
  };

  it("привязывает Telegram по коду и удаляет код", async () => {
    const { db, store } = makeConvexDb();
    seedCode(db, "ABC123");
    const res = await runLinkByCode(
      { db },
      { code: "abc123", telegramUserId: 111, username: "vasya", chatId: 5 },
    );
    expect(res).toEqual({ linked: true, username: "vasya" });
    expect(store.telegramAccounts).toHaveLength(1);
    expect(store.telegramAccounts[0]).toMatchObject({
      userId: "u1",
      telegramUserId: 111,
      username: "vasya",
      chatId: 5,
    });
    expect(store.linkCodes).toHaveLength(0);
  });

  it("не находит код — ошибка", async () => {
    const { db } = makeConvexDb();
    await expect(
      errorMessage(() => runLinkByCode({ db }, { code: "ZZZZZZ", telegramUserId: 1 })),
    ).resolves.toContain("Код не найден");
  });

  it("истёкший код отклоняется", async () => {
    const { db } = makeConvexDb();
    seedCode(db, "ABC123", Date.now() - 1000);
    await expect(
      errorMessage(() => runLinkByCode({ db }, { code: "ABC123", telegramUserId: 1 })),
    ).resolves.toContain("Код истёк");
  });

  it("Telegram, привязанный к другому аккаунту, отклоняется", async () => {
    const { db, store } = makeConvexDb();
    seedTelegram(db, "u2", 111); // чужой аккаунт u2
    seedCode(db);
    await expect(
      errorMessage(() => runLinkByCode({ db }, { code: "ABC123", telegramUserId: 111 })),
    ).resolves.toContain("уже привязан");
    // Код одноразовый даже при неудаче — вторая попытка невозможна.
    expect(store.linkCodes).toHaveLength(0);
  });

  it("повторная привязка того же аккаунта обновляет метаданные", async () => {
    const { db, store } = makeConvexDb();
    seedTelegram(db, "u1", 111);
    seedCode(db);
    await runLinkByCode(
      { db },
      { code: "ABC123", telegramUserId: 111, username: "new_name" },
    );
    expect(store.telegramAccounts).toHaveLength(1);
    expect(store.telegramAccounts[0].username).toBe("new_name");
  });
});

describe("processBotUpdate (end-to-end через БД)", () => {
  beforeEach(() => {
    mockAuth(getAuthUserId);
  });

  const ctxOf = (db: ConvexDbMock): BotCtx => ({
    db,
    runMutation: () => Promise.reject(new Error("не должно вызываться")),
  });

  const sendTextOf = (ops: BotOp[]): string => {
    const send = ops.find((o) => o.op === "sendMessage");
    return send && send.op === "sendMessage" ? send.text : "";
  };

  it("игнорирует мусорные апдейты", async () => {
    const { db } = makeConvexDb();
    await expect(runProcessBotUpdate(ctxOf(db), { update: { foo: 1 } })).resolves.toEqual([]);
  });

  it("/day собирает итог из mealLog, профиля и воды", async () => {
    const { db } = makeConvexDb();
    seedProfile(db);
    const today = toDateKey(new Date());
    db.insert("mealLog", {
      userId: "u1",
      date: today,
      mealType: "lunch",
      name: "Курица",
      quantity: 1.5,
      calories: 500,
      protein: 60,
      carbs: 30,
      fat: 10,
      createdAt: 1,
    });
    db.insert("mealLog", {
      userId: "u1",
      date: today,
      mealType: "breakfast",
      name: "Овсянка",
      quantity: 1,
      calories: 400,
      protein: 20,
      carbs: 60,
      fat: 8,
      createdAt: 2,
    });
    db.insert("waterEntries", {
      userId: "u1",
      date: today,
      amountMl: 1000,
      createdAt: 1,
    });
    seedTelegram(db);

    const ops = await runProcessBotUpdate(
      ctxOf(db),
      {
        update: {
          update_id: 1,
          message: {
            message_id: 10,
            chat: { id: 5 },
            from: { id: 111, username: "tester" },
            text: "/day",
          },
        },
      },
    );
    const text = sendTextOf(ops);
    expect(text).toContain("900"); // 500 + 400 ккал
    expect(text).toContain("Белок");
    expect(text).toContain("80"); // 60 + 20 белка
    expect(text).toContain("Вода");
  });

  it("кнопка воды +250 обновляет waterEntries", async () => {
    const { db, store } = makeConvexDb();
    seedProfile(db);
    seedTelegram(db);
    db.insert("waterEntries", {
      userId: "u1",
      date: toDateKey(new Date()),
      amountMl: 1000,
      createdAt: 1,
    });

    const ops = await runProcessBotUpdate(
      ctxOf(db),
      {
        update: {
          update_id: 2,
          callback_query: {
            id: "q1",
            from: { id: 111 },
            data: "water:250",
            message: { message_id: 5, chat: { id: 5 } },
          },
        },
      },
    );
    expect(ops.find((o) => o.op === "editMessage")).toBeTruthy();
    expect(store.waterEntries[0].amountMl).toBe(1250);
  });

  it("флоу еды: поиск → порция → добавить создаёт запись в mealLog", async () => {
    const { db, store } = makeConvexDb();
    seedProfile(db);
    seedTelegram(db);

    const searchOps = await runProcessBotUpdate(
      ctxOf(db),
      {
        update: {
          update_id: 1,
          message: {
            message_id: 10,
            chat: { id: 5 },
            from: { id: 111, username: "tester" },
            text: "творог",
          },
        },
      },
    );
    expect(sendTextOf(searchOps)).toContain("Творог");

    // Выбираем первый результат.
    await runProcessBotUpdate(
      ctxOf(db),
      {
        update: {
          update_id: 2,
          callback_query: {
            id: "q1",
            from: { id: 111 },
            data: "meal_pick:0",
            message: { message_id: 10, chat: { id: 5 } },
          },
        },
      },
    );
    // Добавляем базовую порцию.
    await runProcessBotUpdate(
      ctxOf(db),
      {
        update: {
          update_id: 3,
          callback_query: {
            id: "q2",
            from: { id: 111 },
            data: "meal_add",
            message: { message_id: 10, chat: { id: 5 } },
          },
        },
      },
    );

    expect(store.mealLog).toHaveLength(1);
    expect(store.mealLog[0]).toMatchObject({
      userId: "u1",
      name: expect.stringContaining("Творог"),
    });
    expect(store.telegramStates).toHaveLength(0); // состояние очищено
  });
});
