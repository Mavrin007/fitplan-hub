/**
 * Мок для `convex/react` и `@/convex/_generated/api` в компонентных тестах.
 *
 * Почему так: реальный `api` — это Proxy (`anyApi`), который при каждом
 * обращении создаёт новый объект без стабильного identity, поэтому тесты не
 * могут адресовать запросы по ссылкам на функции. Вместо этого мок подменяет
 * модуль api на обычные объекты с меткой `__path`, а мок convex/react ключует
 * результаты и вызовы по этой метке (+ сериализованные args).
 *
 * Подключение в тесте:
 *   vi.mock("convex/react", () => import("@/test/convex-react-mock"));
 *   vi.mock("@/convex/_generated/api", () => import("@/test/convex-react-mock"));
 */
import { vi } from "vitest";

// Внутреннее состояние — оборачиваем в vi.hoisted, чтобы фабрики vi.mock
// могли захватить его, не попадая под TDZ-ограничения хойстинга.
const state = vi.hoisted(() => ({
  queryResults: new Map<string, unknown>(),
  queryCalls: [] as { path: string; args: unknown }[],
  mutationImpls: new Map<string, (...args: unknown[]) => Promise<unknown>>(),
  mutationCalls: [] as { path: string; args: unknown[] }[],
}));

/** Общее состояние мока — живёт между рендерами в пределах одного теста. */
export const convexMock = state;

/** Стабильная ссылка на convex-функцию для мока api. */
function ref(path: string): { __path: string } {
  return { __path: path };
}

/** Мок `@/convex/_generated/api` — только функции, которые используют страницы. */
export const api = {
  profiles: { getMyProfile: ref("profiles.getMyProfile") },
  mealLog: {
    getByDate: ref("mealLog.getByDate"),
    addEntry: ref("mealLog.addEntry"),
    addEntries: ref("mealLog.addEntries"),
    updateEntry: ref("mealLog.updateEntry"),
    deleteEntry: ref("mealLog.deleteEntry"),
  },
  foods: {
    listMyFoods: ref("foods.listMyFoods"),
    addFood: ref("foods.addFood"),
    deleteFood: ref("foods.deleteFood"),
  },
  weightEntries: { listMyWeights: ref("weightEntries.listMyWeights") },
  workouts: { listLogs: ref("workouts.listLogs") },
  water: { getByDate: ref("water.getByDate"), addWater: ref("water.addWater") },
  activity: { getActivityDays: ref("activity.getActivityDays") },
};

// Остальные экспорты generated-модуля — страницы их не используют.
export const internal = {};
export const components = {};

function pathOf(ref: unknown): string {
  if (ref && typeof ref === "object" && "__path" in ref) {
    return (ref as { __path: string }).__path;
  }
  return String(ref);
}

/** Стабильная сериализация args: сортируем ключи объектов рекурсивно, чтобы
 *  порядок свойств в объекте не влиял на совпадение setQuery/useQuery.
 *  Иначе `{ a: 1, b: 2 }` и `{ b: 2, a: 1 }` дали бы разные ключи и мок
 *  молча вернул бы undefined вместо фикстуры. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function keyOf(path: string, args: unknown): string {
  return `${path}:${stableStringify(args ?? null)}`;
}

/** useQuery из convex/react — возвращает результат, заданный через setQuery(). */
export function useQuery(ref: unknown, args?: unknown): unknown {
  const path = pathOf(ref);
  const key = keyOf(path, args);
  convexMock.queryCalls.push({ path, args });
  return convexMock.queryResults.has(key)
    ? convexMock.queryResults.get(key)
    : undefined;
}

/** useMutation из convex/react — записывает вызовы, реализацию можно задать. */
export function useMutation(ref: unknown) {
  return (...args: unknown[]) => {
    const path = pathOf(ref);
    convexMock.mutationCalls.push({ path, args });
    const impl = convexMock.mutationImpls.get(path);
    return impl ? impl(...args) : Promise.resolve();
  };
}

/** Задать результат useQuery(ref, args). */
export function setQuery(ref: unknown, args: unknown, value: unknown): void {
  convexMock.queryResults.set(keyOf(pathOf(ref), args), value);
}

/** Задать реализацию мутации (например, резолвящуюся с задержкой). */
export function setMutation(
  ref: unknown,
  impl: (...args: unknown[]) => Promise<unknown>,
): void {
  convexMock.mutationImpls.set(pathOf(ref), impl);
}

/** Очистить состояние мока между тестами. */
export function resetConvexMock(): void {
  convexMock.queryResults.clear();
  convexMock.mutationImpls.clear();
  convexMock.queryCalls = [];
  convexMock.mutationCalls = [];
}
