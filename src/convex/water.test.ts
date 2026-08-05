/**
 * Юнит-тесты `addWater` (src/convex/water.ts) без Convex-рантайма:
 * общий фейковый ctx.db (src/test/convex-db-mock.ts) + мокнутый getAuthUserId,
 * хендлер дёргается напрямую (`_handler` на объекте mutation).
 *
 * Проверяем серверную защиту, которая недостижима из тестов страниц:
 * невалидная дата, объём вне диапазона ±5000 мл, upsert и клампинг итога
 * до нуля (нельзя увести дневную норму в минус).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@convex-dev/auth/server", () => ({ getAuthUserId: vi.fn() }));

import { getAuthUserId } from "@convex-dev/auth/server";
import { addWater, getByDate } from "./water";
import {
  errorMessage,
  makeConvexDb,
  mockAuth,
  type ConvexDbMock,
} from "@/test/convex-db-mock";


type AddWaterArgs = { date: string; amountMl: number };

/** Хендлер мутации без обёртки — единственное, что нужно для теста. */
const runAddWater = (
  addWater as unknown as {
    _handler: (ctx: { db: ConvexDbMock }, args: AddWaterArgs) => Promise<unknown>;
  }
)._handler;

const runGetByDate = (
  getByDate as unknown as {
    _handler: (
      ctx: { db: ConvexDbMock },
      args: { date: string },
    ) => Promise<unknown>;
  }
)._handler;

describe("getByDate", () => {
  beforeEach(() => {
    mockAuth(getAuthUserId);
  });

  it("без сессии возвращает null", async () => {
    mockAuth(getAuthUserId, "anonymous");
    const { db } = makeConvexDb();
    await expect(
      runGetByDate({ db }, { date: "2026-08-04" }),
    ).resolves.toBeNull();
  });

  it("без записи за дату возвращает null", async () => {
    const { db } = makeConvexDb();
    await expect(
      runGetByDate({ db }, { date: "2026-08-04" }),
    ).resolves.toBeNull();
  });

  it("возвращает запись пользователя за дату (и не чужую)", async () => {
    const { db } = makeConvexDb({
      waterEntries: [
        { _id: "w1", _creationTime: 0, userId: "user-1", date: "2026-08-04", amountMl: 750 },
        { _id: "w2", _creationTime: 0, userId: "user-2", date: "2026-08-04", amountMl: 900 },
      ],
    });
    const result = (await runGetByDate(
      { db },
      { date: "2026-08-04" },
    )) as { _id: string; amountMl: number };
    expect(result._id).toBe("w1");
    expect(result.amountMl).toBe(750);
  });
});

describe("addWater", () => {
  beforeEach(() => {
    mockAuth(getAuthUserId);
  });

  it("без сессии бросает понятную ошибку", async () => {
    mockAuth(getAuthUserId, "anonymous");
    const { db } = makeConvexDb();
    const msg = await errorMessage(() =>
      runAddWater({ db }, { date: "2026-08-04", amountMl: 250 }),
    );
    expect(msg).toBe("Сессия истекла — войдите заново.");
  });

  it("отклоняет невалидную дату", async () => {
    const { db } = makeConvexDb();
    const msg = await errorMessage(() =>
      runAddWater({ db }, { date: "04-08-2026", amountMl: 250 }),
    );
    expect(msg).toBe("Некорректная дата");
  });

  it("отклоняет объём вне диапазона ±5000 мл", async () => {
    const { db } = makeConvexDb();
    expect(
      await errorMessage(() => runAddWater({ db }, { date: "2026-08-04", amountMl: 5001 })),
    ).toContain("Объём воды (мл)");
    expect(
      await errorMessage(() => runAddWater({ db }, { date: "2026-08-04", amountMl: -5001 })),
    ).toContain("Объём воды (мл)");
  });

  it("границы диапазона (±5000) принимаются", async () => {
    const { db, store } = makeConvexDb();
    await runAddWater({ db }, { date: "2026-08-04", amountMl: 5000 });
    await runAddWater({ db }, { date: "2026-08-05", amountMl: -5000 });
    expect(store.waterEntries).toHaveLength(2);
  });

  it("создаёт запись, если её ещё нет", async () => {
    const { db, store } = makeConvexDb();
    const id = await runAddWater({ db }, { date: "2026-08-04", amountMl: 250 });
    expect(store.waterEntries).toHaveLength(1);
    expect(store.waterEntries[0]).toMatchObject({
      userId: "user-1",
      date: "2026-08-04",
      amountMl: 250,
    });
    expect(id).toBe(store.waterEntries[0]._id);
  });

  it("при отсутствии записи отрицательная добавка клампится до 0", async () => {
    const { db, store } = makeConvexDb();
    await runAddWater({ db }, { date: "2026-08-04", amountMl: -250 });
    expect(store.waterEntries[0].amountMl).toBe(0);
  });

  it("суммирует с существующей записью (upsert)", async () => {
    const { db, store } = makeConvexDb({
      waterEntries: [
        { _id: "w1", _creationTime: 0, userId: "user-1", date: "2026-08-04", amountMl: 500 },
      ],
    });
    const id = await runAddWater({ db }, { date: "2026-08-04", amountMl: 250 });
    expect(id).toBe("w1"); // патчим существующую, не создаём новую
    expect(store.waterEntries).toHaveLength(1);
    expect(store.waterEntries[0].amountMl).toBe(750);
  });

  it("не уводит итог в минус при переборе (−250 при 200 → 0)", async () => {
    const { db, store } = makeConvexDb({
      waterEntries: [
        { _id: "w1", _creationTime: 0, userId: "user-1", date: "2026-08-04", amountMl: 200 },
      ],
    });
    await runAddWater({ db }, { date: "2026-08-04", amountMl: -250 });
    expect(store.waterEntries[0].amountMl).toBe(0);
  });

  it("не трогает чужие даты и пользователей (фильтр по userId + date)", async () => {
    const { db, store } = makeConvexDb({
      waterEntries: [
        { _id: "w1", _creationTime: 0, userId: "user-1", date: "2026-08-03", amountMl: 100 },
        { _id: "w2", _creationTime: 0, userId: "user-2", date: "2026-08-04", amountMl: 900 },
      ],
    });
    await runAddWater({ db }, { date: "2026-08-04", amountMl: 100 });
    // user-1 за 04.08 — новая запись; w2 (другой пользователь) не затронут.
    expect(store.waterEntries).toHaveLength(3);
    expect(store.waterEntries.find((d) => d._id === "w2")).toMatchObject({ amountMl: 900 });
  });
});
