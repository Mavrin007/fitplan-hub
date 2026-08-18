/**
 * Фейковый ctx.db для юнит-тестов convex-хендлеров без Convex-рантайма
 * (water / activity / users / weightEntries / guestStats). Повторяет семантику
 * реального ctx.db:
 * - query(table).withIndex(name, fn) — цепочка фильтров eq/gte/lte + order,
 *   завершается first()/collect();
 * - get(id) возвращает null, когда документа нет;
 * - patch/insert/delete работают с in-memory store.
 *
 * Подключение в тесте:
 *   const { db, store } = makeConvexDb({ mealLog: [...сед] });
 *   runHandler({ db }, args);
 */
import { ConvexError } from "convex/values";
import { expect, vi } from "vitest";

/** Документ Convex: обязательные служебные поля + произвольные данные. */
export type ConvexDoc = { _id: string; _creationTime: number } & Record<
  string,
  unknown
>;

/** Поддельный Id<"users"> для мока авторизации (реальный тип не экспортируется).
 *  Общий для всех convex-тестов — константа была продублирована в каждом файле. */
export const AUTH_USER_ID = "user-1" as unknown as Awaited<
  ReturnType<typeof import("@convex-dev/auth/server").getAuthUserId>
>;

/** Сетап мока getAuthUserId в beforeEach: user — залогинен, null — аноним.
 *  Убирает повторяющуюся обвязку из каждого convex-теста. */
export function mockAuth(
  getAuthUserId: unknown,
  mode: "user" | "anonymous" = "user",
): void {
  const mocked = getAuthUserId as ReturnType<typeof vi.fn>;
  mocked.mockReset();
  mocked.mockResolvedValue(mode === "user" ? AUTH_USER_ID : null);
}

/** Минимальный q-объект для filter(): field/lt/gt/lte/gte/eq против строки. */
export interface ConvexFilterQ {
  field: (f: string) => unknown;
  lt: (a: unknown, b: unknown) => boolean;
  gt: (a: unknown, b: unknown) => boolean;
  lte: (a: unknown, b: unknown) => boolean;
  gte: (a: unknown, b: unknown) => boolean;
  eq: (a: unknown, b: unknown) => boolean;
}

/** Цепочка запросов: withIndex/eq/gte/lte/order/filter возвращают её же (как в
 *  реальном билдере), first/unique/collect/take завершают. */
export interface ConvexQueryChain {
  withIndex: (name: string, fn: (q: ConvexQueryChain) => void) => ConvexQueryChain;
  eq: (f: string, val: unknown) => ConvexQueryChain;
  gte: (f: string, val: unknown) => ConvexQueryChain;
  lte: (f: string, val: unknown) => ConvexQueryChain;
  order: (dir: "asc" | "desc") => ConvexQueryChain;
  filter: (fn: (q: ConvexFilterQ) => boolean) => ConvexQueryChain;
  first: () => ConvexDoc | undefined;
  unique: () => ConvexDoc | null;
  collect: () => ConvexDoc[];
  take: (n: number) => ConvexDoc[];
}

/** Минимальный in-memory аналог ctx.db. */
export interface ConvexDbMock {
  query: (table: string) => ConvexQueryChain;
  get: (id: string) => ConvexDoc | null;
  patch: (id: string, patch: Record<string, unknown>) => void;
  insert: (table: string, doc: Record<string, unknown>) => string;
  delete: (id: string) => void;
}

export interface ConvexDbState {
  db: ConvexDbMock;
  store: Record<string, ConvexDoc[]>;
}

/** Все таблицы схемы, к которым обращаются тестируемые хендлеры. */
const DEFAULT_TABLES = [
  "mealLog",
  "waterEntries",
  "workoutLogs",
  "workoutPlans",
  "weightEntries",
  "foods",
  "profiles",
  "users",
  "otpRateLimits",
  "devOtpCodes",
  "assistantLimits",
  "authRateLimits", // таблица лимита попыток @convex-dev/auth
  "authVerificationCodes", // коды верификации (ищет verifyCodeOnly)
  "rateLimitEvents", // глобальный throttle записей (rateLimit.ts)
  "authSessions", // auth-сессии @convex-dev/auth (имя таблицы из authTables)
  "authAccounts", // привязанные провайдеры
  "authRefreshTokens",
  "authVerifiers",
  "events", // product analytics (analytics.ts / day1Email.ts)
  "telegramAccounts", // привязки Telegram (telegram.ts)
  "linkCodes", // одноразовые коды привязки Telegram
  "telegramStates", // состояние диалога бота
  "telegramProcessedUpdates", // replay protection вебхука (telegram.ts)
];

