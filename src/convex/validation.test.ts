/**
 * Юнит-тесты серверных валидаторов (src/convex/validation.ts).
 *
 * Покрываем те же вызовы, что делают мутации на боевых данных:
 *  - профиль (upsertProfile): assertRange — возраст 10–120, рост 100–250,
 *    вес 20–500, тренировок в неделю 1–6; assertMaxItems — инвентарь ≤8,
 *    ограничения ≤5;
 *  - еда (addFood): assertText — название ≤100, единица ≤20; assertRange —
 *    порция ≥1, калории ≤20000, макросы ≤2000 г;
 *  - записи дневника (mealLog): assertDate YYYY-MM-DD, assertRange —
 *    количество ≤1000, калории ≤20000, макросы ≤2000; assertMaxItems — ≤50.
 */
import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";
import {
  assertDate,
  assertMaxItems,
  assertRange,
  assertText,
} from "./validation";

/** Выполняет fn и возвращает message из data брошенного ConvexError. */
function messageOf(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(ConvexError);
    return (err as ConvexError<{ message: string }>).data.message;
  }
  throw new Error("ожидался выброс ConvexError");
}

describe("assertRange — диапазоны профиля (upsertProfile)", () => {
  it("возраст: проходит 10 и 120, отклоняет 9 и 121", () => {
    expect(assertRange(10, 10, 120, "Возраст")).toBe(10);
    expect(assertRange(120, 10, 120, "Возраст")).toBe(120);
    expect(messageOf(() => assertRange(9, 10, 120, "Возраст"))).toBe(
      "Возраст должен быть в диапазоне 10–120",
    );
    expect(messageOf(() => assertRange(121, 10, 120, "Возраст"))).toBe(
      "Возраст должен быть в диапазоне 10–120",
    );
  });

  it("рост: границы 100–250 (см)", () => {
    expect(assertRange(100, 100, 250, "Рост (см)")).toBe(100);
    expect(assertRange(250, 100, 250, "Рост (см)")).toBe(250);
    expect(messageOf(() => assertRange(99.9, 100, 250, "Рост (см)"))).toContain(
      "Рост (см)",
    );
    expect(messageOf(() => assertRange(250.1, 100, 250, "Рост (см)"))).toContain(
      "Рост (см)",
    );
  });

  it("вес: границы 20–500 (кг), включая дробные", () => {
    expect(assertRange(20, 20, 500, "Вес (кг)")).toBe(20);
    expect(assertRange(79.5, 20, 500, "Вес (кг)")).toBe(79.5);
    expect(assertRange(500, 20, 500, "Вес (кг)")).toBe(500);
    expect(messageOf(() => assertRange(19.9, 20, 500, "Вес (кг)"))).toContain(
      "Вес (кг)",
    );
  });

  it("тренировок в неделю: только 1–6", () => {
    expect(assertRange(1, 1, 6, "Тренировок в неделю")).toBe(1);
    expect(assertRange(6, 1, 6, "Тренировок в неделю")).toBe(6);
    expect(
      messageOf(() => assertRange(0, 1, 6, "Тренировок в неделю")),
    ).toContain("Тренировок в неделю");
  });

  it("NaN и ±Infinity отклоняются (мусорные числа с клиента)", () => {
    expect(messageOf(() => assertRange(NaN, 0, 20000, "Калории"))).toContain(
      "Калории",
    );
    expect(messageOf(() => assertRange(Infinity, 0, 20000, "Калории"))).toContain(
      "Калории",
    );
    expect(messageOf(() => assertRange(-Infinity, 0, 20000, "Калории"))).toContain(
      "Калории",
    );
  });

  it("возвращает переданное значение без изменений", () => {
    expect(assertRange(42, 0, 100, "x")).toBe(42);
  });
});

describe("assertText — названия еды и единицы (addFood)", () => {
  it("обрезает пробелы по краям и возвращает очищенную строку", () => {
    expect(assertText("  Куриная грудка  ", 100, "Название")).toBe(
      "Куриная грудка",
    );
    expect(assertText("г", 20, "Единица измерения")).toBe("г");
  });

  it("пустая или пробельная строка отклоняется", () => {
    expect(messageOf(() => assertText("", 100, "Название"))).toBe(
      "Название: от 1 до 100 символов",
    );
    expect(messageOf(() => assertText("   ", 100, "Название"))).toBe(
      "Название: от 1 до 100 символов",
    );
  });

  it("строка длиннее maxLen отклоняется, ровно maxLen проходит", () => {
    const ok = "а".repeat(100);
    expect(assertText(ok, 100, "Название")).toHaveLength(100);
    expect(messageOf(() => assertText("а".repeat(101), 100, "Название"))).toBe(
      "Название: от 1 до 100 символов",
    );
  });

  it("единица измерения: лимит 20 символов", () => {
    expect(assertText("грамм", 20, "Единица измерения")).toBe("грамм");
    expect(
      messageOf(() => assertText("г".repeat(21), 20, "Единица измерения")),
    ).toContain("Единица измерения");
  });
});

