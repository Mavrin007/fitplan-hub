/**
 * Юнит-тесты `workouts` (src/convex/workouts.ts) без Convex-рантайма:
 * фейковый ctx.db + мок getAuthUserId, хендлеры через `_handler`.
 *
 * Покрываем: защиту сессии, лимиты savePlan (текст, диапазоны, размеры
 * массивов, валидацию упражнений), upsert плана, валидацию logWorkout и
 * вставку с createdAt, фильтрацию listLogs по датам и права на deleteLog.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@convex-dev/auth/server", () => ({
  getAuthUserId: vi.fn(),
  // schema.ts импортирует authTables — заглушка, как в mealLog.test.ts.
  authTables: {},
}));

import { getAuthUserId } from "@convex-dev/auth/server";
import {
  deleteLog,
  getMyPlan,
  listLogs,
  logWorkout,
  savePlan,
} from "./workouts";
import {
  errorMessage,
  makeConvexDb,
  mockAuth,
  type ConvexDbMock,
  type ConvexDoc,
} from "@/test/convex-db-mock";


/** Валидный день плана по workoutDayValidator. */
const DAY = {
  day: 0,
  focus: "Верх тела",
  exercises: [
    { name: "Жим лёжа", sets: 3, reps: "8-12", restSeconds: 90 },
  ],
};

type SavePlanArgs = {
  name: string;
  adaptedFor?: string;
  profileSignature?: string;
  goal: string;
  experienceLevel: string;
  splitType?: string;
  sessionsPerWeek?: number;
  durationWeeks?: number;
  howCalculated?: string[];
  days: typeof DAY[];
  weeks?: { week: number; label: string; weightNote?: string; days: typeof DAY[] }[];
};

const runGetPlan = (
  getMyPlan as unknown as {
    _handler: (ctx: { db: ConvexDbMock }) => Promise<ConvexDoc | null>;
  }
)._handler;
const runSavePlan = (
  savePlan as unknown as {
    _handler: (ctx: { db: ConvexDbMock }, args: SavePlanArgs) => Promise<unknown>;
  }
)._handler;
const runLogWorkout = (
  logWorkout as unknown as {
    _handler: (
      ctx: { db: ConvexDbMock },
      args: {
        date: string;
        workoutName: string;
        exercises: { name: string; sets: number; reps: number; weightKg: number }[];
        effort?: string;
      },
    ) => Promise<unknown>;
  }
)._handler;
const runListLogs = (
  listLogs as unknown as {
    _handler: (
      ctx: { db: ConvexDbMock },
      args: { from?: string; to?: string },
    ) => Promise<ConvexDoc[]>;
  }
)._handler;
const runDeleteLog = (
  deleteLog as unknown as {
    _handler: (ctx: { db: ConvexDbMock }, args: { id: string }) => Promise<unknown>;
  }
)._handler;

const VALID_PLAN: SavePlanArgs = {
  name: "Силовой фулбоди",
  goal: "strength",
  experienceLevel: "beginner",
  splitType: "fullbody",
  sessionsPerWeek: 3,
  durationWeeks: 4,
  howCalculated: ["ИМТ учтён"],
  days: [DAY],
};

const VALID_LOG = {
  date: "2026-08-04",
  workoutName: "Тренировка А",
  exercises: [{ name: "Жим лёжа", sets: 3, reps: 10, weightKg: 40 }],
  effort: "normal" as const,
};

function logDoc(id: string, userId: string, date: string): ConvexDoc {
  return { _id: id, _creationTime: 0, userId, date, workoutName: "Тренировка А" };
}

describe("getMyPlan", () => {
  beforeEach(() => {
    mockAuth(getAuthUserId);
  });

  it("без сессии возвращает null", async () => {
    mockAuth(getAuthUserId, "anonymous");
    const { db } = makeConvexDb();
    await expect(runGetPlan({ db })).resolves.toBeNull();
  });

  it("с сессией возвращает план пользователя (или null)", async () => {
    const { db } = makeConvexDb();
    await expect(runGetPlan({ db })).resolves.toBeNull();

    const { db: db2, store } = makeConvexDb();
    store.workoutPlans = [
      { _id: "plan1", _creationTime: 0, userId: "user-1", name: "Мой план" },
    ];
    const result = await runGetPlan({ db: db2 });
    expect(result?._id).toBe("plan1");
  });
});