export function makeConvexDb(
  seed: Record<string, ConvexDoc[]> = {},
): ConvexDbState {
  const store: Record<string, ConvexDoc[]> = Object.fromEntries(
    DEFAULT_TABLES.map((t) => [t, []]),
  );
  for (const [table, docs] of Object.entries(seed)) {
    store[table] = [...docs];
  }
  let seq = 0;

  const db: ConvexDbMock = {
    query(table: string) {
      const filters: {
        op: "eq" | "gte" | "lte";
        f: string;
        val: unknown;
      }[] = [];
      let desc = false;
      const match = (d: ConvexDoc) =>
        filters.every(({ op, f, val }) =>
          op === "eq"
            ? d[f] === val
            : op === "gte"
              ? String(d[f]) >= String(val)
              : String(d[f]) <= String(val),
        );

      let filterFn: ((q: ConvexFilterQ) => boolean) | null = null;
      const filterMatch = (d: ConvexDoc) => {
        if (!filterFn) return true;
        const field = (f: string) => d[f];
        return filterFn({
          field,
          lt: (a, b) => (a as number) < (b as number),
          gt: (a, b) => (a as number) > (b as number),
          lte: (a, b) => (a as number) <= (b as number),
          gte: (a, b) => (a as number) >= (b as number),
          eq: (a, b) => a === b,
        });
      };

      const q: ConvexQueryChain = {
        eq(f, val) {
          filters.push({ op: "eq", f, val });
          return q;
        },
        gte(f, val) {
          filters.push({ op: "gte", f, val });
          return q;
        },
        lte(f, val) {
          filters.push({ op: "lte", f, val });
          return q;
        },
        order(dir) {
          desc = dir === "desc";
          return q;
        },
        withIndex(_name, fn) {
          fn(q);
          return q;
        },
        filter(fn) {
          filterFn = fn;
          return q;
        },
        // ВАЖНО: first() не учитывает order("desc") (реальный Convex вернул бы
        // последнюю строку). Ни один текущий хендлер так не вызывает — при
        // появлении order().first() это надо учесть здесь.
        first() {
          return store[table].filter(match).filter(filterMatch)[0];
        },
        // Как реальный Convex: ровно одна строка по фильтру или null.
        unique() {
          return store[table].filter(match).filter(filterMatch)[0] ?? null;
        },
        collect() {
          const rows = store[table].filter(match).filter(filterMatch);
          // Индекс (userId, date): без order — по возрастанию дат, иначе desc.
          // Для запросов, где порядок не важен (агрегации), это безвредно.
          return desc
            ? rows.sort((a, b) => String(b.date).localeCompare(String(a.date)))
            : rows.sort((a, b) => String(a.date).localeCompare(String(b.date)));
        },
        // Как реальный Convex: первые n строк с учётом order().
        // date-строки (индекс userId,date) сравниваются лексикографически;
        // createdAt-числа (devOtpCodes и т.п.) — численно, чтобы take(1)
        // с order("desc") отдавал именно последний код.
        take(n) {
          const rows = store[table].filter(match).filter(filterMatch);
          const byDate = (a: ConvexDoc, b: ConvexDoc) =>
            String(a.date).localeCompare(String(b.date));
          const byCreated = (a: ConvexDoc, b: ConvexDoc) =>
            (a.createdAt as number) - (b.createdAt as number);
          const rowsWithDate = rows.filter((r) => r.date !== undefined);
          const rowsWithoutDate = rows.filter((r) => r.date === undefined);
          if (rowsWithDate.length > 0) {
            rowsWithDate.sort(desc ? (a, b) => byDate(b, a) : byDate);
            return [...rowsWithDate, ...rowsWithoutDate].slice(0, n);
          }
          rowsWithoutDate.sort(desc ? (a, b) => byCreated(b, a) : byCreated);
          return rowsWithoutDate.slice(0, n);
        },
      };
      return q;
    },
    get(id) {
      for (const t of Object.keys(store)) {
        const doc = store[t].find((d) => d._id === id);
        if (doc) return doc;
      }
      return null; // как реальный ctx.db.get
    },
    patch(id, patch) {
      for (const t of Object.keys(store)) {
        const doc = store[t].find((d) => d._id === id);
        if (doc) {
          Object.assign(doc, patch);
          return;
        }
      }
      throw new Error(`patch: нет документа ${id}`);
    },
    insert(table, doc) {
      const id = `${table}:${++seq}`;
      store[table].push({ _id: id, _creationTime: 0, ...doc } as ConvexDoc);
      return id;
    },
    delete(id) {
      for (const t of Object.keys(store)) {
        const i = store[t].findIndex((d) => d._id === id);
        if (i >= 0) {
          store[t].splice(i, 1);
          return;
        }
      }
      throw new Error(`delete: нет документа ${id}`);
    },
  };
  return { db, store };
}

/** Возвращает `message` из выброшенного ConvexError (или проваливает тест,
 *  если ошибка не была выброшена). Спутник фейкового ctx.db: во всех
 *  мутационных тестах проверяется сообщение серверной ошибки. */
export function errorMessage(fn: () => Promise<unknown>): Promise<string> {
  return fn().then(
    () => Promise.reject(new Error("ожидался выброс ConvexError")),
    (err: unknown) => {
      expect(err).toBeInstanceOf(ConvexError);
      return (err as ConvexError<{ message: string }>).data.message;
    },
  );
}