describe("assertRange — питание (addFood: порция/калории/макросы)", () => {
  it("порция: 1–10000 (0 отклоняется)", () => {
    expect(assertRange(1, 1, 10000, "Порция")).toBe(1);
    expect(assertRange(10000, 1, 10000, "Порция")).toBe(10000);
    expect(messageOf(() => assertRange(0, 1, 10000, "Порция"))).toBe(
      "Порция должен быть в диапазоне 1–10000",
    );
  });

  it("калории: 0–20000, включая дробные значения", () => {
    expect(assertRange(0, 0, 20000, "Калории")).toBe(0);
    expect(assertRange(248, 0, 20000, "Калории")).toBe(248);
    expect(assertRange(20000, 0, 20000, "Калории")).toBe(20000);
    expect(messageOf(() => assertRange(20000.01, 0, 20000, "Калории"))).toBe(
      "Калории должен быть в диапазоне 0–20000",
    );
  });

  it("макросы: 0–2000 г", () => {
    expect(assertRange(2000, 0, 2000, "Белки (г)")).toBe(2000);
    expect(messageOf(() => assertRange(2000.1, 0, 2000, "Жиры (г)"))).toBe(
      "Жиры (г) должен быть в диапазоне 0–2000",
    );
  });
});

describe("assertRange — количество записи дневника (mealLog)", () => {
  it("количество: 0–1000 (множитель порции)", () => {
    expect(assertRange(0, 0, 1000, "Количество")).toBe(0);
    expect(assertRange(2, 0, 1000, "Количество")).toBe(2);
    expect(assertRange(1000, 0, 1000, "Количество")).toBe(1000);
    expect(messageOf(() => assertRange(1001, 0, 1000, "Количество"))).toBe(
      "Количество должен быть в диапазоне 0–1000",
    );
  });
});

describe("assertDate — даты записей дневника (mealLog)", () => {
  it("принимает корректный формат YYYY-MM-DD и возвращает его", () => {
    expect(assertDate("2025-01-01")).toBe("2025-01-01");
    expect(assertDate("1999-12-31")).toBe("1999-12-31");
  });

  it("отклоняет неформатные строки: '2025-1-1', '20250101', 'abc'", () => {
    // '2025-13-45' сюда не входит: по шаблону он валиден (см. тест ниже).
    for (const bad of ["2025-1-1", "20250101", "abc", ""]) {
      expect(messageOf(() => assertDate(bad))).toBe("Некорректная дата");
    }
  });

  it("не валидирует календарную корректность — только формат", () => {
    // Намеренная фиксация поведения: проверяется шаблон, а не реальный календарь.
    expect(assertDate("2025-02-30")).toBe("2025-02-30");
  });
});

describe("assertMaxItems — лимиты массивов", () => {
  it("записи дневника: до 50 элементов включительно", () => {
    expect(() => assertMaxItems(new Array(50), 50, "Записи дневника")).not.toThrow();
    expect(messageOf(() => assertMaxItems(new Array(51), 50, "Записи дневника"))).toBe(
      "Записи дневника: не более 50 элементов",
    );
  });

  it("инвентарь ≤8 и ограничения ≤5 (профиль)", () => {
    expect(() => assertMaxItems(new Array(8), 8, "Инвентарь")).not.toThrow();
    expect(messageOf(() => assertMaxItems(new Array(9), 8, "Инвентарь"))).toBe(
      "Инвентарь: не более 8 элементов",
    );
    expect(() => assertMaxItems(new Array(5), 5, "Ограничения")).not.toThrow();
    expect(
      messageOf(() => assertMaxItems(new Array(6), 5, "Ограничения")),
    ).toBe("Ограничения: не более 5 элементов");
  });

  it("пустой массив всегда проходит", () => {
    expect(() => assertMaxItems([], 1, "Записи дневника")).not.toThrow();
  });
});
