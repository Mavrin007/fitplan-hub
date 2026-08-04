/**
 * Юнит-тесты `countMyData` (src/convex/guestStats.ts) без Convex-рантайма:
 * общий фейковый ctx.db (src/test/convex-db-mock.ts) + мокнутый getAuthUserId.
 *
 * Проверяем, что счётчик: возвращает 0 без сессии, суммирует записи по всем
 * шести таблицам и не учитывает записи других пользователей.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@convex-dev/auth/server", () => ({ getAuthUserId: vi.fn() }));

import { getAuthUserId } from "@convex-dev/auth/server";
import { countMyData } from "./guestStats";
import { makeConvexDb, type ConvexDbMock } from "@/test/convex-db-mock";

const USER_ID = "user-1" as unknown as Awaited<ReturnType<typeof getAuthUserId>>;

const runCount = async (db: ConvexDbMock) =>
  (
    countMyData as unknown as {
      _handler: (ctx: { db: ConvexDbMock }) => Promise<number>;
    }
  )._handler({ db });

describe("countMyData", () => {
  beforeEach(() => {
    vi.mocked(getAuthUserId).mockReset();
    vi.mocked(getAuthUserId).mockResolvedValue(USER_ID);
  });

  it("без сессии возвращает 0", async () => {
    vi.mocked(getAuthUserId).mockResolvedValue(null);
    const { db } = makeConvexDb();
    expect(await runCount(db)).toBe(0);
  });

  it("пустая база — 0", async () => {
    const { db } = makeConvexDb();
    expect(await runCount(db)).toBe(0);
  });

  it("суммирует записи по всем таблицам пользователя", async () => {
    const { db } = makeConvexDb({
      mealLog: [
        { _id: "m1", _creationTime: 0, userId: "user-1", date: "2026-08-04" },
        { _id: "m2", _creationTime: 0, userId: "user-1", date: "2026-08-04" },
      ],
      waterEntries: [
        { _id: "w1", _creationTime: 0, userId: "user-1", date: "2026-08-04" },
      ],
      workoutLogs: [
        { _id: "t1", _creationTime: 0, userId: "user-1", date: "2026-08-04" },
        { _id: "t2", _creationTime: 0, userId: "user-1", date: "2026-08-04" },
        { _id: "t3", _creationTime: 0, userId: "user-1", date: "2026-08-04" },
      ],
      weightEntries: [
        { _id: "v1", _creationTime: 0, userId: "user-1", date: "2026-08-04" },
      ],
      foods: [
        { _id: "f1", _creationTime: 0, userId: "user-1", name: "Овсянка" },
        { _id: "f2", _creationTime: 0, userId: "user-1", name: "Рис" },
      ],
      profiles: [
        { _id: "p1", _creationTime: 0, userId: "user-1", age: 30 },
      ],
    });
    expect(await runCount(db)).toBe(2 + 1 + 3 + 1 + 2 + 1); // = 10
  });

  it("не учитывает записи других пользователей", async () => {
    const { db } = makeConvexDb({
      mealLog: [
        { _id: "m1", _creationTime: 0, userId: "user-2", date: "2026-08-04" },
        { _id: "m2", _creationTime: 0, userId: "user-1", date: "2026-08-04" },
      ],
      waterEntries: [
        { _id: "w1", _creationTime: 0, userId: "user-2", date: "2026-08-04" },
      ],
      workoutLogs: [
        { _id: "t1", _creationTime: 0, userId: "user-3", date: "2026-08-04" },
      ],
      weightEntries: [
        { _id: "v1", _creationTime: 0, userId: "user-2", date: "2026-08-04" },
      ],
      foods: [
        { _id: "f1", _creationTime: 0, userId: "user-2", name: "Овсянка" },
      ],
      profiles: [
        { _id: "p1", _creationTime: 0, userId: "user-2", age: 30 },
      ],
    });
    expect(await runCount(db)).toBe(1); // только m2 принадлежит user-1
  });
});
