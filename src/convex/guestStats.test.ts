/**
 * Юнит-тесты `countMyData` (src/convex/guestStats.ts) без Convex-рантайма:
 * фейковый ctx.db + мокнутый getAuthUserId (тот же паттерн, что в water/activity).
 *
 * Проверяем, что счётчик: возвращает 0 без сессии, суммирует записи по всем
 * шести таблицам и не учитывает записи других пользователей.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@convex-dev/auth/server", () => ({ getAuthUserId: vi.fn() }));

import { getAuthUserId } from "@convex-dev/auth/server";
import { countMyData } from "./guestStats";

const USER_ID = "user-1" as unknown as Awaited<ReturnType<typeof getAuthUserId>>;

type Doc = { _id: string; _creationTime: number } & Record<string, unknown>;

/** Минимальный in-memory аналог ctx.db: withIndex + eq + collect. */
interface FakeDb {
  query: (table: string) => {
    withIndex: (_name: string, fn: (q: unknown) => void) => {
      collect: () => Doc[];
    };
  };
}

function makeDb(seed: Record<string, Doc[]> = {}): { db: FakeDb } {
  const store: Record<string, Doc[]> = {
    mealLog: [],
    waterEntries: [],
    workoutLogs: [],
    weightEntries: [],
    foods: [],
    profiles: [],
    ...seed,
  };
  const db: FakeDb = {
    query(table: string) {
      const filters: { op: "eq"; f: string; val: unknown }[] = [];
      const q = {
        eq(f: string, val: unknown) {
          filters.push({ op: "eq", f, val });
          return q;
        },
      };
      const match = (d: Doc) =>
        filters.every(({ f, val }) => d[f] === val);
      return {
        withIndex(_name: string, fn: (q: unknown) => void) {
          fn(q);
          return { collect: () => store[table].filter(match) };
        },
      };
    },
  };
  return { db };
}

const runCount = async (db: FakeDb) =>
  (
    countMyData as unknown as {
      _handler: (ctx: { db: FakeDb }) => Promise<number>;
    }
  )._handler({ db });

describe("countMyData", () => {
  beforeEach(() => {
    vi.mocked(getAuthUserId).mockReset();
    vi.mocked(getAuthUserId).mockResolvedValue(USER_ID);
  });

  it("без сессии возвращает 0", async () => {
    vi.mocked(getAuthUserId).mockResolvedValue(null);
    const { db } = makeDb();
    expect(await runCount(db)).toBe(0);
  });

  it("пустая база — 0", async () => {
    const { db } = makeDb();
    expect(await runCount(db)).toBe(0);
  });

  it("суммирует записи по всем таблицам пользователя", async () => {
    const { db } = makeDb({
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
    const { db } = makeDb({
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