describe("savePlan", () => {
  beforeEach(() => {
    mockAuth(getAuthUserId);
  });

  it("без сессии бросает понятную ошибку", async () => {
    mockAuth(getAuthUserId, "anonymous");
    const { db } = makeConvexDb();
    const msg = await errorMessage(() => runSavePlan({ db }, VALID_PLAN));
    expect(msg).toBe("Сессия истекла — войдите заново.");
  });

  it("пустое название плана отклоняется", async () => {
    const { db } = makeConvexDb();
    const msg = await errorMessage(() =>
      runSavePlan({ db }, { ...VALID_PLAN, name: "   " }),
    );
    expect(msg).toBe("Название плана: от 1 до 120 символов");
  });

  it("тренировок в неделю вне 1–6 отклоняется", async () => {
    const { db } = makeConvexDb();
    for (const n of [0, 7]) {
      const msg = await errorMessage(() =>
        runSavePlan({ db }, { ...VALID_PLAN, sessionsPerWeek: n }),
      );
      expect(msg).toBe("Тренировок в неделю должен быть в диапазоне 1–6");
    }
  });

  it("недель цикла вне 1–16 отклоняется", async () => {
    const { db } = makeConvexDb();
    const msg = await errorMessage(() =>
      runSavePlan({ db }, { ...VALID_PLAN, durationWeeks: 17 }),
    );
    expect(msg).toBe("Недель цикла должен быть в диапазоне 1–16");
  });

  it("больше 7 дней в неделе отклоняется", async () => {
    const { db } = makeConvexDb();
    const msg = await errorMessage(() =>
      runSavePlan({ db }, { ...VALID_PLAN, days: Array.from({ length: 8 }, () => DAY) }),
    );
    expect(msg).toBe("Дней в неделе: не более 7 элементов");
  });

  it("упражнение вне допустимого диапазона подходов отклоняется", async () => {
    const { db } = makeConvexDb();
    const msg = await errorMessage(() =>
      runSavePlan(
        { db },
        {
          ...VALID_PLAN,
          days: [
            {
              ...DAY,
              exercises: [{ name: "Жим лёжа", sets: 21, reps: "8-12", restSeconds: 90 }],
            },
          ],
        },
      ),
    );
    expect(msg).toBe("Подходы должен быть в диапазоне 1–20");
  });

  it("создаёт план с userId и updatedAt при отсутствии старого", async () => {
    const { db, store } = makeConvexDb();
    const id = await runSavePlan({ db }, VALID_PLAN);
    expect(store.workoutPlans).toHaveLength(1);
    const doc = store.workoutPlans[0];
    expect(id).toBe(doc._id);
    expect(doc).toMatchObject({
      userId: "user-1",
      name: "Силовой фулбоди",
      goal: "strength",
    });
    expect(doc.updatedAt).toBeTypeOf("number");
  });

  it("патчит существующий план вместо вставки второго", async () => {
    const { db, store } = makeConvexDb();
    store.workoutPlans = [{ _id: "plan1", _creationTime: 0, userId: "user-1", name: "Старый" }];
    const id = await runSavePlan({ db }, VALID_PLAN);
    expect(id).toBe("plan1");
    expect(store.workoutPlans).toHaveLength(1);
    expect(store.workoutPlans[0].name).toBe("Силовой фулбоди");
  });
});

