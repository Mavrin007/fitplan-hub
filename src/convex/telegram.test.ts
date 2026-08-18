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

vi.mock("@convex-dev/auth/server", () => ({
  getAuthUserId: vi.fn(),
  // telegram.ts импортирует ./schema, а он тянет authTables — заглушка
  // (как в остальных convex-тестах).
  authTables: {},
}));

import { getAuthUserId } from "@convex-dev/auth/server";
import {
  createAccountFromTelegram,
  findByTelegram,
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
      args: Record<string, never>,
    ) => Promise<{ code: string; expiresAt: number }>;
  }
)._handler;

const runMyLink = (
  myLink as unknown as {
    _handler: (
      ctx: Ctx,
      args: Record<string, never>,
    ) => Promise<{
      username: string | null;
      firstName: string | null;
      linkedAt: number;
      lastActiveAt: number | null;
    } | null>;
  }
)._handler;

const runUnlink = (
  unlink as unknown as {
    _handler: (ctx: Ctx, args: Record<string, never>) => Promise<void>;
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

const runFindByTelegram = (
  findByTelegram as unknown as {
    _handler: (
      ctx: Ctx,
      args: { telegramUserId: number },
    ) => Promise<{ userId: string } | null>;
  }
)._handler;

const runCreateAccountFromTelegram = (
  createAccountFromTelegram as unknown as {
    _handler: (
      ctx: Ctx,
      args: {
        telegramUserId: number;
        firstName?: string;
        username?: string;
      },
    ) => Promise<string>;
  }
)._handler;

/** ctx processBotUpdate: db + runMutation (для linkByCode из deps). */
type BotCtx = Ctx & {
  runMutation: (
    _api: unknown,
    _args?: unknown,
  ) => Promise<unknown>;
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
    lastActiveAt: 100,
  });
}

describe("findByTelegram", () => {
  it("возвращает null, если Telegram не привязан", async () => {
    const { db } = makeConvexDb();
    const res = await runFindByTelegram({ db }, { telegramUserId: 999 });
    expect(res).toBeNull();
  });

  it("возвращает userId привязанного аккаунта", async () => {
    const { db } = makeConvexDb();
    seedTelegram(db, "u1", 111);
    const res = await runFindByTelegram({ db }, { telegramUserId: 111 });
    expect(res).toEqual({ userId: "u1" });
  });
});

