import { describe, expect, it, vi } from "vitest";
import {
  addDays,
  formatTimestampDate,
  formatTimestampDateTime,
  lastNDays,
  pluralDays,
  pluralMonths,
  pluralRecords,
  pluralWeeks,
  prettyDate,
  shortDate,
  toDateKey,
  todayKey,
} from "./dates";

// Все проверки дат строятся от ЛОКАЛЬНЫХ конструкторов (new Date(y, m-1, d)):
// toDateKey/addDays оперируют локальным поясом, и тест не должен зависеть от
// часового пояса машины, на которой гоняется vitest.

describe("toDateKey", () => {
  it("форматирует в YYYY-MM-DD с нулями у месяца и дня", () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(toDateKey(new Date(2026, 11, 31))).toBe("2026-12-31");
    expect(toDateKey(new Date(2026, 2, 1))).toBe("2026-03-01");
  });

  it("работает на границах года и века", () => {
    expect(toDateKey(new Date(1999, 11, 31))).toBe("1999-12-31");
    expect(toDateKey(new Date(2000, 0, 1))).toBe("2000-01-01");
  });

  it("todayKey = toDateKey(new Date()) — локальный пояс", () => {
    expect(todayKey()).toBe(toDateKey(new Date()));
    expect(todayKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("addDays", () => {
  it("не мутирует исходную дату", () => {
    const d = new Date(2026, 0, 10);
    addDays(d, 3);
    expect(d.getDate()).toBe(10);
  });

  it("переходит через границу месяца", () => {
    expect(toDateKey(addDays(new Date(2026, 0, 31), 1))).toBe("2026-02-01");
    // Февраль невисокосного 2026 года: 28.02 → 01.03.
    expect(toDateKey(addDays(new Date(2026, 1, 28), 1))).toBe("2026-03-01");
  });

  it("учитывает високосный 2024 год", () => {
    expect(toDateKey(addDays(new Date(2024, 1, 28), 1))).toBe("2024-02-29");
    expect(toDateKey(addDays(new Date(2024, 1, 29), 1))).toBe("2024-03-01");
  });

  it("работает с нулём, отрицательными днями и через границу года", () => {
    expect(toDateKey(addDays(new Date(2026, 6, 15), 0))).toBe("2026-07-15");
    expect(toDateKey(addDays(new Date(2026, 0, 1), -1))).toBe("2025-12-31");
    expect(toDateKey(addDays(new Date(2026, 11, 31), 1))).toBe("2027-01-01");
  });
});

describe("lastNDays", () => {
  it("возвращает n подряд идущих ключей, от старых к новым, заканчивая сегодня", () => {
    const n = 5;
    const keys = lastNDays(n);
    expect(keys).toHaveLength(n);
    expect(keys[keys.length - 1]).toBe(todayKey());
    // Каждый следующий ключ — ровно +1 день от предыдущего (нет пропусков/дублей).
    for (let i = 1; i < keys.length; i++) {
      const [y, m, d] = keys[i - 1].split("-").map(Number);
      expect(keys[i]).toBe(toDateKey(addDays(new Date(y, m - 1, d), 1)));
    }
  });

  it("для n = 1 возвращает только сегодня", () => {
    expect(lastNDays(1)).toEqual([todayKey()]);
  });

  it("возвращает пустой массив для n = 0 и n < 0", () => {
    expect(lastNDays(0)).toEqual([]);
    expect(lastNDays(-3)).toEqual([]);
  });

  it("пересекает границу года (системное время — 2 января)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 2, 12, 0, 0));
    try {
      expect(lastNDays(3)).toEqual(["2025-12-31", "2026-01-01", "2026-01-02"]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("prettyDate / shortDate", () => {
  it("prettyDate: полный русский формат с днём недели", () => {
    // 5 января 2026 — понедельник.
    expect(prettyDate("2026-01-05")).toBe("понедельник, 5 января");
  });

  it("shortDate: краткий русский формат", () => {
    expect(shortDate("2026-01-05")).toBe("5 янв.");
    expect(shortDate("2026-12-31")).toBe("31 дек.");
  });
});

describe("formatTimestamp (для сессий Telegram в профиле)", () => {
  it("formatTimestampDate: дата без времени", () => {
    expect(formatTimestampDate(new Date(2026, 7, 18, 0, 0).getTime())).toBe(
      "18 авг. 2026 г.",
    );
  });

  it("formatTimestampDateTime: дата и время", () => {
    const ts = new Date(2026, 7, 18, 14, 5).getTime();
    expect(formatTimestampDateTime(ts)).toBe("18 авг. 2026 г., 14:05");
  });
});

describe("русская плюрализация", () => {
  it("pluralDays: 1 день / 2 дня / 5 дней", () => {
    expect(pluralDays(1)).toBe("день");
    expect(pluralDays(2)).toBe("дня");
    expect(pluralDays(5)).toBe("дней");
    expect(pluralDays(21)).toBe("день");
    expect(pluralDays(22)).toBe("дня");
  });

  it("pluralWeeks / pluralMonths / pluralRecords", () => {
    expect(pluralWeeks(1)).toBe("неделю");
    expect(pluralWeeks(2)).toBe("недели");
    expect(pluralWeeks(5)).toBe("недель");
    expect(pluralMonths(1)).toBe("месяц");
    expect(pluralMonths(3)).toBe("месяца");
    expect(pluralMonths(12)).toBe("месяцев");
    expect(pluralRecords(1)).toBe("запись");
    expect(pluralRecords(4)).toBe("записи");
    expect(pluralRecords(19)).toBe("записей");
  });

  it("исключения 11–14 дают форму множественного числа", () => {
    expect(pluralDays(11)).toBe("дней");
    expect(pluralDays(14)).toBe("дней");
    expect(pluralWeeks(12)).toBe("недель");
    expect(pluralMonths(13)).toBe("месяцев");
    expect(pluralRecords(11)).toBe("записей");
  });
});
