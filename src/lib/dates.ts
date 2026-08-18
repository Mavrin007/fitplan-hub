/** Date helpers. All app "day" values are stored as "YYYY-MM-DD" strings in
 *  the user's local timezone. */

export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayKey(): string {
  return toDateKey(new Date());
}

export function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

/** The last `n` date keys ending today, oldest first. */
export function lastNDays(n: number): string[] {
  const today = new Date();
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    keys.push(toDateKey(addDays(today, -i)));
  }
  return keys;
}

export function prettyDate(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("ru-RU", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function shortDate(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("ru-RU", {
    month: "short",
    day: "numeric",
  });
}

/** Русская плюрализация: «1 день, 2 дня, 5 дней». */
function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(Math.round(n)) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

export function pluralDays(n: number): string {
  return plural(n, "день", "дня", "дней");
}

export function pluralWeeks(n: number): string {
  return plural(n, "неделю", "недели", "недель");
}

export function pluralMonths(n: number): string {
  return plural(n, "месяц", "месяца", "месяцев");
}

export function pluralRecords(n: number): string {
  return plural(n, "запись", "записи", "записей");
}

/** Timestamp (ms) → «18 авг 2026» (ru-RU). Для «подключён/создан». */
export function formatTimestampDate(ts: number): string {
  return new Date(ts).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Timestamp (ms) → «18 авг 2026, 14:05» (ru-RU). Для «последняя активность». */
export function formatTimestampDateTime(ts: number): string {
  return new Date(ts).toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
