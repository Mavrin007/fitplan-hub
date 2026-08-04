/**
 * Юнит-тесты `addWater` (src/convex/water.ts) без Convex-рантайма:
 * фейковый ctx.db + мокнутый getAuthUserId, хендлер дёргается напрямую
 * (`_handler` на объекте mutation).
 *
 * Проверяем серверную защиту, которая недостижима из тестов страниц:
 * невалидная дата, объём вне диапазона ±5000 мл, upsert и клампинг итога
 * до нуля (нельзя увести дневную норму в минус).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@convex-dev/auth/server", () => ({ getAuthUserId: vi.fn() }));

import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { addWater } from "./water";

/** Поддельный Id<"users"> для мока авторизации (реальный тип не экспортируется). */
const USER_ID = "user-1" as unknown as Awaited<ReturnType<typeof getAuthUserId>>;

type AddWaterArgs = { date: string; amountMl: number };

/** Хендлер мутации без обёртки — единственное, что нужно для теста. */
const runAddWater = (
  addWater as unknown as {
    _handler: (ctx: { db: FakeDb }, args: AddWaterArgs) => Promise<unknown>;
  }
)._handler;

type Doc = { _id: string; _creationTime: number } & Record<string, unknown>;

/** Минимальный in-memory аналог ctx.db: eq/gte/lte + first/collect/patch/insert. */
interface FakeDb {
  query: (table: string) => {
    withIndex: (_name: string, fn: (q: unknown) => void) => unknown;
    first: () => Doc | undefined;
    collect: () => Doc[];
  };
  patch: (id: string, patch: Record<string, unknown>) => void;
  insert: (table: string, doc: Record<string, unknown>) => string;
}

function makeDb(seed: Record<string, Doc[]> = {}): { db: FakeDb; store: Record<string, Doc[]> } {
  const store: Record<string, Doc[]> = {
    waterEntries: [],
    mealLog: [],
    workoutLogs: [],
    weightEntries: [],
    ...seed,
  };
  let seq = 0;

  const db: FakeDb = {
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
        first() {
          return store[table].filter(match)[0];
        },
        collect() {
          return store[table].filter(match);
        },
      };
    },
    patch(id: string, patch: Record<string, unknown>) {
      for (const t of Object.keys(store)) {
        const doc = store[t].find((d) => d._id === id);
        if (doc) {
          Object.assign(doc, patch);
          return;
        }
      }
      throw new Error(`patch: нет документа ${id}`);
    },
    insert(table: string, doc: Record<string, unknown>) {
      const id = `${table}:${++seq}`;
      store[table].push({ _id: id, _creationTime: 0, ...doc } as Doc);
      return id;
    },
  };
  return { db, store };
}

function ctxOf(db: FakeDb): { db: FakeDb } {
  return { db };
}

function errorMessage(fn: () => Promise<unknown>): Promise<string> {
  return fn().then(
    () => Promise.reject(new Error("ожидался выброс ConvexError")),
    (err: unknown) => {
      expect(err).toBeInstanceOf(ConvexError);
      return (err as ConvexError<{ message: string }>).data.message;
    },
  );
}

describe("addWater", () => {
  beforeEach(() => {
    vi.mocked(getAuthUserId).mockReset();
    vi.mocked(getAuthUserId).mockResolvedValue(USER_ID);
  });

  it("без сессии бросает понятную ошибку", async () => {
    vi.mocked(getAuthUserId).mockResolvedValue(null);
    const { db } = makeDb();
    const msg = await errorMessage(() =>
      runAddWater(ctxOf(db), { date: "2026-08-04", amountMl: 250 }),
    );
    expect(msg).toBe("Сессия истекла — войдите заново.");
  });

  it("отклоняет невалидную дату", async () => {
    const { db } = makeDb();
    const msg = await errorMessage(() =>
      runAddWater(ctxOf(db), { date: "04-08-2026", amountMl: 250 }),
    );
    expect(msg).toBe("Некорректная дата");
  });

  it("отклоняет объём вне диапазона ±5000 мл", async () => {
    const { db } = makeDb();
    expect(
      await errorMessage(() => runAddWater(ctxOf(db), { date: "2026-08-04", amountMl: 5001 })),
    ).toContain("Объём воды (мл)");
    expect(
      await errorMessage(() => runAddWater(ctxOf(db), { date: "2026-08-04", amountMl: -5001 })),
    ).toContain("Объём воды (мл)");
  });

  it("границы диапазона (±5000) принимаются", async () => {
    const { db, store } = makeDb();
    await runAddWater(ctxOf(db), { date: "2026-08-04", amountMl: 5000 });
    await runAddWater(ctxOf(db), { date: "2026-08-05", amountMl: -5000 });
    expect(store.waterEntries).toHaveLength(2);
  });

  it("создаёт запись, если её ещё нет", async () => {
    const { db, store } = makeDb();
    const id = await runAddWater(ctxOf(db), { date: "2026-08-04", amountMl: 250 });
    expect(store.waterEntries).toHaveLength(1);
    expect(store.waterEntries[0]).toMatchObject({
      userId: "user-1",
      date: "2026-08-04",
      amountMl: 250,
    });
    expect(id).toBe(store.waterEntries[0]._id);
  });

  it("при отсутствии записи отрицательная добавка клампится до 0", async () => {
    const { db, store } = makeDb();
    await runAddWater(ctxOf(db), { date: "2026-08-04", amountMl: -250 });
    expect(store.waterEntries[0].amountMl).toBe(0);
  });

  it("суммирует с существующей записью (upsert)", async () => {
    const { db, store } = makeDb({
      waterEntries: [
        { _id: "w1", _creationTime: 0, userId: "user-1", date: "2026-08-04", amountMl: 500 },
      ],
    });
    const id = await runAddWater(ctxOf(db), { date: "2026-08-04", amountMl: 250 });
    expect(id).toBe("w1"); // патчим существующую, не создаём новую
    expect(store.waterEntries).toHaveLength(1);
    expect(store.waterEntries[0].amountMl).toBe(750);
  });

  it("не уводит итог в минус при переборе (−250 при 200 → 0)", async () => {
    const { db, store } = makeDb({
      waterEntries: [
        { _id: "w1", _creationTime: 0, userId: "user-1", date: "2026-08-04", amountMl: 200 },
      ],
    });
    await runAddWater(ctxOf(db), { date: "2026-08-04", amountMl: -250 });
    expect(store.waterEntries[0].amountMl).toBe(0);
  });

  it("не трогает чужие даты и пользователей (фильтр по userId + date)", async () => {
    const { db, store } = makeDb({
      waterEntries: [
        { _id: "w1", _creationTime: 0, userId: "user-1", date: "2026-08-03", amountMl: 100 },
        { _id: "w2", _creationTime: 0, userId: "user-2", date: "2026-08-04", amountMl: 900 },
      ],
    });
    await runAddWater(ctxOf(db), { date: "2026-08-04", amountMl: 100 });
    // user-1 за 04.08 — новая запись; w2 (другой пользователь) не затронут.
    expect(store.waterEntries).toHaveLength(3);
    expect(store.waterEntries.find((d) => d._id === "w2")).toMatchObject({ amountMl: 900 });
  });
});
