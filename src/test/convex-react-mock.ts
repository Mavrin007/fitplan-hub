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
  actionImpls: new Map<string, (...args: unknown[]) => Promise<unknown>>(),
  convexAuthState: { isLoading: false, isAuthenticated: false } as {
    isLoading: boolean;
    isAuthenticated: boolean;
  },
}));

/** Общее состояние мока — живёт между рендерами в пределах одного теста. */
export const convexMock = state;

/** Стабильная ссылка на convex-функцию для мока api. */
function ref(path: string): { __path: string } {
  return { __path: path };
}

/** Мок `@/convex/_generated/api` — только функции, которые используют страницы. */
export const api = {
  profiles: {
    getMyProfile: ref("profiles.getMyProfile"),
    upsertProfile: ref("profiles.upsertProfile"),
  },
  mealLog: {
    getByDate: ref("mealLog.getByDate"),
    getByRange: ref("mealLog.getByRange"),
    getDailyTotals: ref("mealLog.getDailyTotals"),
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
  weightEntries: {
    listMyWeights: ref("weightEntries.listMyWeights"),
    addWeight: ref("weightEntries.addWeight"),
    deleteWeight: ref("weightEntries.deleteWeight"),
  },
  workouts: {
    listLogs: ref("workouts.listLogs"),
    getMyPlan: ref("workouts.getMyPlan"),
    savePlan: ref("workouts.savePlan"),
    logWorkout: ref("workouts.logWorkout"),
    deleteLog: ref("workouts.deleteLog"),
  },
  water: {
    getByDate: ref("water.getByDate"),
    addWater: ref("water.addWater"),
    listMyWater: ref("water.listMyWater"),
  },
  activity: { getActivityDays: ref("activity.getActivityDays") },
  digest: { getMyWeeklyDigest: ref("digest.getMyWeeklyDigest") },
  guestStats: {
    hasMyData: ref("guestStats.hasMyData"),
    countMyData: ref("guestStats.countMyData"),
  },
  devOtp: { getByEmail: ref("devOtp.getByEmail") },
  otpRateLimit: {
    canSend: ref("otpRateLimit.canSend"),
    canAttempt: ref("otpRateLimit.canAttempt"),
  },
  users: { currentUser: ref("users.currentUser") },
  account: {
    exportMyData: ref("account.exportMyData"),
    deleteMyAccount: ref("account.deleteMyAccount"),
  },
  assistant: {
    chat: ref("assistant.chat"),
    checkConnection: ref("assistant.checkConnection"),
  },
  assistantLimits: { getMyLimit: ref("assistantLimits.getMyLimit") },
  analytics: { track: ref("analytics.track") },
  premium: { getMyAccess: ref("premium.getMyAccess") },
  photo: { analyzeMealPhoto: ref("photo.analyzeMealPhoto") },
  rateLimit: { consumeRateLimitAction: ref("rateLimit.consumeRateLimitAction") },
  telegram: {
    myLink: ref("telegram.myLink"),
    requestLinkCode: ref("telegram.requestLinkCode"),
    unlink: ref("telegram.unlink"),
  },
};

function pathOf(ref: unknown): string {
  if (ref && typeof ref === "object" && "__path" in ref) {
    return (ref as { __path: string }).__path;
  }
  return String(ref);
}

/** Рекурсивно сортирует ключи объектов, массивы и примитивы оставляет как есть. */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(obj)
        .sort()
        .map((k) => [k, sortKeys(obj[k])]),
    );
  }
  return value;
}

/**
 * Стабильная сериализация args для ключей мока.
 *
 * JSON.stringify зависит от порядка вставки свойств, а тест и компонент могут
 * передавать args с ключами в разном порядке (особенно после того, как поля
 * мутации переупорядочены в коде). Сортируем ключи рекурсивно — один и тот же
 * объект всегда даёт один и тот же ключ; порядок элементов массива сохраняется
 * (он семантически значим).
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

/** Канонический ключ args: стабильная сериализация с сортировкой ключей,
 *  undefined нормализуется в null (запрос без args). Единая точка, где args
 *  превращаются в строку — используйте её для ключей и прямых сравнений. */
export function stableKey(args: unknown): string {
  return stableStringify(args ?? null);
}

