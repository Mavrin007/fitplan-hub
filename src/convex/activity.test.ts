/**
 * Юнит-тесты `getActivityDays` (src/convex/activity.ts) без Convex-рантайма:
 * агрегация дней по четырём таблицам (еда, вода, тренировки, вес),
 * включительные границы дат from..to и сортировка от старых к новым.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@convex-dev/auth/server", () => ({ getAuthUserId: vi.fn() }));

import { getAuthUserId } from "@convex-dev/auth/server";
import { getActivityDays } from "./activity";

/** Поддельный Id<"users"> для мока авторизации (реальный тип не экспортируется). */
const USER_ID = "user-1" as unknown as Awaited<ReturnType<typeof getAuthUserId>>;

type ActivityArgs = { from: string; to: string };

/** Хендлер query без обёртки. */
const runActivity = (
  getActivityDays as unknown as {
    _handler: (
      ctx: { db: ActivityFakeDb },
      args: ActivityArgs,
    ) => Promise<{ date: string; count: number }[]>;
  }
)._handler;

type Doc = { _id: string; _creationTime: number } & Record<string, unknown>;

interface ActivityFakeDb {
  query: (table: string) => {
    withIndex: (_name: string, fn: (q: unknown) => void) => unknown;
    collect: () => Doc[];
  };
}

function makeDb(seed: Record<string, Doc[]> = {}): {
  db: ActivityFakeDb;
  store: Record<string, Doc[]>;
} {
  const store: Record<string, Doc[]> = {
    mealLog: [],
    waterEntries: [],
    workoutLogs: [],
    weightEntries: [],
    ...seed,
  };
  const db: ActivityFakeDb = {
    query(table: string) {
      const filters: { op: "eq" | "gte" | "lte"; f: string; val: unknown }[] = [];
      const q = {
        eq(f: string, val: unknown) {
          filters.push({ op: "eq", f, val });
          return q;
        },
        gte(f: string, val: unknown) {
          filters.push({ op: "gte", f, val });
          return q;
        },
        lte(f: string, val: unknown) {
          filters.push({ op: "lte", f, val });
          return q;
        },
      };
      const match = (d: Doc) =>
        filters.every(({ op, f, val }) =>
          op === "eq"
            ? d[f] === val
            : op === "gte"
              ? String(d[f]) >= String(val)
              : String(d[f]) <= String(val),
        );
      return {
        withIndex(_name: string, fn: (q: unknown) => void) {
          fn(q);
          return this;
        },
        collect() {
          return store[table].filter(match);
        },
      };
    },
  };
  return { db, store };
}

function doc(table: string, id: string, userId: string, date: string): Doc {
  return { _id: `${table}:${id}`, _creationTime: 0, userId, date };
}

describe("getActivityDays", () => {
  beforeEach(() => {
    vi.mocked(getAuthUserId).mockReset();
    vi.mocked(getAuthUserId).mockResolvedValue(USER_ID);
  });

  it("без сессии возвращает пустой массив", async () => {
    vi.mocked(getAuthUserId).mockResolvedValue(null);
    const { db } = makeDb();
    await expect(
      runActivity({ db }, { from: "2026-07-01", to: "2026-08-04" }),
    ).resolves.toEqual([]);
  });

  it("без данных возвращает пустой массив", async () => {
    const { db } = makeDb();
    await expect(
      runActivity({ db }, { from: "2026-07-01", to: "2026-08-04" }),
    ).resolves.toEqual([]);
  });

  it("суммирует записи всех четырёх таблиц по дням", async () => {
    const { db } = makeDb({
      mealLog: [
        doc("mealLog", "m1", "user-1", "2026-08-03"),
        doc("mealLog", "m2", "user-1", "2026-08-03"),
      ],
      waterEntries: [doc("water", "w1", "user-1", "2026-08-03")],
      workoutLogs: [doc("workoutLogs", "t1", "user-1", "2026-08-02")],
      weightEntries: [doc("weight", "p1", "user-1", "2026-08-02")],
    });
    const result = await runActivity({ db }, { from: "2026-07-01", to: "2026-08-04" });
    expect(result).toEqual([
      { date: "2026-08-02", count: 2 }, // тренировка + замер веса
      { date: "2026-08-03", count: 3 }, // 2 приёма пищи + вода
    ]);
  });

  it("сортирует дни от старых к новым даже при перемешанном вводе", async () => {
    const { db } = makeDb({
      mealLog: [
        doc("mealLog", "m2", "user-1", "2026-08-04"),
        doc("mealLog", "m1", "user-1", "2026-08-01"),
      ],
      waterEntries: [doc("water", "w1", "user-1", "2026-08-02")],
    });
    const result = await runActivity({ db }, { from: "2026-08-01", to: "2026-08-04" });
    expect(result.map((r) => r.date)).toEqual(["2026-08-01", "2026-08-02", "2026-08-04"]);
  });

  it("уважает включительные границы диапазона from..to", async () => {
    const { db } = makeDb({
      mealLog: [
        doc("mealLog", "m1", "user-1", "2026-07-01"), // = from, включён
        doc("mealLog", "m2", "user-1", "2026-08-04"), // = to, включён
        doc("mealLog", "m3", "user-1", "2026-06-30"), // за пределами
        doc("mealLog", "m4", "user-1", "2026-08-05"), // за пределами
      ],
    });
    const result = await runActivity({ db }, { from: "2026-07-01", to: "2026-08-04" });
    expect(result).toEqual([
      { date: "2026-07-01", count: 1 },
      { date: "2026-08-04", count: 1 },
    ]);
  });

  it("игнорирует записи других пользователей (фильтр по userId)", async () => {
    const { db } = makeDb({
      mealLog: [
        doc("mealLog", "mine", "user-1", "2026-08-03"),
        doc("mealLog", "other", "user-2", "2026-08-03"),
      ],
    });
    const result = await runActivity({ db }, { from: "2026-08-01", to: "2026-08-04" });
    expect(result).toEqual([{ date: "2026-08-03", count: 1 }]);
  });
});
