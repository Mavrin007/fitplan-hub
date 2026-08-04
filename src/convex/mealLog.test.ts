/**
 * Юнит-тесты `mealLog` (src/convex/mealLog.ts) без Convex-рантайма: общий
 * фейковый ctx.db (src/test/convex-db-mock.ts) + мокнутый getAuthUserId,
 * хендлеры дёргаются напрямую (`_handler`).
 *
 * Проверяем серверную защиту: границы дат и фильтр по владельцу, валидацию
 * полей записи, лимит массива, права на чужую запись при обновлении/удалении.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@convex-dev/auth/server", () => ({
  getAuthUserId: vi.fn(),
  // mealLog.ts импортирует mealTypeValidator из schema.ts, а тот спредит
  // authTables — в тестах достаточно пустого объекта-заглушки.
  authTables: {},
}));

import { getAuthUserId } from "@convex-dev/auth/server";
import {
  addEntries,
  addEntry,
  deleteEntry,
  getByDate,
  getByRange,
  updateEntry,
} from "./mealLog";
import {
  errorMessage,
  makeConvexDb,
  type ConvexDbMock,
  type ConvexDoc,
} from "@/test/convex-db-mock";

/** Поддельный Id<"users"> для мока авторизации (реальный тип не экспортируется). */
const USER_ID = "user-1" as unknown as Awaited<ReturnType<typeof getAuthUserId>>;

