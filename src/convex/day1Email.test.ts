/**
 * Юнит-тесты `sendDay1` (src/convex/day1Email.ts) без Convex-рантайма:
 * фейковый ctx.db + мок sendResendEmail. Покрываем гейты (нет ключа, гость,
 * без почты, без лога), успешную отправку с событием email_sent и сбой
 * отправки без события.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/resend", () => ({
  sendResendEmail: vi.fn(),
}));

import { sendResendEmail } from "../lib/resend";
import { sendDay1 } from "./day1Email";
import {
  makeConvexDb,
  type ConvexDbMock,
  type ConvexDoc,
} from "@/test/convex-db-mock";

const runSendDay1 = (
  sendDay1 as unknown as {
    _handler: (ctx: { db: ConvexDbMock }, args: { userId: string }) => Promise<void>;
  }
)._handler;

const USER = {
  _id: "user-1",
  _creationTime: 0,
  email: "u@example.com",
  name: "Алекс",
  isAnonymous: false,
};

const FIRST_LOG = {
  _id: "log-1",
  _creationTime: 0,
  userId: "user-1",
  date: "2026-08-04",
  workoutName: "Фулбоди A",
  exercises: [{ name: "Жим лёжа", sets: 3, reps: 10, weightKg: 40 }],
  createdAt: 1,
};

const mockedSend = vi.mocked(sendResendEmail);

beforeEach(() => {
  process.env.RESEND_API_KEY = "test-key";
  process.env.SITE_URL = "https://kilo.example";
  delete process.env.DIGEST_DISABLED;
  mockedSend.mockReset();
});

afterEach(() => {
  delete process.env.RESEND_API_KEY;
  delete process.env.SITE_URL;
  delete process.env.DIGEST_DISABLED;
});

function makeCtx(seed: Record<string, ConvexDoc[]> = {}) {
  const { db, store } = makeConvexDb(seed);
  return { db, store };
}

describe("sendDay1", () => {
  it("без RESEND_API_KEY ничего не отправляет", async () => {
    delete process.env.RESEND_API_KEY;
    const { db } = makeCtx({ users: [USER], workoutLogs: [FIRST_LOG] });
    await runSendDay1({ db }, { userId: "user-1" });
    expect(mockedSend).not.toHaveBeenCalled();
  });

  it("гость без почты письмо не получает", async () => {
    const { db } = makeCtx({
      users: [{ ...USER, isAnonymous: true }],
      workoutLogs: [FIRST_LOG],
    });
    await runSendDay1({ db }, { userId: "user-1" });
    expect(mockedSend).not.toHaveBeenCalled();
  });

  it("без тренировки письмо не отправляется", async () => {
    const { db } = makeCtx({ users: [USER] });
    await runSendDay1({ db }, { userId: "user-1" });
    expect(mockedSend).not.toHaveBeenCalled();
  });

  it("успешная отправка: письмо с результатом + событие email_sent", async () => {
    mockedSend.mockResolvedValue({ success: true, id: "res-1" });
    const { db, store } = makeCtx({ users: [USER], workoutLogs: [FIRST_LOG] });

    await runSendDay1({ db }, { userId: "user-1" });

    expect(mockedSend).toHaveBeenCalledTimes(1);
    const payload = mockedSend.mock.calls[0][0];
    expect(payload.to).toBe("u@example.com");
    expect(payload.subject).toContain("Первая тренировка");
    expect(payload.text).toContain("Алекс, отличная работа!");
    expect(payload.text).toContain("Фулбоди A");
    expect(payload.text).toContain("3 подходов");
    expect(payload.html).toContain("Открыть КИЛО");

    // Событие для воронки email_sent → app_opened → day_completed.
    const events = store.events;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      userId: "user-1",
      name: "email_sent",
      meta: { type: "day1" },
    });
    expect(events[0].ts).toBeTypeOf("number");
  });

  it("сбой отправки: событие не пишется", async () => {
    mockedSend.mockResolvedValue({ success: false, error: "bounce" });
    const { db, store } = makeCtx({ users: [USER], workoutLogs: [FIRST_LOG] });

    await runSendDay1({ db }, { userId: "user-1" });

    expect(mockedSend).toHaveBeenCalledTimes(1);
    expect(store.events).toHaveLength(0);
  });
});