describe("logWorkout", () => {
  beforeEach(() => {
    mockAuth(getAuthUserId);
  });

  it("без сессии бросает понятную ошибку", async () => {
    mockAuth(getAuthUserId, "anonymous");
    const { db } = makeConvexDb();
    const msg = await errorMessage(() => runLogWorkout({ db }, VALID_LOG));
    expect(msg).toBe("Сессия истекла — войдите заново.");
  });

  it("невалидная дата отклоняется", async () => {
    const { db } = makeConvexDb();
    const msg = await errorMessage(() =>
      runLogWorkout({ db }, { ...VALID_LOG, date: "04.08.2026" }),
    );
    expect(msg).toBe("Некорректная дата");
  });

  it("вес упражнения вне 0–1000 отклоняется", async () => {
    const { db } = makeConvexDb();
    const msg = await errorMessage(() =>
      runLogWorkout(
        { db },
        {
          ...VALID_LOG,
          exercises: [{ name: "Жим", sets: 3, reps: 10, weightKg: 1001 }],
        },
      ),
    );
    expect(msg).toBe("Вес (кг) должен быть в диапазоне 0–1000");
  });

  it("вставляет запись с userId и createdAt", async () => {
    const { db, store } = makeConvexDb();
    const id = await runLogWorkout({ db }, VALID_LOG);
    expect(store.workoutLogs).toHaveLength(1);
    const doc = store.workoutLogs[0];
    expect(id).toBe(doc._id);
    expect(doc).toMatchObject({
      userId: "user-1",
      date: "2026-08-04",
      workoutName: "Тренировка А",
      effort: "normal",
    });
    expect(doc.createdAt).toBeTypeOf("number");
  });
});

describe("listLogs", () => {
  beforeEach(() => {
    mockAuth(getAuthUserId);
  });

  it("без сессии возвращает пустой массив", async () => {
    mockAuth(getAuthUserId, "anonymous");
    const { db } = makeConvexDb();
    await expect(runListLogs({ db }, {})).resolves.toEqual([]);
  });

  it("без диапазона возвращает логи пользователя от новых к старым", async () => {
    const { db } = makeConvexDb({
      workoutLogs: [
        logDoc("l1", "user-1", "2026-08-01"),
        logDoc("l2", "user-1", "2026-08-04"),
        logDoc("l3", "user-2", "2026-08-02"),
      ],
    });
    const result = await runListLogs({ db }, {});
    expect(result.map((d) => d._id)).toEqual(["l2", "l1"]);
  });

  it("с границами from..to фильтрует включительно", async () => {
    const { db } = makeConvexDb({
      workoutLogs: [
        logDoc("l1", "user-1", "2026-07-01"),
        logDoc("l2", "user-1", "2026-07-15"),
        logDoc("l3", "user-1", "2026-08-04"),
      ],
    });
    const result = await runListLogs(
      { db },
      { from: "2026-07-01", to: "2026-07-31" },
    );
    expect(result.map((d) => d._id)).toEqual(["l2", "l1"]);
  });
});

describe("deleteLog", () => {
  beforeEach(() => {
    mockAuth(getAuthUserId);
  });

  it("без сессии бросает понятную ошибку", async () => {
    mockAuth(getAuthUserId, "anonymous");
    const { db } = makeConvexDb();
    const msg = await errorMessage(() => runDeleteLog({ db }, { id: "l1" }));
    expect(msg).toBe("Сессия истекла — войдите заново.");
  });

  it("несуществующая запись бросает ошибку", async () => {
    const { db } = makeConvexDb();
    const msg = await errorMessage(() => runDeleteLog({ db }, { id: "nope" }));
    expect(msg).toBe("Запись не найдена или уже удалена.");
  });

  it("чужую запись удалить нельзя", async () => {
    const { db, store } = makeConvexDb({
      workoutLogs: [logDoc("l1", "user-2", "2026-08-01")],
    });
    const msg = await errorMessage(() => runDeleteLog({ db }, { id: "l1" }));
    expect(msg).toBe("Запись не найдена или уже удалена.");
    expect(store.workoutLogs).toHaveLength(1);
  });

  it("своя запись удаляется", async () => {
    const { db, store } = makeConvexDb({
      workoutLogs: [logDoc("l1", "user-1", "2026-08-01")],
    });
    await expect(runDeleteLog({ db }, { id: "l1" })).resolves.toBeUndefined();
    expect(store.workoutLogs).toHaveLength(0);
  });
});
