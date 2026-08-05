/**
 * Юнит-тесты `profiles` (src/convex/profiles.ts) без Convex-рантайма:
 * фейковый ctx.db + мок getAuthUserId, хендлеры через `_handler`.
 *
 * Покрываем серверную защиту: отсутствие сессии, диапазоны возраста/роста/
 * веса/целевого веса/тренировок, фильтрацию неизвестных ключей инвентаря и
 * ограничений, а также upsert (вставка против патча существующего профиля).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@convex-dev/auth/server", () => ({
  getAuthUserId: vi.fn(),
  // schema.ts импортирует authTables — заглушка, как в mealLog.test.ts.
  authTables: {},
}));

import { getAuthUserId } from "@convex-dev/auth/server";
import { getMyProfile, upsertProfile } from "./profiles";
import {
  errorMessage,
  makeConvexDb,
  mockAuth,
  type ConvexDbMock,
  type ConvexDoc,
} from "@/test/convex-db-mock";


type UpsertArgs = {
  age: number;
  gender: string;
  heightCm: number;
  weightKg: number;
  targetWeightKg?: number;
  activityLevel: string;
  fitnessGoal: string;
  experienceLevel: string;
  equipment?: string[];
  limitations?: string[];
  preferredTrainingDays?: number;
  trainingStyle?: string;
};

const runGet = (
  getMyProfile as unknown as {
    _handler: (ctx: { db: ConvexDbMock }) => Promise<ConvexDoc | null>;
  }
)._handler;
const runUpsert = (
  upsertProfile as unknown as {
    _handler: (ctx: { db: ConvexDbMock }, args: UpsertArgs) => Promise<unknown>;
  }
)._handler;

const VALID_ARGS: UpsertArgs = {
  age: 30,
  gender: "male",
  heightCm: 180,
  weightKg: 80,
  targetWeightKg: 75,
  activityLevel: "moderate",
  fitnessGoal: "lose_weight",
  experienceLevel: "intermediate",
  equipment: ["barbell", "dumbbell"],
  limitations: ["knees"],
  preferredTrainingDays: 4,
  trainingStyle: "balanced",
};

function profileDoc(id: string, userId: string): ConvexDoc {
  return { _id: id, _creationTime: 0, userId, age: 30 };
}

describe("getMyProfile", () => {
  beforeEach(() => {
    mockAuth(getAuthUserId);
  });

  it("без сессии возвращает null", async () => {
    mockAuth(getAuthUserId, "anonymous");
    const { db } = makeConvexDb();
    await expect(runGet({ db })).resolves.toBeNull();
  });

  it("с сессией, но без профиля возвращает null", async () => {
    const { db } = makeConvexDb();
    await expect(runGet({ db })).resolves.toBeNull();
  });

  it("с сессией возвращает профиль пользователя", async () => {
    const { db } = makeConvexDb({
      profiles: [
        profileDoc("p1", "user-1"),
        profileDoc("p2", "user-2"),
      ],
    });
    const result = await runGet({ db });
    expect(result?._id).toBe("p1");
  });
});

describe("upsertProfile", () => {
  beforeEach(() => {
    mockAuth(getAuthUserId);
  });

  it("без сессии бросает понятную ошибку", async () => {
    mockAuth(getAuthUserId, "anonymous");
    const { db } = makeConvexDb();
    const msg = await errorMessage(() => runUpsert({ db }, VALID_ARGS));
    expect(msg).toBe("Сессия истекла — войдите заново.");
  });

  it("возраст вне 10–120 отклоняется (включая NaN)", async () => {
    const { db } = makeConvexDb();
    for (const age of [9, 121, NaN, -5]) {
      const msg = await errorMessage(() =>
        runUpsert({ db }, { ...VALID_ARGS, age }),
      );
      expect(msg).toBe("Возраст должен быть в диапазоне 10–120");
    }
  });

  it("рост вне 100–250 отклоняется", async () => {
    const { db } = makeConvexDb();
    const msg = await errorMessage(() =>
      runUpsert({ db }, { ...VALID_ARGS, heightCm: 99 }),
    );
    expect(msg).toBe("Рост (см) должен быть в диапазоне 100–250");
  });

  it("вес вне 20–500 отклоняется", async () => {
    const { db } = makeConvexDb();
    const msg = await errorMessage(() =>
      runUpsert({ db }, { ...VALID_ARGS, weightKg: 501 }),
    );
    expect(msg).toBe("Вес (кг) должен быть в диапазоне 20–500");
  });

  it("целевой вес вне 20–500 отклоняется", async () => {
    const { db } = makeConvexDb();
    const msg = await errorMessage(() =>
      runUpsert({ db }, { ...VALID_ARGS, targetWeightKg: 10 }),
    );
    expect(msg).toBe("Целевой вес (кг) должен быть в диапазоне 20–500");
  });

  it("профиль без опциональных полей сохраняется (false-ветки !== undefined)", async () => {
    const { db, store } = makeConvexDb();
    const minimal = {
      age: 30,
      gender: "male" as const,
      heightCm: 180,
      weightKg: 80,
      activityLevel: "moderate" as const,
      fitnessGoal: "lose_weight" as const,
      experienceLevel: "intermediate" as const,
    };
    await runUpsert({ db }, minimal as UpsertArgs);
    expect(store.profiles).toHaveLength(1);
    expect(store.profiles[0].targetWeightKg).toBeUndefined();
    expect(store.profiles[0].equipment).toEqual([]);
    expect(store.profiles[0].limitations).toEqual([]);
    expect(store.profiles[0].preferredTrainingDays).toBeUndefined();
  });

  it("тренировок в неделю вне 1–6 отклоняется", async () => {
    const { db } = makeConvexDb();
    for (const n of [0, 7]) {
      const msg = await errorMessage(() =>
        runUpsert({ db }, { ...VALID_ARGS, preferredTrainingDays: n }),
      );
      expect(msg).toBe("Тренировок в неделю должен быть в диапазоне 1–6");
    }
  });

  it("неизвестные ключи инвентаря и ограничений отфильтровываются", async () => {
    const { db, store } = makeConvexDb();
    await runUpsert({ db }, {
      ...VALID_ARGS,
      equipment: ["barbell", "hoverboard", "dumbbell"],
      limitations: ["knees", "hobbit_feet"],
    });
    expect(store.profiles[0].equipment).toEqual(["barbell", "dumbbell"]);
    expect(store.profiles[0].limitations).toEqual(["knees"]);
  });

  it("создаёт профиль, если его ещё нет (все поля + updatedAt)", async () => {
    const { db, store } = makeConvexDb();
    const id = await runUpsert({ db }, VALID_ARGS);
    expect(store.profiles).toHaveLength(1);
    const doc = store.profiles[0];
    expect(id).toBe(doc._id);
    expect(doc).toMatchObject({
      userId: "user-1",
      age: 30,
      gender: "male",
      heightCm: 180,
      weightKg: 80,
      targetWeightKg: 75,
      preferredTrainingDays: 4,
      trainingStyle: "balanced",
    });
    expect(doc.updatedAt).toBeTypeOf("number");
  });

  it("патчит существующий профиль вместо вставки второго", async () => {
    const { db, store } = makeConvexDb({
      profiles: [profileDoc("p1", "user-1")],
    });
    const id = await runUpsert({ db }, { ...VALID_ARGS, weightKg: 82 });
    expect(id).toBe("p1");
    expect(store.profiles).toHaveLength(1);
    expect(store.profiles[0].weightKg).toBe(82);
  });

  it("профиль другого пользователя не патчится", async () => {
    const { db, store } = makeConvexDb({
      profiles: [profileDoc("p1", "user-2")],
    });
    await runUpsert({ db }, VALID_ARGS);
    expect(store.profiles).toHaveLength(2);
    expect(store.profiles.find((d) => d._id === "p1")).toMatchObject({
      age: 30, // не тронут
    });
  });
});
