/**
 * Юнит-тесты `currentUser` (src/convex/users.ts) без Convex-рантайма:
 * общий фейковый ctx.db (src/test/convex-db-mock.ts) + мокнутый getAuthUserId,
 * хендлер дёргается напрямую (`_handler` на объекте query).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@convex-dev/auth/server", () => ({ getAuthUserId: vi.fn() }));

import { getAuthUserId } from "@convex-dev/auth/server";
import { currentUser } from "./users";
import {
  makeConvexDb,
  mockAuth,
  type ConvexDbMock,
  type ConvexDoc,
} from "@/test/convex-db-mock";


/** Хендлер query без обёртки — единственное, что нужно для теста. */
const runCurrentUser = (
  currentUser as unknown as {
    _handler: (ctx: { db: ConvexDbMock }) => Promise<ConvexDoc | null>;
  }
)._handler;

describe("currentUser", () => {
  beforeEach(() => {
    mockAuth(getAuthUserId);
  });

  it("без сессии возвращает null", async () => {
    mockAuth(getAuthUserId, "anonymous");
    const { db } = makeConvexDb();
    await expect(runCurrentUser({ db })).resolves.toBeNull();
  });

  it("с сессией возвращает документ пользователя", async () => {
    const user: ConvexDoc = {
      _id: "user-1",
      _creationTime: 0,
      name: "Гость",
      isAnonymous: true,
    };
    const { db } = makeConvexDb({ users: [user] });
    await expect(runCurrentUser({ db })).resolves.toMatchObject({
      _id: "user-1",
      name: "Гость",
      isAnonymous: true,
    });
  });

  it("возвращает null, если пользователь не найден в базе", async () => {
    const { db } = makeConvexDb();
    await expect(runCurrentUser({ db })).resolves.toBeNull();
  });
});
