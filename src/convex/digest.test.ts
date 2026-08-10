/**
 * Тесты недельной сводки (src/convex/digest.ts) через фейковый ctx.db
 * (src/test/convex-db-mock.ts): runWeeklyDigest — отбор получателей,
 * env-гейты, устойчивость к сбою одного адреса; getMyWeeklyDigest —
 * авторизация. sendResendEmail замокан, как в emailOtp.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted: фабрика vi.mock поднимается над объявлениями (см. emailOtp.test).
const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

vi.mock("../lib/resend", () => ({
  sendResendEmail: sendMock,
}));

vi.mock("@convex-dev/auth/server", () => ({ getAuthUserId: vi.fn() }));

import { getAuthUserId } from "@convex-dev/auth/server";
import { getMyWeeklyDigest, runWeeklyDigest, type DigestRunResult } from "./digest";
import { addDays, toDateKey } from "../lib/dates";
import {
  makeConvexDb,
  mockAuth,
  type ConvexDbMock,
} from "@/test/convex-db-mock";
import type { ConvexDoc } from "@/test/convex-db-mock";

const d = (offset: number) => toDateKey(addDays(new Date(), offset));

/** Окно сводки (как в weekWindowKeys): вчера и 6 дней до него. */
const Y = d(-1);
const Y2 = d(-2);
const Y5 = d(-5);

type DigestCtx = { db: ConvexDbMock };

const runDigest = (runWeeklyDigest as unknown as {
  _handler: (
    ctx: DigestCtx,
    args: Record<string, never>,
  ) => Promise<DigestRunResult>;
})._handler;

const runMyDigest = (getMyWeeklyDigest as unknown as {
  _handler: (ctx: DigestCtx, args: Record<string, never>) => Promise<unknown>;
})._handler;

function emailUser(
  id: string,
  email: string,
  over: Record<string, unknown> = {},
): ConvexDoc {
  return { _id: id, _creationTime: 0, email, isAnonymous: false, ...over };
}

function seedWeek(): ConvexDoc[] {
  return [
    emailUser("users:1", "alice@test.ru", { name: "Алиса" }),
    // Гость: почта привязана, но сессия анонимная — письмо не шлём.
    emailUser("users:2", "anon@test.ru", { isAnonymous: true }),
    // Пользователь без почты.
    { _id: "users:3", _creationTime: 0, isAnonymous: false },
    // Второй получатель с данными (для теста устойчивости к сбоям).
    emailUser("users:4", "bob@test.ru", { name: "Боб" }),
  ];
}

function seedProfile(userId: string): ConvexDoc {
  return {
    _id: `profiles:${userId}`,
    _creationTime: 0,
    userId,
    age: 30,
    gender: "male",
    heightCm: 175,
    weightKg: 84,
    activityLevel: "moderate",
    fitnessGoal: "lose_weight",
    updatedAt: 0,
  };
}

/** Наполнение: полный набор записей для users:1 за неделю. */
function seedDataForAlice(): Record<string, ConvexDoc[]> {
  return {
    weightEntries: [
      { _id: "w1", _creationTime: 0, userId: "users:1", date: Y5, weightKg: 84.5, createdAt: 0 },
      { _id: "w2", _creationTime: 0, userId: "users:1", date: Y, weightKg: 83.9, createdAt: 0 },
    ],
    mealLog: [
      { _id: "m1", _creationTime: 0, userId: "users:1", date: Y, mealType: "lunch", name: "Гречка", quantity: 1, calories: 1800, protein: 120, carbs: 200, fat: 60, createdAt: 0 },
      { _id: "m2", _creationTime: 0, userId: "users:1", date: Y2, mealType: "dinner", name: "Курица", quantity: 1, calories: 2000, protein: 150, carbs: 150, fat: 80, createdAt: 0 },
    ],
    workoutLogs: [
      { _id: "t1", _creationTime: 0, userId: "users:1", date: Y2, workoutName: "День 1", exercises: [{ name: "Приседания", sets: 3, reps: 10, weightKg: 20 }], createdAt: 0 },
    ],
    waterEntries: [
      { _id: "h1", _creationTime: 0, userId: "users:1", date: Y, amountMl: 2000, createdAt: 0 },
    ],
  };
}

function seedDataForBob(): Record<string, ConvexDoc[]> {
  return {
    mealLog: [
      { _id: "m3", _creationTime: 0, userId: "users:4", date: Y, mealType: "lunch", name: "Рис", quantity: 1, calories: 2100, protein: 100, carbs: 260, fat: 60, createdAt: 0 },
    ],
  };
}

