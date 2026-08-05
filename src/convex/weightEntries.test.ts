/**
 * Юнит-тесты `weightEntries` (src/convex/weightEntries.ts) без Convex-рантайма:
 * общий фейковый ctx.db (src/test/convex-db-mock.ts) + мокнутый getAuthUserId,
 * хендлеры дёргаются напрямую (`_handler`).
 *
 * Проверяем серверную защиту, недостижимую из тестов страниц: невалидная дата,
 * вес вне диапазона 20–500 кг, upsert по (userId, date), границы дат в
 * listMyWeights, сортировка desc и запрет удаления чужой записи.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@convex-dev/auth/server", () => ({ getAuthUserId: vi.fn() }));

import { getAuthUserId } from "@convex-dev/auth/server";
import { addWeight, deleteWeight, listMyWeights } from "./weightEntries";
import {
  errorMessage,
  makeConvexDb,
  mockAuth,
  type ConvexDbMock,
  type ConvexDoc,
} from "@/test/convex-db-mock";


type ListArgs = { from?: string; to?: string };
type AddArgs = { date: string; weightKg: number };
type DeleteArgs = { id: string };

const runList = (
  listMyWeights as unknown as {
    _handler: (ctx: { db: ConvexDbMock }, args: ListArgs) => Promise<ConvexDoc[]>;
  }
)._handler;
const runAdd = (
  addWeight as unknown as {
    _handler: (ctx: { db: ConvexDbMock }, args: AddArgs) => Promise<unknown>;
  }
)._handler;
const runDelete = (
  deleteWeight as unknown as {
    _handler: (ctx: { db: ConvexDbMock }, args: DeleteArgs) => Promise<unknown>;
  }
)._handler;

function weightDoc(
  id: string,
  userId: string,
  date: string,
  weightKg: number,
): ConvexDoc {
  return { _id: id, _creationTime: 0, userId, date, weightKg };
}

describe("listMyWeights", () => {
  beforeEach(() => {
    mockAuth(getAuthUserId);
  });

  it("без сессии возвращает пустой массив", async () => {
    mockAuth(getAuthUserId, "anonymous");
    const { db } = makeConvexDb();
    await expect(runList({ db }, {})).resolves.toEqual([]);
  });

  it("без диапазона возвращает все записи пользователя от новых к старым", async () => {
    const { db } = makeConvexDb({
      weightEntries: [
        weightDoc("w1", "user-1", "2026-08-01", 80),
        weightDoc("w2", "user-1", "2026-08-04", 79.5),
        weightDoc("w3", "user-2", "2026-08-02", 90),
      ],
    });
    const result = await runList({ db }, {});
    expect(result.map((d) => d._id)).toEqual(["w2", "w1"]); // desc по дате
    expect(result.every((d) => d.userId === "user-1")).toBe(true);
  });

  it("уважает включительные границы диапазона from..to", async () => {
    const { db } = makeConvexDb({
      weightEntries: [
        weightDoc("w1", "user-1", "2026-07-01", 81), // = from, включён
        weightDoc("w2", "user-1", "2026-07-15", 80),
        weightDoc("w3", "user-1", "2026-08-04", 79), // = to, включён
        weightDoc("w4", "user-1", "2026-08-05", 78.5), // за пределами
      ],
    });
    const result = await runList({ db }, { from: "2026-07-01", to: "2026-08-04" });
    expect(result.map((d) => d._id)).toEqual(["w3", "w2", "w1"]);
  });

  it("одна граница (без второй) — контракт: возвращаются все записи", async () => {
    // Хендлер: `if (from && to)` — диапазон фильтрует только когда заданы ОБЕ
    // границы; с одной границей клиент получит все записи. Фиксируем это
    // поведение, чтобы будущее изменение условия не прошло незамеченным.
    const { db } = makeConvexDb({
      weightEntries: [
        weightDoc("w1", "user-1", "2026-07-01", 81),
        weightDoc("w2", "user-1", "2026-08-04", 79),
      ],
    });
    const onlyFrom = await runList({ db }, { from: "2026-08-01" });
    expect(onlyFrom.map((d) => d._id)).toEqual(["w2", "w1"]);
    const onlyTo = await runList({ db }, { to: "2026-07-15" });
    expect(onlyTo.map((d) => d._id)).toEqual(["w2", "w1"]);
  });
});

describe("addWeight", () => {
  beforeEach(() => {
    mockAuth(getAuthUserId);
  });

  it("без сессии бросает понятную ошибку", async () => {
    mockAuth(getAuthUserId, "anonymous");
    const { db } = makeConvexDb();
    const msg = await errorMessage(() =>
      runAdd({ db }, { date: "2026-08-04", weightKg: 80 }),
    );
    expect(msg).toBe("Сессия истекла — войдите заново.");
  });

  it("отклоняет невалидную дату", async () => {
    const { db } = makeConvexDb();
    const msg = await errorMessage(() =>
      runAdd({ db }, { date: "04-08-2026", weightKg: 80 }),
    );
    expect(msg).toBe("Некорректная дата");
  });

  it("отклоняет вес вне диапазона 20–500 кг и NaN", async () => {
    const { db } = makeConvexDb();
    for (const bad of [19, 501, NaN, -5]) {
      const msg = await errorMessage(() =>
        runAdd({ db }, { date: "2026-08-04", weightKg: bad }),
      );
      expect(msg).toBe("Вес (кг) должен быть в диапазоне 20–500");
    }
  });

  it("границы диапазона (20 и 500) принимаются", async () => {
    const { db, store } = makeConvexDb();
    await runAdd({ db }, { date: "2026-08-04", weightKg: 20 });
    await runAdd({ db }, { date: "2026-08-05", weightKg: 500 });
    expect(store.weightEntries).toHaveLength(2);
  });

  it("создаёт запись, если её ещё нет", async () => {
    const { db, store } = makeConvexDb();
    const id = await runAdd({ db }, { date: "2026-08-04", weightKg: 80 });
    expect(store.weightEntries).toHaveLength(1);
    expect(store.weightEntries[0]).toMatchObject({
      userId: "user-1",
      date: "2026-08-04",
      weightKg: 80,
    });
    expect(store.weightEntries[0].createdAt).toBeTypeOf("number");
    expect(id).toBe(store.weightEntries[0]._id);
  });

  it("upsert: существующая запись за тот же день патчится, а не дублируется", async () => {
    const { db, store } = makeConvexDb({
      weightEntries: [weightDoc("w1", "user-1", "2026-08-04", 80)],
    });
    const id = await runAdd({ db }, { date: "2026-08-04", weightKg: 79.5 });
    expect(id).toBe("w1");
    expect(store.weightEntries).toHaveLength(1);
    expect(store.weightEntries[0].weightKg).toBe(79.5);
  });

  it("запись другого пользователя за тот же день не патчится", async () => {
    const { db, store } = makeConvexDb({
      weightEntries: [weightDoc("w1", "user-2", "2026-08-04", 90)],
    });
    await runAdd({ db }, { date: "2026-08-04", weightKg: 80 });
    expect(store.weightEntries).toHaveLength(2); // user-1 получил новую запись
    expect(store.weightEntries.find((d) => d._id === "w1")).toMatchObject({
      weightKg: 90,
    });
  });
});

describe("deleteWeight", () => {
  beforeEach(() => {
    mockAuth(getAuthUserId);
  });

  it("без сессии бросает понятную ошибку", async () => {
    mockAuth(getAuthUserId, "anonymous");
    const { db } = makeConvexDb();
    const msg = await errorMessage(() => runDelete({ db }, { id: "w1" }));
    expect(msg).toBe("Сессия истекла — войдите заново.");
  });

  it("несуществующая запись бросает ошибку", async () => {
    const { db } = makeConvexDb();
    const msg = await errorMessage(() => runDelete({ db }, { id: "nope" }));
    expect(msg).toBe("Запись не найдена или уже удалена.");
  });

  it("чужую запись удалить нельзя (ошибка, запись остаётся)", async () => {
    const { db, store } = makeConvexDb({
      weightEntries: [weightDoc("w1", "user-2", "2026-08-04", 90)],
    });
    const msg = await errorMessage(() => runDelete({ db }, { id: "w1" }));
    expect(msg).toBe("Запись не найдена или уже удалена.");
    expect(store.weightEntries).toHaveLength(1);
  });

  it("своя запись удаляется", async () => {
    const { db, store } = makeConvexDb({
      weightEntries: [weightDoc("w1", "user-1", "2026-08-04", 80)],
    });
    await expect(runDelete({ db }, { id: "w1" })).resolves.toBeUndefined();
    expect(store.weightEntries).toHaveLength(0);
  });
});