type EntryArgs = {
  date: string;
  mealType: string;
  name: string;
  quantity: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

const VALID_ENTRY: EntryArgs = {
  date: "2026-08-04",
  mealType: "lunch",
  name: "Куриная грудка",
  quantity: 1,
  calories: 500,
  protein: 40,
  carbs: 0,
  fat: 10,
};

const runByDate = (
  getByDate as unknown as {
    _handler: (ctx: { db: ConvexDbMock }, args: { date: string }) => Promise<ConvexDoc[]>;
  }
)._handler;
const runByRange = (
  getByRange as unknown as {
    _handler: (
      ctx: { db: ConvexDbMock },
      args: { from: string; to: string },
    ) => Promise<ConvexDoc[]>;
  }
)._handler;
const runAdd = (
  addEntry as unknown as {
    _handler: (ctx: { db: ConvexDbMock }, args: EntryArgs) => Promise<unknown>;
  }
)._handler;
const runAddMany = (
  addEntries as unknown as {
    _handler: (
      ctx: { db: ConvexDbMock },
      args: { entries: EntryArgs[] },
    ) => Promise<unknown>;
  }
)._handler;
const runUpdate = (
  updateEntry as unknown as {
    _handler: (ctx: { db: ConvexDbMock }, args: { id: string } & EntryArgs) => Promise<unknown>;
  }
)._handler;
const runDelete = (
  deleteEntry as unknown as {
    _handler: (ctx: { db: ConvexDbMock }, args: { id: string }) => Promise<unknown>;
  }
)._handler;

function mealDoc(id: string, userId: string, date: string, name: string): ConvexDoc {
  return {
    _id: id,
    _creationTime: 0,
    userId,
    date,
    mealType: "lunch",
    name,
    quantity: 1,
    calories: 500,
    protein: 40,
    carbs: 0,
    fat: 10,
    createdAt: 0,
  };
}

describe("getByDate / getByRange", () => {
  beforeEach(() => {
    vi.mocked(getAuthUserId).mockReset();
    vi.mocked(getAuthUserId).mockResolvedValue(USER_ID);
  });

  it("без сессии возвращают пустой массив", async () => {
    vi.mocked(getAuthUserId).mockResolvedValue(null);
    const { db } = makeConvexDb();
    await expect(runByDate({ db }, { date: "2026-08-04" })).resolves.toEqual([]);
    await expect(
      runByRange({ db }, { from: "2026-08-01", to: "2026-08-04" }),
    ).resolves.toEqual([]);
  });

  it("getByDate возвращает только свои записи за дату", async () => {
    const { db } = makeConvexDb({
      mealLog: [
        mealDoc("m1", "user-1", "2026-08-04", "Обед"),
        mealDoc("m2", "user-1", "2026-08-04", "Ужин"),
        mealDoc("m3", "user-1", "2026-08-03", "Завтрак"),
        mealDoc("m4", "user-2", "2026-08-04", "Чужой"),
      ],
    });
    const result = await runByDate({ db }, { date: "2026-08-04" });
    expect(result.map((d) => d._id)).toEqual(["m1", "m2"]);
  });

  it("getByRange уважает включительные границы и фильтр по владельцу", async () => {
    const { db } = makeConvexDb({
      mealLog: [
        mealDoc("m1", "user-1", "2026-08-01", "Первая"), // = from
        mealDoc("m2", "user-1", "2026-08-02", "Вторая"),
        mealDoc("m3", "user-1", "2026-08-04", "Последняя"), // = to
        mealDoc("m4", "user-1", "2026-07-31", "Вне слева"),
        mealDoc("m5", "user-1", "2026-08-05", "Вне справа"),
        mealDoc("m6", "user-2", "2026-08-02", "Чужой"),
      ],
    });
    const result = await runByRange(
      { db },
      { from: "2026-08-01", to: "2026-08-04" },
    );
    expect(result.map((d) => d._id)).toEqual(["m1", "m2", "m3"]);
  });
});

describe("addEntry", () => {
  beforeEach(() => {
    vi.mocked(getAuthUserId).mockReset();
    vi.mocked(getAuthUserId).mockResolvedValue(USER_ID);
  });

  it("без сессии бросает понятную ошибку", async () => {
    vi.mocked(getAuthUserId).mockResolvedValue(null);
    const { db } = makeConvexDb();
    const msg = await errorMessage(() => runAdd({ db }, VALID_ENTRY));
    expect(msg).toBe("Сессия истекла — войдите заново.");
  });

  it("отклоняет невалидную дату и пустое название", async () => {
    const { db } = makeConvexDb();
    expect(
      await errorMessage(() => runAdd({ db }, { ...VALID_ENTRY, date: "04-08-2026" })),
    ).toBe("Некорректная дата");
    expect(
      await errorMessage(() => runAdd({ db }, { ...VALID_ENTRY, name: "" })),
    ).toBe("Название: от 1 до 100 символов");
  });

  it("отклоняет количество, калории и макросы вне диапазонов", async () => {
    const { db } = makeConvexDb();
    expect(
      await errorMessage(() => runAdd({ db }, { ...VALID_ENTRY, quantity: -1 })),
    ).toBe("Количество должен быть в диапазоне 0–1000");
    expect(
      await errorMessage(() => runAdd({ db }, { ...VALID_ENTRY, quantity: 1001 })),
    ).toBe("Количество должен быть в диапазоне 0–1000");
    expect(
      await errorMessage(() => runAdd({ db }, { ...VALID_ENTRY, calories: 20001 })),
    ).toBe("Калории должен быть в диапазоне 0–20000");
    expect(
      await errorMessage(() => runAdd({ db }, { ...VALID_ENTRY, protein: 2001 })),
    ).toBe("Белки (г) должен быть в диапазоне 0–2000");
    expect(
      await errorMessage(() => runAdd({ db }, { ...VALID_ENTRY, fat: -1 })),
    ).toBe("Жиры (г) должен быть в диапазоне 0–2000");
  });

  it("создаёт запись с userId и createdAt", async () => {
    const { db, store } = makeConvexDb();
    const id = await runAdd({ db }, VALID_ENTRY);
    expect(store.mealLog).toHaveLength(1);
    expect(store.mealLog[0]).toMatchObject({ ...VALID_ENTRY, userId: "user-1" });
    expect(store.mealLog[0].createdAt).toBeTypeOf("number");
    expect(id).toBe(store.mealLog[0]._id);
  });
});

describe("addEntries", () => {
  beforeEach(() => {
    vi.mocked(getAuthUserId).mockReset();
    vi.mocked(getAuthUserId).mockResolvedValue(USER_ID);
  });

  it("без сессии бросает понятную ошибку", async () => {
    vi.mocked(getAuthUserId).mockResolvedValue(null);
    const { db } = makeConvexDb();
    const msg = await errorMessage(() => runAddMany({ db }, { entries: [VALID_ENTRY] }));
    expect(msg).toBe("Сессия истекла — войдите заново.");
  });

  it("отклоняет больше 50 записей за раз", async () => {
    const { db } = makeConvexDb();
    const entries = Array.from({ length: 51 }, () => VALID_ENTRY);
    const msg = await errorMessage(() => runAddMany({ db }, { entries }));
    expect(msg).toBe("Записи дневника: не более 50 элементов");
  });

  it("одна невалидная запись отклоняет весь пакет — ничего не вставляется", async () => {
    const { db, store } = makeConvexDb();
    const msg = await errorMessage(() =>
      runAddMany({ db }, {
        entries: [VALID_ENTRY, { ...VALID_ENTRY, name: "" }],
      }),
    );
    expect(msg).toBe("Название: от 1 до 100 символов");
    expect(store.mealLog).toHaveLength(0);
  });

  it("вставляет все записи с userId", async () => {
    const { db, store } = makeConvexDb();
    await runAddMany({ db }, {
      entries: [
        { ...VALID_ENTRY, mealType: "breakfast" },
        { ...VALID_ENTRY, mealType: "dinner", date: "2026-08-05" },
      ],
    });
    expect(store.mealLog).toHaveLength(2);
    expect(store.mealLog.every((e) => e.userId === "user-1")).toBe(true);
  });
});

describe("updateEntry", () => {
  beforeEach(() => {
    vi.mocked(getAuthUserId).mockReset();
    vi.mocked(getAuthUserId).mockResolvedValue(USER_ID);
  });

  it("без сессии бросает понятную ошибку", async () => {
    vi.mocked(getAuthUserId).mockResolvedValue(null);
    const { db } = makeConvexDb();
    const msg = await errorMessage(() => runUpdate({ db }, { id: "m1", ...VALID_ENTRY }));
    expect(msg).toBe("Сессия истекла — войдите заново.");
  });

  it("чужую или несуществующую запись нельзя обновить", async () => {
    const { db, store } = makeConvexDb({
      mealLog: [mealDoc("m1", "user-2", "2026-08-04", "Чужой")],
    });
    expect(
      await errorMessage(() => runUpdate({ db }, { id: "m1", ...VALID_ENTRY })),
    ).toBe("Запись не найдена или уже удалена.");
    expect(
      await errorMessage(() => runUpdate({ db }, { id: "nope", ...VALID_ENTRY })),
    ).toBe("Запись не найдена или уже удалена.");
    expect(store.mealLog[0].name).toBe("Чужой");
  });

  it("обновляет свою запись: поля патчатся, дата не трогается", async () => {
    const { db, store } = makeConvexDb({
      mealLog: [mealDoc("m1", "user-1", "2026-08-04", "Обед")],
    });
    await runUpdate({ db }, {
      id: "m1",
      ...VALID_ENTRY,
      name: "Обед побольше",
      calories: 600,
    });
    expect(store.mealLog[0]).toMatchObject({
      _id: "m1",
      name: "Обед побольше",
      calories: 600,
      date: "2026-08-04", // дата не входит в патч
      userId: "user-1",
    });
  });

  it("валидирует новые значения при обновлении", async () => {
    const { db, store } = makeConvexDb({
      mealLog: [mealDoc("m1", "user-1", "2026-08-04", "Обед")],
    });
    const msg = await errorMessage(() =>
      runUpdate({ db }, { id: "m1", ...VALID_ENTRY, name: "" }),
    );
    expect(msg).toBe("Название: от 1 до 100 символов");
    expect(store.mealLog[0].name).toBe("Обед");
  });
});

describe("deleteEntry", () => {
  beforeEach(() => {
    vi.mocked(getAuthUserId).mockReset();
    vi.mocked(getAuthUserId).mockResolvedValue(USER_ID);
  });

  it("без сессии бросает понятную ошибку", async () => {
    vi.mocked(getAuthUserId).mockResolvedValue(null);
    const { db } = makeConvexDb();
    const msg = await errorMessage(() => runDelete({ db }, { id: "m1" }));
    expect(msg).toBe("Сессия истекла — войдите заново.");
  });

  it("чужую или несуществующую запись нельзя удалить", async () => {
    const { db, store } = makeConvexDb({
      mealLog: [mealDoc("m1", "user-2", "2026-08-04", "Чужой")],
    });
    expect(
      await errorMessage(() => runDelete({ db }, { id: "m1" })),
    ).toBe("Запись не найдена или уже удалена.");
    expect(
      await errorMessage(() => runDelete({ db }, { id: "nope" })),
    ).toBe("Запись не найдена или уже удалена.");
    expect(store.mealLog).toHaveLength(1);
  });

  it("своя запись удаляется", async () => {
    const { db, store } = makeConvexDb({
      mealLog: [mealDoc("m1", "user-1", "2026-08-04", "Обед")],
    });
    await expect(runDelete({ db }, { id: "m1" })).resolves.toBeUndefined();
    expect(store.mealLog).toHaveLength(0);
  });
});
