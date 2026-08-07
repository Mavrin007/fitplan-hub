/**
 * Юнит-тесты управления аккаунтом (src/convex/account.ts) без
 * Convex-рантайма: exportMyData (GDPR-переносимость — только свои данные)
 * и deleteMyAccount (GDPR-забвение — полная очистка без задевания других
 * пользователей), на общем фейковом ctx.db.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@convex-dev/auth/server", () => ({ getAuthUserId: vi.fn() }));

import { getAuthUserId } from "@convex-dev/auth/server";
import { exportMyData, deleteMyAccount } from "./account";
import {
  AUTH_USER_ID,
  errorMessage,
  makeConvexDb,
  mockAuth,
  type ConvexDbMock,
  type ConvexDoc,
} from "@/test/convex-db-mock";

const runExportMyData = (
  exportMyData as unknown as {
    _handler: (
      ctx: { db: ConvexDbMock },
      args: Record<string, never>,
    ) => Promise<Record<string, unknown>>;
  }
)._handler;

const runDeleteMyAccount = (
  deleteMyAccount as unknown as {
    _handler: (
      ctx: { db: ConvexDbMock },
      args: Record<string, never>,
    ) => Promise<unknown>;
  }
)._handler;

/** Минимальные документы для двух пользователей во всех таблицах. */
function seedFull(
  store: Record<string, ConvexDoc[]>,
  userId: string,
  suffix: string,
): void {
  const id = (t: string, n: number) => `${t}-${suffix}-${n}`;
  store.profiles.push({
    _id: id("prof", 1),
    _creationTime: 0,
    userId,
    age: 30,
    weightKg: 80,
  } as ConvexDoc);
  store.weightEntries.push({
    _id: id("w", 1),
    _creationTime: 0,
    userId,
    date: "2026-08-01",
    weightKg: 80,
  } as ConvexDoc);
  store.mealLog.push({
    _id: id("m", 1),
    _creationTime: 0,
    userId,
    date: "2026-08-01",
    name: "Овсянка",
    calories: 300,
  } as ConvexDoc);
  store.foods.push({
    _id: id("f", 1),
    _creationTime: 0,
    userId,
    name: "Творог",
    calories: 100,
  } as ConvexDoc);
  store.waterEntries.push({
    _id: id("wat", 1),
    _creationTime: 0,
    userId,
    date: "2026-08-01",
    amountMl: 500,
  } as ConvexDoc);
  store.workoutLogs.push({
    _id: id("wl", 1),
    _creationTime: 0,
    userId,
    date: "2026-08-01",
    workoutName: "Фулбоди",
  } as ConvexDoc);
  store.workoutPlans.push({
    _id: id("plan", 1),
    _creationTime: 0,
    userId,
    name: "План",
  } as ConvexDoc);
  store.assistantLimits.push({
    _id: id("al", 1),
    _creationTime: 0,
    userId,
    day: "2026-08-01",
    count: 3,
  } as ConvexDoc);
  store.users.push({
    _id: userId,
    _creationTime: 0,
    name: `user-${suffix}`,
    isAnonymous: false,
  } as ConvexDoc);
  store.authSessions.push({
    _id: id("sess", 1),
    _creationTime: 0,
    userId,
    expiresAt: 9999999999999,
  } as ConvexDoc);
  store.authAccounts.push({
    _id: id("acc", 1),
    _creationTime: 0,
    userId,
    provider: "google",
  } as ConvexDoc);
}

describe("exportMyData — переносимость", () => {
  beforeEach(() => {
    mockAuth(getAuthUserId);
  });

  it("отдаёт только свои данные, не трогая чужого пользователя", async () => {
    const { db, store } = makeConvexDb();
    seedFull(store, AUTH_USER_ID as unknown as string, "me");
    seedFull(store, "user-2", "other");

    const result = (await runExportMyData(
      { db },
      {},
    )) as unknown as {
      exportedAt: string;
      profile: ConvexDoc | null;
      weightEntries: ConvexDoc[];
      mealLog: ConvexDoc[];
      foods: ConvexDoc[];
      waterEntries: ConvexDoc[];
      workoutLogs: ConvexDoc[];
      workoutPlan: ConvexDoc | null;
      assistantLimits: ConvexDoc[];
    };

    expect(result.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.profile?._id).toBe("prof-me-1");
    expect(result.weightEntries).toHaveLength(1);
    expect(result.mealLog).toHaveLength(1);
    expect(result.foods).toHaveLength(1);
    expect(result.waterEntries).toHaveLength(1);
    expect(result.workoutLogs).toHaveLength(1);
    expect(result.workoutPlan?._id).toBe("plan-me-1");
    expect(result.assistantLimits).toHaveLength(1);
    // Чужие данные нигде не затесались.
    expect(JSON.stringify(result)).not.toContain("user-2");
    expect(JSON.stringify(result)).not.toContain("other");
  });

  it("пустому пользователю отдаёт пустые коллекции и null-профиль", async () => {
    const { db, store } = makeConvexDb();
    store.users.push({
      _id: AUTH_USER_ID as unknown as string,
      _creationTime: 0,
      isAnonymous: true,
    } as ConvexDoc);

    const result = (await runExportMyData(
      { db },
      {},
    )) as unknown as { profile: ConvexDoc | null; weightEntries: ConvexDoc[] };

    expect(result.profile).toBeNull();
    expect(result.weightEntries).toEqual([]);
  });

  it("анониму отказывает понятной ошибкой", async () => {
    mockAuth(getAuthUserId, "anonymous");
    const { db } = makeConvexDb();
    const message = await errorMessage(() => runExportMyData({ db }, {}));
    expect(message).toMatch(/Сессия истекла/);
  });
});

describe("deleteMyAccount — забвение", () => {
  beforeEach(() => {
    mockAuth(getAuthUserId);
  });

  it("стирает все данные, сессии и провайдеры, но не трогает другого", async () => {
    const { db, store } = makeConvexDb();
    seedFull(store, AUTH_USER_ID as unknown as string, "me");
    seedFull(store, "user-2", "other");

    await runDeleteMyAccount({ db }, {});

    // У «me» не осталось ни одной строки ни в одной таблице.
    for (const table of Object.keys(store)) {
      const mine = store[table].filter(
        (d) => d.userId === AUTH_USER_ID,
      );
      expect(mine, `таблица ${table}`).toHaveLength(0);
    }
    // Сам документ users удалён.
    expect(store.users.find((u) => u._id === AUTH_USER_ID)).toBeUndefined();
    // Чужой пользователь нетронут.
    expect(store.mealLog).toHaveLength(1);
    expect(store.users).toHaveLength(1);
    expect(store.users[0]._id).toBe("user-2");
  });

  it("анониму отказывает понятной ошибкой", async () => {
    mockAuth(getAuthUserId, "anonymous");
    const { db, store } = makeConvexDb();
    seedFull(store, AUTH_USER_ID as unknown as string, "me");

    const message = await errorMessage(() => runDeleteMyAccount({ db }, {}));
    expect(message).toMatch(/Сессия истекла/);
    // Ничего не удалено.
    expect(store.mealLog).toHaveLength(1);
    expect(store.users).toHaveLength(1);
  });
});
