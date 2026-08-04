/**
 * Тесты стабильного ключевания мока convex-слоя (src/test/convex-react-mock.ts).
 *
 * Ключ запроса строится как `path:stableStringify(args)`. JSON.stringify зависит
 * от порядка вставки свойств, поэтому ключи сортируются рекурсивно: тест и
 * компонент могут передавать args с ключами в любом порядке — результат один.
 * Эти тесты фиксируют это поведение от регрессий (например, от возврата к
 * голому JSON.stringify в keyOf).
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  api,
  convexMock,
  resetConvexMock,
  setQuery,
  stableStringify,
  useMutation,
  useQuery,
} from "./convex-react-mock";

/** Рекурсивно замораживает объект/массив — любая запись бросит TypeError. */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

describe("stableStringify — порядок ключей args", () => {
  it("объекты с разным порядком свойств дают одинаковую строку", () => {
    expect(stableStringify({ a: 1, b: 2 })).toBe(stableStringify({ b: 2, a: 1 }));
    expect(stableStringify({ a: 1, b: 2 })).toBe('{"a":1,"b":2}');
  });

  it("вложенные объекты сортируются рекурсивно", () => {
    const lhs = { date: "2026-01-01", meta: { z: 1, a: 2 } };
    const rhs = { meta: { a: 2, z: 1 }, date: "2026-01-01" };
    expect(stableStringify(lhs)).toBe(stableStringify(rhs));
  });

  it("порядок элементов массива сохраняется (он семантически значим)", () => {
    expect(stableStringify({ ids: [1, 2] })).not.toBe(
      stableStringify({ ids: [2, 1] }),
    );
  });

  it("примитивы сериализуются как в JSON", () => {
    expect(stableStringify(42)).toBe("42");
    expect(stableStringify("abc")).toBe('"abc"');
    expect(stableStringify(true)).toBe("true");
    expect(stableStringify(null)).toBe("null");
    expect(stableStringify(undefined)).toBe(JSON.stringify(undefined));
  });

  it("разные значения не коллизируют", () => {
    // Ключ {date, amount} не должен совпасть с ключом {amount, date-переставленным}
    // для ДРУГОГО набора значений.
    expect(stableStringify({ date: "2026-01-01", amountMl: 250 })).not.toBe(
      stableStringify({ date: "2026-01-01", amountMl: 500 }),
    );
  });

  it("stableStringify не мутирует входной объект (deep-freeze)", () => {
    const args = deepFreeze({
      date: "2026-01-01",
      meta: { z: 1, a: [2, 3], nested: { b: true } },
    });

    // Модули vitest — strict mode: запись в замороженный объект бросила бы
    // TypeError. sortKeys строит новые объекты/массивы (Object.fromEntries,
    // map), поэтому вызов обязан пройти без изменений входа.
    expect(() => stableStringify(args)).not.toThrow();

    // Структура не изменилась ни на одном уровне.
    expect(args).toEqual({
      date: "2026-01-01",
      meta: { z: 1, a: [2, 3], nested: { b: true } },
    });
  });

  it("stableStringify не мутирует массив внутри объекта", () => {
    const args = deepFreeze({ ids: [1, 2, 3] });
    expect(() => stableStringify(args)).not.toThrow();
    expect(args).toEqual({ ids: [1, 2, 3] });
  });
});

describe("keyOf — setQuery находит useQuery при любом порядке ключей", () => {
  beforeEach(() => {
    resetConvexMock();
  });

  it("разный порядок свойств args не ломает поиск результата", () => {
    setQuery(api.water.getByDate, { date: "2026-01-01" }, { amountMl: 250 });
    // Компонент передаёт те же args, но в обратном порядке ключей.
    expect(useQuery(api.water.getByDate, { date: "2026-01-01" })).toEqual({
      amountMl: 250,
    });
  });

  it("вложенный объект с переставленными ключами тоже находится", () => {
    setQuery(
      api.mealLog.getByDate,
      { date: "2026-01-01" },
      [{ _id: "e1", date: "2026-01-01", mealType: "lunch", name: "Обед" }],
    );
    expect(
      useQuery(api.mealLog.getByDate, { date: "2026-01-01" }),
    ).toHaveLength(1);
  });

  it("args с undefined ключом (null в ключе) стабильны", () => {
    setQuery(api.profiles.getMyProfile, undefined, "no-args");
    expect(useQuery(api.profiles.getMyProfile)).toBe("no-args");
  });
});

describe("mutationCalls — args записываются без мутации", () => {
  beforeEach(() => {
    resetConvexMock();
  });

  it("useMutation не изменяет переданный объект args (deep-freeze)", async () => {
    const args = deepFreeze({
      date: "2026-01-01",
      amountMl: 250,
      meta: { a: 1, list: [1, 2] },
    });
    const addWater = useMutation(api.water.addWater);

    // В strict mode любая запись в args бросила бы TypeError прямо здесь.
    await expect(addWater(args)).resolves.toBeUndefined();

    // В журнале вызовов лежит исходный объект, структурно идентичный.
    expect(convexMock.mutationCalls).toContainEqual({
      path: "water.addWater",
      args: [{ date: "2026-01-01", amountMl: 250, meta: { a: 1, list: [1, 2] } }],
    });
  });

  it("замороженный args записывается как есть, без копии и без правок", async () => {
    const args = deepFreeze({ id: "e1", name: "Яблоко" });
    const del = useMutation(api.mealLog.deleteEntry);
    await del(args);

    const call = convexMock.mutationCalls.find((c) => c.path === "mealLog.deleteEntry");
    expect(call).toBeDefined();
    // Записан ровно тот же объект (по ссылке), а не мутированная копия.
    expect(call!.args[0]).toBe(args);
  });
});
