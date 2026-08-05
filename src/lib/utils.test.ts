/**
 * Юнит-тесты `utils.ts`: cn() (clsx + tailwind-merge) и parseLocalNumber() —
 * единая точка входа всех числовых полей форм. parseLocalNumber критичен:
 * «74,5», «1 500», мусор, NaN и бесконечность должны обрабатываться строго.
 */
import { describe, expect, it } from "vitest";
import { cn, parseLocalNumber } from "./utils";

describe("cn", () => {
  it("объединяет классы и отбрасывает ложные значения", () => {
    const falsy = false;
    expect(cn("a", falsy && "b", undefined, null, "c")).toBe("a c");
  });

  it("конфликт tailwind-классов решается последним (twMerge)", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    // twMerge убирает bg-red-500, но не трогает text-white.
    expect(cn("bg-red-500 text-white", "bg-blue-500")).toBe("text-white bg-blue-500");
  });

  it("принимает массивы и вложенные значения", () => {
    expect(cn(["x", { y: true, z: false }])).toBe("x y");
  });
});

describe("parseLocalNumber", () => {
  it("разбирает целые и десятичные с точкой", () => {
    expect(parseLocalNumber("75")).toBe(75);
    expect(parseLocalNumber("75.5")).toBe(75.5);
  });

  it("принимает запятую как десятичный разделитель", () => {
    expect(parseLocalNumber("74,5")).toBe(74.5);
    expect(parseLocalNumber("0,25")).toBe(0.25);
  });

  it("игнорирует пробелы-разделители тысяч", () => {
    expect(parseLocalNumber("1 500")).toBe(1500);
    expect(parseLocalNumber(" 84 ")).toBe(84);
  });

  it("пустой и мусорный ввод возвращает null", () => {
    expect(parseLocalNumber("")).toBeNull();
    expect(parseLocalNumber("   ")).toBeNull();
    expect(parseLocalNumber("abc")).toBeNull();
    expect(parseLocalNumber("75кг")).toBeNull();
    expect(parseLocalNumber("-")).toBeNull();
    expect(parseLocalNumber(".")).toBeNull();
    expect(parseLocalNumber("-.")).toBeNull();
  });

  it("NaN и бесконечность не проходят", () => {
    expect(parseLocalNumber("Infinity")).toBeNull();
    expect(parseLocalNumber("NaN")).toBeNull();
  });

  it("числа передаются как есть (валидные), NaN отсекается", () => {
    expect(parseLocalNumber(75)).toBe(75);
    expect(parseLocalNumber(0)).toBe(0);
    expect(parseLocalNumber(NaN)).toBeNull();
    expect(parseLocalNumber(Infinity)).toBeNull();
  });

  it("отрицательные числа работают", () => {
    expect(parseLocalNumber("-2,5")).toBe(-2.5);
  });
});
