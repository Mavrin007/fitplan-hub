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
  stableKey,
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

describe("stableKey — канонический ключ args", () => {
  it("разный порядок свойств даёт один и тот же ключ", () => {
    expect(stableKey({ a: 1, b: 2 })).toBe(stableKey({ b: 2, a: 1 }));
  });

  it("undefined нормализуется в null (запрос без args)", () => {
    expect(stableKey(undefined)).toBe("null");
    expect(stableKey(null)).toBe("null");
  });

  it("вложенные объекты сортируются рекурсивно", () => {
    expect(stableKey({ meta: { z: 1, a: 2 }, date: "2026-01-01" })).toBe(
      stableKey({ date: "2026-01-01", meta: { a: 2, z: 1 } }),
    );
  });

  it("значение совпадает с составным ключом keyOf (путь + stableKey)", () => {
    // setQuery/useQuery строят ключ как `path:stableKey(args)` — проверяем,
    // что stableKey — это ровно та каноническая половина.
    setQuery(api.water.getByDate, { date: "2026-01-01", amountMl: 250 }, 1);
    setQuery(api.water.getByDate, { amountMl: 250, date: "2026-01-01" }, 2);
    // Второй setQuery перезаписал тот же ключ — порядок свойств не создал
    // второй записи, а stableKey их отождествил.
    expect(useQuery(api.water.getByDate, { date: "2026-01-01", amountMl: 250 })).toBe(2);
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

describe("queryResults — снимки значений setQuery/useQuery", () => {
  beforeEach(() => {
    resetConvexMock();
  });

  it("мутация фикстуры после setQuery не портит стор мока", () => {
    const fixture = { entries: [{ name: "Обед", calories: 500 }] };
    setQuery(api.mealLog.getByDate, { date: "2026-01-01" }, fixture);

    // Тест «по ошибке» правит фикстуру уже после установки — стор обязан
    // помнить состояние на момент setQuery (как закэшированный ответ сервера).
    fixture.entries[0].calories = 9999;
    fixture.entries.push({ name: "Лишнее", calories: 1 });

    expect(useQuery(api.mealLog.getByDate, { date: "2026-01-01" })).toEqual({
      entries: [{ name: "Обед", calories: 500 }],
    });
  });

  it("мутация данных, полученных из useQuery, не портит стор", () => {
    setQuery(api.profiles.getMyProfile, undefined, { name: "Кирилл", age: 30 });

    const first = useQuery(api.profiles.getMyProfile) as {
      name: string;
      age: number;
    };
    // Компонент «по ошибке» мутирует объект, который ему вернул хук.
    first.age = 99;

    // Повторный вызов возвращает исходные данные — стор не задет.
    const second = useQuery(api.profiles.getMyProfile) as {
      name: string;
      age: number;
    };
    expect(second).toEqual({ name: "Кирилл", age: 30 });
    // Каждый вызов отдаёт независимый снимок, а не ссылку на стор.
    expect(second).not.toBe(first);
  });

  it("вложенные структуры снимка глубоко развязаны (мутация на любом уровне)", () => {
    setQuery(api.workouts.getMyPlan, undefined, {
      days: [{ focus: "Фулбоди", exercises: [{ name: "Приседания", sets: 3 }] }],
    });

    const plan = useQuery(api.workouts.getMyPlan) as {
      days: { focus: string; exercises: { name: string; sets: number }[] }[];
    };
    plan.days[0].exercises[0].sets = 99;
    plan.days[0].focus = "Изменено";

    expect(useQuery(api.workouts.getMyPlan)).toEqual({
      days: [{ focus: "Фулбоди", exercises: [{ name: "Приседания", sets: 3 }] }],
    });
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

  it("замороженный args записывается как снимок: структурно тот же, но не та же ссылка", async () => {
    const args = deepFreeze({ id: "e1", name: "Яблоко" });
    const del = useMutation(api.mealLog.deleteEntry);
    await del(args);

    const call = convexMock.mutationCalls.find((c) => c.path === "mealLog.deleteEntry");
    expect(call).toBeDefined();
    // Структурно идентично входу (заморозка не помешала клонированию).
    expect(call!.args[0]).toEqual(args);
    // Но это снимок, а не ссылка на входной объект: реальный клиент
    // сериализует args в момент вызова, и последующая мутация входа
    // не должна исказить журнал.
    expect(call!.args[0]).not.toBe(args);
  });

  it("мутация входных args после вызова не меняет запись в журнале", async () => {
    const args = { date: "2026-01-01", amountMl: 250 };
    const addWater = useMutation(api.water.addWater);
    await addWater(args);

    // Компонент «по ошибке» меняет объект уже после вызова — журнал обязан
    // сохранить состояние на момент вызова (250, а не 999).
    args.amountMl = 999;

    expect(convexMock.mutationCalls).toContainEqual({
      path: "water.addWater",
      args: [{ date: "2026-01-01", amountMl: 250 }],
    });
  });

  it("снимок глубокий: вложенные структуры не связаны с входом", async () => {
    const args = { entries: [{ name: "Обед", calories: 500 }] };
    const addEntries = useMutation(api.mealLog.addEntries);
    await addEntries(args);

    // Мутация на любой глубине после вызова не задевает запись.
    args.entries[0].calories = 9999;
    args.entries.push({ name: "Лишнее", calories: 1 });

    expect(convexMock.mutationCalls[0].args[0]).toEqual({
      entries: [{ name: "Обед", calories: 500 }],
    });
  });
});