beforeEach(() => {
  vi.stubEnv("RESEND_API_KEY", "test-key");
  vi.stubEnv("DIGEST_DISABLED", "");
  sendMock.mockReset();
  sendMock.mockResolvedValue({ success: true, id: "mocked-id" });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("runWeeklyDigest", () => {
  it("шлёт письмо пользователям с email и данными, гостей/безданных пропускает", async () => {
    const { db } = makeConvexDb({
      users: seedWeek(),
      profiles: [seedProfile("users:1"), seedProfile("users:4")],
      ...seedDataForAlice(),
      ...seedDataForBob(),
    });

    const res = await runDigest({ db }, {});
    expect(res).toEqual({ skipped: null, sent: 2, noData: 0, failed: 0 });
    expect(sendMock).toHaveBeenCalledTimes(2);

    const aliceCall = sendMock.mock.calls.find(
      (c) => (c[0] as { to: string }).to === "alice@test.ru",
    );
    expect(aliceCall).toBeDefined();
    const aliceMsg = aliceCall![0] as {
      subject: string;
      text: string;
      html: string;
    };
    expect(aliceMsg.subject).toBe("Ваша неделя в КИЛО");
    expect(aliceMsg.text).toContain("Привет, Алиса");
    expect(aliceMsg.text).toContain("Вес: −0,6 кг (84,5 → 83,9)");
    expect(aliceMsg.text).toContain("Тренировок: 1 (тоннаж 600 кг)");
    expect(aliceMsg.text).toContain("Активных дней: 3 из 7");
    expect(aliceMsg.html).toContain("<h2 style=\"margin:0 0 16px;font-size:18px;\">Неделя в КИЛО</h2>");
    expect(aliceMsg.html).toContain("Вес: −0,6 кг (84,5 → 83,9)");
  });

  it("без данных за неделю пользователь пропускается (noData)", async () => {
    // users:1 есть email, но ни одной записи в окне.
    const { db } = makeConvexDb({ users: seedWeek() });
    const res = await runDigest({ db }, {});
    expect(res.sent).toBe(0);
    // alice и bob — оба с email и без данных; anon/без-email не считаются.
    expect(res.noData).toBe(2);
    expect(res.failed).toBe(0);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("без RESEND_API_KEY прогон пропускается, отправки нет", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const { db } = makeConvexDb({
      users: seedWeek(),
      profiles: [seedProfile("users:1")],
      ...seedDataForAlice(),
    });
    const res = await runDigest({ db }, {});
    expect(res.skipped).toBe("no-email-key");
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("DIGEST_DISABLED=1 пропускает прогон", async () => {
    vi.stubEnv("DIGEST_DISABLED", "1");
    const { db } = makeConvexDb({
      users: seedWeek(),
      profiles: [seedProfile("users:1")],
      ...seedDataForAlice(),
    });
    const res = await runDigest({ db }, {});
    expect(res.skipped).toBe("disabled");
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("сбой одного получателя не валит остальных", async () => {
    sendMock.mockRejectedValueOnce(new Error("smtp: connection refused"));
    const { db } = makeConvexDb({
      users: seedWeek(),
      profiles: [seedProfile("users:1"), seedProfile("users:4")],
      ...seedDataForAlice(),
      ...seedDataForBob(),
    });
    const res = await runDigest({ db }, {});
    expect(res).toEqual({ skipped: null, sent: 1, noData: 0, failed: 1 });
  });
});

describe("getMyWeeklyDigest", () => {
  it("авторизованный пользователь получает сводку за окно", async () => {
    mockAuth(getAuthUserId, "user"); // AUTH_USER_ID = "user-1"
    const { db } = makeConvexDb({
      profiles: [seedProfile("user-1")],
      weightEntries: [
        { _id: "w1", _creationTime: 0, userId: "user-1", date: Y5, weightKg: 84.5, createdAt: 0 },
        { _id: "w2", _creationTime: 0, userId: "user-1", date: Y, weightKg: 83.9, createdAt: 0 },
      ],
      mealLog: [
        { _id: "m1", _creationTime: 0, userId: "user-1", date: Y, mealType: "lunch", name: "Гречка", quantity: 1, calories: 1800, protein: 120, carbs: 200, fat: 60, createdAt: 0 },
        { _id: "m2", _creationTime: 0, userId: "user-1", date: Y2, mealType: "dinner", name: "Курица", quantity: 1, calories: 2000, protein: 150, carbs: 150, fat: 80, createdAt: 0 },
      ],
    });
    const digest = await runMyDigest(
      { db },
      {},
    );
    const d = digest as {
      hasData: boolean;
      weightDeltaKg: number;
      avgCalories: number;
    };
    expect(d.hasData).toBe(true);
    expect(d.weightDeltaKg).toBeCloseTo(-0.6);
    expect(d.avgCalories).toBeCloseTo(1900);
  });

  it("сводка без профиля: данные есть, caloriePct null (нет цели)", async () => {
    mockAuth(getAuthUserId, "user");
    const { db } = makeConvexDb({
      mealLog: [
        { _id: "m1", _creationTime: 0, userId: "user-1", date: Y, mealType: "lunch", name: "Гречка", quantity: 1, calories: 1900, protein: 120, carbs: 200, fat: 60, createdAt: 0 },
      ],
    });
    const digest = await runMyDigest({ db }, {}) as {
      hasData: boolean;
      avgCalories: number;
      caloriePct: number | null;
    };
    expect(digest.hasData).toBe(true);
    expect(digest.avgCalories).toBeCloseTo(1900);
    expect(digest.caloriePct).toBeNull();
  });

  it("гость получает null", async () => {
    mockAuth(getAuthUserId, "anonymous");
    const { db } = makeConvexDb({});
    const digest = await runMyDigest({ db }, {});
    expect(digest).toBeNull();
  });
});
