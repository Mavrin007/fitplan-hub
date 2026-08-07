/**
 * Юнит-тесты ролевой модели (src/convex/roles.ts) без Convex-рантайма:
 * фейковый ctx.db + мокнутый getAuthUserId, хендлеры дёргаются напрямую.
 *
 * Проверяем, что ROLES — не мёртвая константа: роль читается (с дефолтом USER
 * для старых пользователей без поля), а смена роли доступна только админу
 * с защитой от потери последнего админа.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConvexError } from "convex/values";

vi.mock("@convex-dev/auth/server", () => ({
  getAuthUserId: vi.fn(),
  // roles.test импортирует ./schema, а он тянет authTables — заглушка,
  // как в mealLog.test.ts / profiles.test.ts.
  authTables: {},
}));

import { getAuthUserId } from "@convex-dev/auth/server";
import {
  assertRole,
  getUserRole,
  myRole,
  setUserRole,
} from "./roles";
import { ROLES } from "./schema";
import {
  AUTH_USER_ID,
  makeConvexDb,
  mockAuth,
  type ConvexDbMock,
  type ConvexDoc,
} from "@/test/convex-db-mock";

/** AUTH_USER_ID типизирован как Id<"users"> | null — для строковых args. */
const CURRENT_USER = AUTH_USER_ID as unknown as string;

/** Хендлеры без обёрток — единственное, что нужно тестам. */
const runMyRole = (
  myRole as unknown as {
    _handler: (ctx: { db: ConvexDbMock }) => Promise<string | null>;
  }
)._handler;

const runSetUserRole = (
  setUserRole as unknown as {
    _handler: (
      ctx: { db: ConvexDbMock },
      args: { userId: string; role: string },
    ) => Promise<{ userId: string; role: string }>;
  }
)._handler;

function userDoc(overrides: Partial<ConvexDoc> = {}): ConvexDoc {
  return { _id: CURRENT_USER, _creationTime: 0, name: "Гость", ...overrides };
}

describe("getUserRole — мягкий дефолт", () => {
  it("пользователь без поля role получает USER (старые аккаунты)", async () => {
    const { db } = makeConvexDb({ users: [userDoc()] });
    await expect(getUserRole({ db }, CURRENT_USER)).resolves.toBe(ROLES.USER);
  });

  it("назначенная роль читается как есть", async () => {
    const { db } = makeConvexDb({ users: [userDoc({ role: "admin" })] });
    await expect(getUserRole({ db }, CURRENT_USER)).resolves.toBe(ROLES.ADMIN);
  });

  it("несуществующий пользователь — USER", async () => {
    const { db } = makeConvexDb();
    await expect(getUserRole({ db }, "missing-id")).resolves.toBe(ROLES.USER);
  });
});

describe("myRole — запрос роли текущего пользователя", () => {
  beforeEach(() => {
    mockAuth(getAuthUserId);
  });

  it("аноним получает null", async () => {
    mockAuth(getAuthUserId, "anonymous");
    const { db } = makeConvexDb();
    await expect(runMyRole({ db })).resolves.toBeNull();
  });

  it("залогиненный без роли — USER (дефолт)", async () => {
    const { db } = makeConvexDb({ users: [userDoc()] });
    await expect(runMyRole({ db })).resolves.toBe(ROLES.USER);
  });

  it("залогиненный с ролью admin — ADMIN", async () => {
    const { db } = makeConvexDb({ users: [userDoc({ role: "admin" })] });
    await expect(runMyRole({ db })).resolves.toBe(ROLES.ADMIN);
  });
});

describe("assertRole — гард для будущих хендлеров", () => {
  it("разрешённая роль не бросает", () => {
    expect(() => assertRole(ROLES.ADMIN, [ROLES.ADMIN])).not.toThrow();
  });

  it("недостаточно прав — ConvexError с человекочитаемым сообщением", () => {
    try {
      assertRole(ROLES.USER, [ROLES.ADMIN]);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ConvexError);
      expect(
        (err as ConvexError<{ message: string }>).data,
      ).toMatchObject({
        message: expect.stringContaining("Недостаточно прав"),
      });
    }
  });

  it("null/undefined трактуется как USER (аноним/без роли)", () => {
    try {
      assertRole(null, [ROLES.ADMIN]);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ConvexError);
    }
  });
});

describe("setUserRole — смена роли только админом", () => {
  beforeEach(() => {
    mockAuth(getAuthUserId);
  });

  it("аноним получает понятную ошибку", async () => {
    mockAuth(getAuthUserId, "anonymous");
    const { db } = makeConvexDb();
    await expect(
      runSetUserRole({ db }, { userId: "user-2", role: "admin" }),
    ).rejects.toMatchObject({ data: { message: "Не авторизован." } });
  });

  it("обычный пользователь не может менять роли", async () => {
    const { db } = makeConvexDb({ users: [userDoc()] }); // текущий — USER
    await expect(
      runSetUserRole({ db }, { userId: "user-2", role: "admin" }),
    ).rejects.toMatchObject({
      data: { message: expect.stringContaining("Недостаточно прав") },
    });
  });

  it("админ назначает роль другому пользователю", async () => {
    const { db, store } = makeConvexDb({
      users: [
        userDoc({ role: "admin" }), // текущий — admin
        { _id: "user-2", _creationTime: 0, name: "Кто-то" },
      ],
    });
    await expect(
      runSetUserRole({ db }, { userId: "user-2", role: "member" }),
    ).resolves.toEqual({ userId: "user-2", role: "member" });
    expect(store.users.find((u) => u._id === "user-2")).toMatchObject({
      role: "member",
    });
  });

  it("нельзя снять admin с последнего администратора", async () => {
    const { db } = makeConvexDb({
      users: [userDoc({ role: "admin" })], // админ только один — он сам
    });
    await expect(
      runSetUserRole({ db }, { userId: CURRENT_USER, role: "user" }),
    ).rejects.toMatchObject({
      data: { message: expect.stringContaining("последнего администратора") },
    });
  });

  it("можно снять admin с себя, если есть другой админ", async () => {
    const { db, store } = makeConvexDb({
      users: [
        userDoc({ role: "admin" }),
        { _id: "user-2", _creationTime: 0, role: "admin" },
      ],
    });
    await expect(
      runSetUserRole({ db }, { userId: CURRENT_USER, role: "user" }),
    ).resolves.toEqual({ userId: CURRENT_USER, role: "user" });
    expect(store.users[0]).toMatchObject({ role: "user" });
  });
});
