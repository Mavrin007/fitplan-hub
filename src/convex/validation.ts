/**
 * Общие серверные проверки входных данных мутаций.
 *
 * Клиент ограничивает значения в формах, но мутации обязаны защищаться сами:
 * любой запрос с мусорными числами (отрицательный вес, -99999 мл воды,
 * бесконечный массив упражнений) должен отклоняться с понятной ошибкой.
 *
 * Бросаем ConvexError с `data = { message }`, а не голый Error: клиентская
 * обёртка Convex показывает «Server Error» без текста, а ConvexError
 * гарантированно доносит `data` до клиента (`err.data.message`) — тост
 * показывает настоящую причину.
 */
import { ConvexError } from "convex/values";

export function assertRange(
  value: number,
  min: number,
  max: number,
  label: string,
): number {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new ConvexError({
      message: `${label} должен быть в диапазоне ${min}–${max}`,
    });
  }
  return value;
}

export function assertText(value: string, maxLen: number, label: string): string {
  const t = (value ?? "").trim();
  if (t.length === 0 || t.length > maxLen) {
    throw new ConvexError({
      message: `${label}: от 1 до ${maxLen} символов`,
    });
  }
  return t;
}

/** Даты храним как "YYYY-MM-DD". */
export function assertDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ConvexError({ message: "Некорректная дата" });
  }
  return value;
}

/** Лимит на размер массива (защита от неограниченного числа записей). */
export function assertMaxItems(arr: unknown[], max: number, label: string): void {
  if (arr.length > max) {
    throw new ConvexError({ message: `${label}: не более ${max} элементов` });
  }
}
