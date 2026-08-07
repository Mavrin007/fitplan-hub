/**
 * Поиск продуктов: локальная кураторская библиотека (mealData.ts) + внешний
 * каталог Open Food Facts (бесплатный открытый API, без ключа).
 *
 * Чистые функции отделены от сетевых: парсинг и нормализация покрываются
 * юнит-тестами без рантайма, fetch — мокается (см. productSearch.test.ts).
 *
 * Зачем: фитнес-трекеру нужен каталог за пределами курируемых ~70 позиций —
 * пользователь ищет «чипсы Lay's» или «кокосовое молоко» и получает КБЖУ из
 * реальной базы штрихкодов. Локальная библиотека всегда первая (быстрая,
 * надёжная, с порциями), OFF — дополнение с пометкой «из каталога».
 */

import { FOOD_LIBRARY, type FoodItem } from "./mealData";

/** Продукт из внешнего каталога: макросы на 100 г, как в FoodItem. */
export interface CatalogProduct {
  name: string;
  brands?: string;
  /** Калории на 100 г. */
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Типичный вес порции: для внешних продуктов — 100 г (по умолчанию). */
  servingGrams: number;
  unit: string;
  /** Штрихкод (если пришёл из OFF). */
  barcode?: string;
}

/** Сколько OFF-продуктов максимум отдаём пользователю. */
export const OFF_PAGE_SIZE = 8;

/** Таймаут запроса к OFF, мс: медленный каталог не должен вешать диалог. */
export const OFF_TIMEOUT_MS = 8000;

/** Термины, по которым OFF гарантированно не найдёт ничего вменяемого
 *  (часто ловятся «заглушки» каталога) — не отдаём их как результат. */
function isJunkName(name: string): boolean {
  const n = name.trim().toLowerCase();
  if (!n) return true;
  return (
    n.length > 120 ||
    /^[{([<"]/.test(n) || // начинается с мусорного символа
    /^(\d+[x×]?|тест|test|no name|без названия|unknown|inconnu)/.test(n)
  );
}

/** Поиск по локальной кураторской библиотеке (подстрока в имени). */
export function searchLocalLibrary(query: string, limit = 30): FoodItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return FOOD_LIBRARY.slice(0, limit);
  return FOOD_LIBRARY.filter((f) => f.name.toLowerCase().includes(q)).slice(
    0,
    limit,
  );
}

/** Приводит значение к числу, иначе fallback. OFF отдаёт числа и строки. */
function toNum(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number.parseFloat(value.replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

/** Калории из OFF: предпочитаем ккал/100г, иначе кДж/100г (÷4.184), иначе 0. */
function kcalFromNutriments(n: Record<string, unknown> | undefined): number {
  const kcal = toNum(n?.["energy-kcal_100g"], NaN);
  if (Number.isFinite(kcal)) return Math.max(0, Math.round(kcal));
  const kj = toNum(n?.["energy-kj_100g"], NaN);
  if (Number.isFinite(kj) && kj > 0) return Math.max(0, Math.round(kj / 4.184));
  return 0;
}

/** Маппит один продукт OFF в наш формат (макросы на 100 г). Пропуски полей
 *  → 0, имя без названия/мусорное → null (такие записи отбрасываем). */
export function parseOpenFoodFactsProduct(raw: unknown): CatalogProduct | null {
  const p = (raw ?? {}) as Record<string, unknown>;
  const name = typeof p.product_name === "string" ? p.product_name.trim() : "";
  if (!name || isJunkName(name)) return null;

  const n = (p.nutriments ?? {}) as Record<string, unknown>;
  const calories = kcalFromNutriments(n);

  const brands =
    typeof p.brands === "string" && p.brands.trim()
      ? p.brands.trim()
      : undefined;
  const barcode =
    typeof p.code === "string" && /^\d{8,14}$/.test(p.code) ? p.code : undefined;

  return {
    name,
    brands,
    calories,
    protein: Math.max(0, Math.round(toNum(n["proteins_100g"], 0) * 10) / 10),
    carbs: Math.max(0, Math.round(toNum(n["carbohydrates_100g"], 0) * 10) / 10),
    fat: Math.max(0, Math.round(toNum(n["fat_100g"], 0) * 10) / 10),
    servingGrams: 100,
    unit: "г",
    barcode,
  };
}

/** Запрашивает OFF по названию. Возвращает массив (может быть пустым);
 *  при сетевой/HTTP-ошибке кидает исключение — вызывающий решает, что делать
 *  (обычно показать «каталог недоступен», не ломая диалог). */
export async function searchOpenFoodFacts(
  query: string,
  options: { signal?: AbortSignal; limit?: number } = {},
): Promise<CatalogProduct[]> {
  const q = query.trim();
  if (!q) return [];

  const limit = options.limit ?? OFF_PAGE_SIZE;
  // Таймаут-страховка по умолчанию: медленный каталог не вешает диалог.
  const signal = options.signal ?? AbortSignal.timeout(OFF_TIMEOUT_MS);
  const url =
    "https://world.openfoodfacts.org/cgi/search.pl?" +
    new URLSearchParams({
      search_terms: q,
      search_simple: "1",
      action: "process",
      json: "1",
      page_size: String(limit),
      fields: "product_name,brands,code,nutriments",
      // Русский язык описаний, где доступен; поле у OFF называется lang.
      lang: "ru",
    }).toString();

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!res.ok) {
    throw new Error(`Open Food Facts: HTTP ${res.status}`);
  }
  const data = (await res.json()) as { products?: unknown[] };
  const products = (data.products ?? [])
    .map(parseOpenFoodFactsProduct)
    .filter((p): p is CatalogProduct => p !== null);
  // Дедупликация по имени (OFF отдаёт дубли разных кодов).
  const seen = new Set<string>();
  return products.filter((p) => {
    const key = p.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