// Ключ запроса = путь + канонический ключ args: порядок свойств не влияет на
// ключ, поэтому setQuery() и вызов useQuery() компонентом всегда совпадают.
function keyOf(path: string, args: unknown): string {
  return `${path}:${stableKey(args)}`;
}

/**
 * Глубокая копия args для журнала вызовов. Реальный convex-клиент
 * сериализует args в JSON в момент вызова, поэтому запись должна быть
 * «снимком» на этот момент, а не ссылкой на объект, который компонент может
 * мутировать позже. Args всегда JSON-сериализуемы (иначе они не пересекли бы
 * провод), поэтому structuredClone не бросает для легитимных входов — если
 * он всё же бросит, это баг фикстуры, и лучше упасть громко, чем молча
 * сохранить ссылку. (impl мутации при этом получает живой объект args —
 * журнал это не затрагивает.)
 */
function snapshotArgs(args: unknown[]): unknown[] {
  return structuredClone(args);
}

/** useQuery из convex/react — возвращает результат, заданный через setQuery().
 *  Значение отдаётся снимком (structuredClone): компонент не должен иметь
 *  доступа к внутреннему стору мока, поэтому мутация полученного объекта
 *  (например, в setState-обёртке) не может исказить последующие вызовы. */
export function useQuery(ref: unknown, args?: unknown): unknown {
  return structuredClone(convexMock.queryResults.get(keyOf(pathOf(ref), args)));
}

/** useConvexAuth из convex/react — { isLoading, isAuthenticated }. */
export function useConvexAuth() {
  return convexMock.convexAuthState;
}

/** useConvex из convex/react — клиент для разовых вызовов convex.query()
 *  (используется в Auth для пред-проверки rate-limit перед signIn). Возвращает
 *  результат из того же стора, что и useQuery, поэтому setQuery() управляет и
 *  этим путём. */
export function useConvex() {
  return {
    async query(ref: unknown, args?: unknown): Promise<unknown> {
      return structuredClone(convexMock.queryResults.get(keyOf(pathOf(ref), args)));
    },
  };
}

/** useMutation из convex/react — записывает вызовы, реализацию можно задать. */
export function useMutation(ref: unknown) {
  return (...args: unknown[]) => {
    const path = pathOf(ref);
    convexMock.mutationCalls.push({ path, args: snapshotArgs(args) });
    const impl = convexMock.mutationImpls.get(path);
    return impl ? impl(...args) : Promise.resolve();
  };
}

/** useAction из convex/react — как мутация, но для ассистента (действия). */
export function useAction(ref: unknown) {
  return (...args: unknown[]) => {
    const path = pathOf(ref);
    const impl = convexMock.actionImpls.get(path);
    if (!impl) return Promise.reject(new Error(`Нет реализации действия ${path}`));
    return impl(...args);
  };
}

/** Задать реализацию действия (assistant.chat / checkConnection). */
export function setAction(
  ref: unknown,
  impl: (...args: unknown[]) => Promise<unknown>,
): void {
  convexMock.actionImpls.set(pathOf(ref), impl);
}

/** Задать результат useQuery(ref, args). Значение хранится снимком: если тест
 *  мутирует фикстуру после setQuery, стор мока сохраняет состояние на момент
 *  установки (как реальный клиент, который кэширует ответ сервера). */
export function setQuery(ref: unknown, args: unknown, value: unknown): void {
  convexMock.queryResults.set(keyOf(pathOf(ref), args), structuredClone(value));
}

/** Задать реализацию мутации (например, отклоняющуюся с ошибкой). */
export function setMutation(
  ref: unknown,
  impl: (...args: unknown[]) => Promise<unknown>,
): void {
  convexMock.mutationImpls.set(pathOf(ref), impl);
}

/** Управление состоянием useConvexAuth в тестах. */
export function setConvexAuthState(state: {
  isLoading: boolean;
  isAuthenticated: boolean;
}): void {
  convexMock.convexAuthState = state;
}

/** Очистить состояние мока между тестами. */
export function resetConvexMock(): void {
  convexMock.queryResults.clear();
  convexMock.mutationImpls.clear();
  convexMock.actionImpls.clear();
  convexMock.mutationCalls = [];
  convexMock.convexAuthState = { isLoading: false, isAuthenticated: false };
}
