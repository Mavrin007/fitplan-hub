/**
 * Мок для `convex/react` и `@/convex/_generated/api` в компонентных тестах.
 *
 * Реальный `api` — это Proxy (`anyApi`), который при каждом обращении создаёт
 * новый объект без стабильного identity, поэтому тесты не могут адресовать
 * запросы по ссылкам на функции. Вместо этого мок подменяет модуль api на
 * обычные объекты с меткой `__path`, а результаты и вызовы ключуются по этой
 * метке (+ сериализованные args).
 *
 * Подключение в тесте:
 *   vi.mock("convex/react", () => import("@/test/convex-react-mock"));
 *   vi.mock("@/convex/_generated/api", () => import("@/test/convex-react-mock"));
 */
import { vi } from "vitest";

// Внутреннее состояние — в vi.hoisted, чтобы фабрики vi.mock могли захватить
// его, не попадая под TDZ-ограничения хойстинга.
const state = vi.hoisted(() => ({
  queryResults: new Map<string, unknown>(),
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

function pathOf(ref: unknown): string {
  if (ref && typeof ref === "object" && "__path" in ref) {
    return (ref as { __path: string }).__path;
  }
  return String(ref);
}

// args сериализуются как есть: для многоключевых объектов порядок свойств
// должен совпадать в setQuery() и в вызове useQuery() компонентом.
function keyOf(path: string, args: unknown): string {
  return `${path}:${JSON.stringify(args ?? null)}`;
}

/** useQuery из convex/react — возвращает результат, заданный через setQuery(). */
export function useQuery(ref: unknown, args?: unknown): unknown {
  return convexMock.queryResults.get(keyOf(pathOf(ref), args));
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

/** Задать реализацию мутации (например, отклоняющуюся с ошибкой). */
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
  convexMock.mutationCalls = [];
}
