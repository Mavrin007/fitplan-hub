/**
 * Юнит-тесты `foods` (src/convex/foods.ts) без Convex-рантайма: общий фейковый
 * ctx.db (src/test/convex-db-mock.ts) + мокнутый getAuthUserId, хендлеры
 * дёргаются напрямую (`_handler`).
 *
 * Проверяем серверную защиту: лимит выдачи и его клампинг, валидацию названия/
 * порции/калорий/макросов, права на чужой продукт при удалении.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@convex-dev/auth/server", () => ({ getAuthUserId: vi.fn() }));

import { getAuthUserId } from "@convex-dev/auth/server";
import { addFood, deleteFood, listMyFoods } from "./foods";
import {
  errorMessage,
  makeConvexDb,
  type ConvexDbMock,
  type ConvexDoc,
} from "@/test/convex-db-mock";

/** Поддельный Id<"users"> для мока авторизации (реальный тип не экспортируется). */
const USER_ID = "user-1" as unknown as Awaited<ReturnType<typeof getAuthUserId>>;

type AddFoodArgs = {
  name: string;
  amount: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

const runList = (
  listMyFoods as unknown as {
    _handler: (
      ctx: { db: ConvexDbMock },
      args: { limit?: number },
    ) => Promise<ConvexDoc[]>;
  }
)._handler;
const runAdd = (
  addFood as unknown as {
    _handler: (ctx: { db: ConvexDbMock }, args: AddFoodArgs) => Promise<unknown>;
  }
)._handler;
const runDelete = (
  deleteFood as unknown as {
    _handler: (ctx: { db: ConvexDbMock }, args: { id: string }) => Promise<unknown>;
  }
)._handler;

function foodDoc(id: string, userId: string, name: string): ConvexDoc {
  return {
    _id: id,
    _creationTime: 0,
    userId,
    name,
    amount: 100,
    unit: "г",
    calories: 300,
    protein: 10,
    carbs: 50,
    fat: 5,
    createdAt: 0,
  };
}

const VALID_ARGS: AddFoodArgs = {
  name: "Овсянка",
  amount: 100,
  unit: "г",
  calories: 300,
  protein: 10,
  carbs: 50,
  fat: 5,
};

describe("listMyFoods", () => {
  beforeEach(() => {
    vi.mocked(getAuthUserId).mockReset();
    vi.mocked(getAuthUserId).mockResolvedValue(USER_ID);
  });

  it("без сессии возвращает пустой массив", async () => {
    vi.mocked(getAuthUserId).mockResolvedValue(null);
    const { db } = makeConvexDb();
    await expect(runList({ db }, {})).resolves.toEqual([]);
  });

  it("возвращает только свои продукты", async () => {
    const { db } = makeConvexDb({
      foods: [
        foodDoc("f1", "user-1", "Овсянка"),
        foodDoc("f2", "user-2", "Чужой продукт"),
        foodDoc("f3", "user-1", "Рис"),
      ],
    });
    const result = await runList({ db }, {});
    expect(result.map((d) => d._id)).toEqual(["f1", "f3"]);
  });

  it("уважает лимит и клампит его в 1..500", async () => {
    // 501 продукт: проверяем и нижний кламп (минимум 1), и верхний (500),
    // — иначе assert на 9999 прошёл бы и без потолка.
    const foods = Array.from({ length: 501 }, (_, i) =>
      foodDoc(`f${i}`, "user-1", `Продукт ${i}`),
    );
    const { db } = makeConvexDb({ foods });
    expect(await runList({ db }, { limit: 2 })).toHaveLength(2);
    expect(await runList({ db }, { limit: 0 })).toHaveLength(1); // минимум 1
    expect(await runList({ db }, { limit: -5 })).toHaveLength(1);
    expect(await runList({ db }, { limit: 9999 })).toHaveLength(500); // потолок 500
  });

  it("по умолчанию отдаёт не больше DEFAULT_LIMIT (300)", async () => {
    const foods = Array.from({ length: 301 }, (_, i) =>
      foodDoc(`f${i}`, "user-1", `Продукт ${i}`),
    );
    const { db } = makeConvexDb({ foods });
    expect(await runList({ db }, {})).toHaveLength(300);
  });
});

describe("addFood", () => {
  beforeEach(() => {
    vi.mocked(getAuthUserId).mockReset();
    vi.mocked(getAuthUserId).mockResolvedValue(USER_ID);
  });

  it("без сессии бросает понятную ошибку", async () => {
    vi.mocked(getAuthUserId).mockResolvedValue(null);
    const { db } = makeConvexDb();
    const msg = await errorMessage(() => runAdd({ db }, VALID_ARGS));
    expect(msg).toBe("Сессия истекла — войдите заново.");
  });

  it("отклоняет пустое/слишком длинное название и единицу", async () => {
    const { db } = makeConvexDb();
    expect(
      await errorMessage(() => runAdd({ db }, { ...VALID_ARGS, name: "   " })),
    ).toBe("Название: от 1 до 100 символов");
    expect(
      await errorMessage(() =>
        runAdd({ db }, { ...VALID_ARGS, name: "а".repeat(101) }),
      ),
    ).toBe("Название: от 1 до 100 символов");
    expect(
      await errorMessage(() =>
        runAdd({ db }, { ...VALID_ARGS, unit: "с".repeat(21) }),
      ),
    ).toBe("Единица измерения: от 1 до 20 символов");
  });

  it("отклоняет порцию, калории и макросы вне диапазонов", async () => {
    const { db } = makeConvexDb();
    expect(
      await errorMessage(() => runAdd({ db }, { ...VALID_ARGS, amount: 0 })),
    ).toBe("Порция должен быть в диапазоне 1–10000");
    expect(
      await errorMessage(() => runAdd({ db }, { ...VALID_ARGS, amount: 10001 })),
    ).toBe("Порция должен быть в диапазоне 1–10000");
    expect(
      await errorMessage(() => runAdd({ db }, { ...VALID_ARGS, calories: -1 })),
    ).toBe("Калории должен быть в диапазоне 0–20000");
    expect(
      await errorMessage(() => runAdd({ db }, { ...VALID_ARGS, protein: 2001 })),
    ).toBe("Белки (г) должен быть в диапазоне 0–2000");
    expect(
      await errorMessage(() => runAdd({ db }, { ...VALID_ARGS, carbs: 2001 })),
    ).toBe("Углеводы (г) должен быть в диапазоне 0–2000");
    expect(
      await errorMessage(() => runAdd({ db }, { ...VALID_ARGS, fat: -1 })),
    ).toBe("Жиры (г) должен быть в диапазоне 0–2000");
  });

  it("создаёт продукт с userId и createdAt", async () => {
    const { db, store } = makeConvexDb();
    const id = await runAdd({ db }, VALID_ARGS);
    expect(store.foods).toHaveLength(1);
    expect(store.foods[0]).toMatchObject({
      ...VALID_ARGS,
      userId: "user-1",
    });
    expect(store.foods[0].createdAt).toBeTypeOf("number");
    expect(id).toBe(store.foods[0]._id);
  });
});

describe("deleteFood", () => {
  beforeEach(() => {
    vi.mocked(getAuthUserId).mockReset();
    vi.mocked(getAuthUserId).mockResolvedValue(USER_ID);
  });

  it("без сессии бросает понятную ошибку", async () => {
    vi.mocked(getAuthUserId).mockResolvedValue(null);
    const { db } = makeConvexDb();
    const msg = await errorMessage(() => runDelete({ db }, { id: "f1" }));
    expect(msg).toBe("Сессия истекла — войдите заново.");
  });

  it("несуществующий продукт бросает ошибку", async () => {
    const { db } = makeConvexDb();
    const msg = await errorMessage(() => runDelete({ db }, { id: "nope" }));
    expect(msg).toBe("Продукт не найден или уже удалён.");
  });

  it("чужой продукт удалить нельзя (ошибка, продукт остаётся)", async () => {
    const { db, store } = makeConvexDb({
      foods: [foodDoc("f1", "user-2", "Чужой")],
    });
    const msg = await errorMessage(() => runDelete({ db }, { id: "f1" }));
    expect(msg).toBe("Продукт не найден или уже удалён.");
    expect(store.foods).toHaveLength(1);
  });

  it("свой продукт удаляется", async () => {
    const { db, store } = makeConvexDb({
      foods: [foodDoc("f1", "user-1", "Овсянка")],
    });
    await expect(runDelete({ db }, { id: "f1" })).resolves.toBeUndefined();
    expect(store.foods).toHaveLength(0);
  });
});
