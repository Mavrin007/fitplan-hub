import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Разбор числа из пользовательского ввода: допускает запятую как десятичный
 * разделитель («74,5») и пробелы-разделители тысяч («1 500»). Возвращает
 * `null` для пустого или мусорного ввода — NaN и бесконечность не проходят.
 * Единственная точка входа для любых числовых полей форм.
 */
export function parseLocalNumber(raw: string | number): number | null {
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : null;
  }
  const t = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (t === "" || t === "-" || t === "." || t === "-.") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
