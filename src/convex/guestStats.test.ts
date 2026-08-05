/**
 * Юнит-тесты `guestStats` (src/convex/guestStats.ts) без Convex-рантайма:
 * общий фейковый ctx.db (src/test/convex-db-mock.ts) + мокнутый getAuthUserId.
 *
 * hasMyData — дешёвая проверка наличия (take(1)); countMyData — точный счёт.
 * Проверяем: 0/false без сессии, суммирование по шести таблицам и отсечение
 * записей других пользователей.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@convex-dev/auth/server", () => ({ getAuthUserId: vi.fn() }));

import { getAuthUserId } from "@convex-dev/auth/server";
import { countMyData, hasMyData } from "./guestStats";
import { makeConvexDb, mockAuth, type ConvexDbMock } from "@/test/convex-db-mock";


const runCount = async (db: ConvexDbMock) =>
  (
    countMyData as unknown as {
      _handler: (ctx: { db: ConvexDbMock }) => Promise<number>;
    }
  )._handler({ db });

const runHas = async (db: ConvexDbMock) =>
  (
    hasMyData as unknown as {
      _handler: (ctx: { db: ConvexDbMock }) => Promise<boolean>;
    }
  )._handler({ db });

describe("countMyData", () => {
  beforeEach(() => {
    mockAuth(getAuthUserId);
  });

  it("без сессии возвращает 0", async () => {
    mockAuth(getAuthUserId, "anonymous");
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

describe("hasMyData", () => {
  beforeEach(() => {
    mockAuth(getAuthUserId);
  });

  it("без сессии — false", async () => {
    mockAuth(getAuthUserId, "anonymous");
    const { db } = makeConvexDb();
    expect(await runHas(db)).toBe(false);
  });

  it("пустая база — false", async () => {
    const { db } = makeConvexDb();
    expect(await runHas(db)).toBe(false);
  });

  it("хотя бы одна запись в любой таблице — true", async () => {
    const { db } = makeConvexDb({
      weightEntries: [
        { _id: "v1", _creationTime: 0, userId: "user-1", date: "2026-08-04" },
      ],
    });
    expect(await runHas(db)).toBe(true);
  });

  it("записи только других пользователей — false", async () => {
    const { db } = makeConvexDb({
      mealLog: [
        { _id: "m1", _creationTime: 0, userId: "user-2", date: "2026-08-04" },
      ],
      profiles: [
        { _id: "p1", _creationTime: 0, userId: "user-2", age: 30 },
      ],
    });
    expect(await runHas(db)).toBe(false);
  });

  it("согласован с точным счётом: hasMyData=true тогда и только тогда, когда count>0", async () => {
    // Профиль = 1 запись: и наличие, и счёт совпадают.
    const withProfile = makeConvexDb({
      profiles: [{ _id: "p1", _creationTime: 0, userId: "user-1", age: 30 }],
    });
    expect(await runHas(withProfile.db)).toBe(true);
    expect(await runCount(withProfile.db)).toBe(1);

    // Пустая база: false и 0.
    const empty = makeConvexDb();
    expect(await runHas(empty.db)).toBe(false);
    expect(await runCount(empty.db)).toBe(0);
  });
});