describe("createAccountFromTelegram", () => {
  it("создаёт пользователя и привязывает Telegram", async () => {
    const { db, store } = makeConvexDb();
    const userId = await runCreateAccountFromTelegram(
      { db },
      { telegramUserId: 555, firstName: "Иван", username: "ivan_tg" },
    );

    expect(typeof userId).toBe("string");
    const users = store["users"];
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
      name: "Иван",
      isAnonymous: false,
    });
    const links = store["telegramAccounts"];
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      telegramUserId: 555,
      userId,
      username: "ivan_tg",
      firstName: "Иван",
    });
  });

  it("повторный вызов с тем же telegram id не плодит аккаунты", async () => {
    const { db, store } = makeConvexDb();
    const first = await runCreateAccountFromTelegram(
      { db },
      { telegramUserId: 555, firstName: "Иван" },
    );
    const second = await runCreateAccountFromTelegram(
      { db },
      { telegramUserId: 555, firstName: "Иван" },
    );

    expect(second).toBe(first);
    expect(store["users"]).toHaveLength(1);
    expect(store["telegramAccounts"]).toHaveLength(1);
  });
});

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

  it("возвращает данные привязки и активность", async () => {
    const { db } = makeConvexDb();
    seedTelegram(db, "user-1", 111);
    const res = await runMyLink({ db }, {});
    expect(res).toMatchObject({
      username: "tester",
      linkedAt: 1,
      lastActiveAt: 100,
    });
  });

  it("lastActiveAt отсутствует у старых привязок (мягкая миграция)", async () => {
    const { db } = makeConvexDb();
    db.insert("telegramAccounts", {
      telegramUserId: 222,
      userId: "user-1",
      username: "old",
      linkedAt: 1,
    });
    const res = await runMyLink({ db }, {});
    expect(res).toMatchObject({ username: "old" });
    expect(res?.lastActiveAt).toBeNull();
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
    expect(typeof store.telegramAccounts[0].lastActiveAt).toBe("number");
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

  it("replay protection: повторный апдейт с тем же update_id не выполняется", async () => {
    const { db, store } = makeConvexDb();
    seedProfile(db);
    seedTelegram(db);
    const update = {
      update_id: 42,
      message: {
        message_id: 10,
        chat: { id: 5 },
        from: { id: 111, username: "tester" },
        text: "творог",
      },
    };
    const first = await runProcessBotUpdate(ctxOf(db), { update });
    expect(sendTextOf(first)).toContain("Творог");
    expect(store.telegramProcessedUpdates).toHaveLength(1);
    // Повторная доставка того же update_id (Telegram ретраит при сбоях) —
    // мутация не выполняется второй раз.
    const second = await runProcessBotUpdate(ctxOf(db), { update });
    expect(second).toEqual([]);
    expect(store.telegramProcessedUpdates).toHaveLength(1);
  });

  it("/link: спрашивает подтверждение и привязывает только после него", async () => {
    const { db, store } = makeConvexDb();
    // Аккаунт, к которому ведёт код, + пользователь с именем для подтверждения.
    db.insert("users", { name: "Иван", role: "user", isAnonymous: false });
    const userRow = store.users[0];
    db.insert("linkCodes", {
      userId: userRow._id as string,
      code: "ABC123",
      expiresAt: Date.now() + 60_000,
      createdAt: Date.now(),
    });

    // Шаг 1: /link ABC123 → сообщение-подтверждение, привязки ещё нет.
    const ask = await runProcessBotUpdate(ctxOf(db), {
      update: {
        update_id: 10,
        message: {
          message_id: 1,
          chat: { id: 5 },
          from: { id: 111, username: "tester" },
          text: "/link ABC123",
        },
      },
    });
    const askText = sendTextOf(ask);
    expect(askText).toContain("Вы привязываете Telegram");
    expect(askText).toContain("Иван");
    expect(store.telegramAccounts).toHaveLength(0);
    expect(store.telegramStates[0]).toMatchObject({
      chatId: 5,
      state: { kind: "link_confirm", code: "ABC123", tgUserId: 111 },
    });

    // Шаг 2: кнопка «Да» → привязка выполняется через linkByCode.
    const runLink = (
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
    const linkCtx: BotCtx = {
      db,
      runMutation: async (_api: unknown, args: unknown) =>
        runLink(
          { db },
          args as {
            code: string;
            telegramUserId: number;
            username?: string;
            firstName?: string;
            chatId?: number;
          },
        ),
    };
    const confirm = await runProcessBotUpdate(linkCtx, {
      update: {
        update_id: 11,
        callback_query: {
          id: "q1",
          from: { id: 111, username: "tester" },
          data: "link_confirm",
          message: { message_id: 1, chat: { id: 5 } },
        },
      },
    });
    expect(sendTextOf(confirm)).toContain("Аккаунт привязан");
    expect(store.telegramAccounts).toHaveLength(1);
    expect(store.telegramAccounts[0]).toMatchObject({
      userId: userRow._id as string,
      telegramUserId: 111,
      username: "tester",
    });
    expect(typeof store.telegramAccounts[0].lastActiveAt).toBe("number");
    expect(store.linkCodes).toHaveLength(0); // код одноразовый — израсходован
    expect(store.telegramStates).toHaveLength(0);
  });

  it("/link: отмена не привязывает", async () => {
    const { db, store } = makeConvexDb();
    db.insert("users", { name: "Иван", role: "user", isAnonymous: false });
    const userRow = store.users[0];
    db.insert("linkCodes", {
      userId: userRow._id as string,
      code: "ABC123",
      expiresAt: Date.now() + 60_000,
      createdAt: Date.now(),
    });
    await runProcessBotUpdate(ctxOf(db), {
      update: {
        update_id: 10,
        message: {
          message_id: 1,
          chat: { id: 5 },
          from: { id: 111, username: "tester" },
          text: "/link ABC123",
        },
      },
    });
    const cancel = await runProcessBotUpdate(ctxOf(db), {
      update: {
        update_id: 11,
        callback_query: {
          id: "q1",
          from: { id: 111, username: "tester" },
          data: "link_cancel",
          message: { message_id: 1, chat: { id: 5 } },
        },
      },
    });
    expect(sendTextOf(cancel)).toContain("Привязка отменена");
    expect(store.telegramAccounts).toHaveLength(0);
    expect(store.linkCodes).toHaveLength(1); // код не израсходован
    expect(store.telegramStates).toHaveLength(0);
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

  it("replay protection: повторная доставка того же update_id не дублирует действие", async () => {
    const { db, store } = makeConvexDb();
    seedProfile(db);
    seedTelegram(db);
    db.insert("waterEntries", {
      userId: "u1",
      date: toDateKey(new Date()),
      amountMl: 1000,
      createdAt: 1,
    });

    const update = {
      update_id: 42,
      callback_query: {
        id: "q-replay",
        from: { id: 111 },
        data: "water:250",
        message: { message_id: 5, chat: { id: 5 } },
      },
    };

    // Первая доставка — обрабатывается, вода обновляется.
    const first = await runProcessBotUpdate(ctxOf(db), { update });
    expect(first.find((o) => o.op === "editMessage")).toBeTruthy();
    expect(store.waterEntries[0].amountMl).toBe(1250);

    // Повторная доставка того же апдейта (Telegram-ретрай) — ничего не делает.
    const second = await runProcessBotUpdate(ctxOf(db), { update });
    expect(second).toEqual([]);
    expect(store.waterEntries[0].amountMl).toBe(1250); // не задвоилось

    // Отдельный новый update_id обрабатывается нормально.
    const next = await runProcessBotUpdate(ctxOf(db), {
      update: {
        update_id: 43,
        callback_query: {
          id: "q-next",
          from: { id: 111 },
          data: "water:250",
          message: { message_id: 5, chat: { id: 5 } },
        },
      },
    });
    expect(next.find((o) => o.op === "editMessage")).toBeTruthy();
    expect(store.waterEntries[0].amountMl).toBe(1500);
  });
});
