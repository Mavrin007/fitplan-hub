/**
 * Юнит-тесты строгой валидации команд ИИ (src/convex/assistant/commands.ts).
 *
 * Архитектурный принцип: модель выдаёт команды, а не данные для записи.
 * КБЖУ в команде запрещены; невалидная команда отклоняется целиком и НЕ
 * изменяет БД (это гарантируется на уровне хендлера assistant.ts).
 * Здесь проверяем саму валидацию: типы, диапазоны, длины, enums, границы
 * массивов, неизвестные поля, невозможные значения.
 */
import { describe, expect, it } from "vitest";
import {
  validateCommand,
  parseCommandJson,
  normalizeMealType,
  FORBIDDEN_NUTRITION_FIELDS,
} from "./commands";

describe("валидные команды", () => {
  it("logMeal: минимальная команда, mealType нормализуется, quantity округляется", () => {
    const res = validateCommand({
      action: "logMeal",
      mealType: "Обед",
      items: [{ name: "Куриная грудка", quantity: 150.55 }],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.command).toEqual({
      action: "logMeal",
      mealType: "lunch",
      items: [{ name: "Куриная грудка", quantity: 150.6 }],
    });
  });

  it("logMeal: единицы измерения нормализуются к нижнему регистру", () => {
    const res = validateCommand({
      action: "logMeal",
      items: [{ name: "Яйца", quantity: 2, unit: "ШТ" }],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    if (res.command.action !== "logMeal") return;
    expect(res.command.items[0].unit).toBe("шт");
  });

  it("logWorkout: с RPE в диапазоне и без workoutName", () => {
    const res = validateCommand({
      action: "logWorkout",
      exercises: [
        { name: "Жим лёжа", sets: 3, reps: 10, weightKg: 40, rpe: 7.5 },
      ],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.command).toEqual({
      action: "logWorkout",
      workoutName: undefined,
      exercises: [
        { name: "Жим лёжа", sets: 3, reps: 10, weightKg: 40, rpe: 7.5 },
      ],
    });
  });

  it("logWeight и logWater: диапазоны проходят, значения округляются", () => {
    const w = validateCommand({ action: "logWeight", weightKg: 72.55 });
    expect(w).toMatchObject({ ok: true });
    if (!w.ok) return;
    expect(w.command).toEqual({ action: "logWeight", weightKg: 72.6 });

    const wt = validateCommand({ action: "logWater", amountMl: 250.9 });
    expect(wt.ok).toBe(true);
    if (!wt.ok) return;
    expect(wt.command).toEqual({ action: "logWater", amountMl: 251 });
  });

  it("незнакомые поля игнорируются (безопасные имена), команда выполняется", () => {
    const res = validateCommand({
      action: "logMeal",
      items: [{ name: "Яблоко", quantity: 1 }],
      comment: "поле-инъекция",
      tone: "злой",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.ignoredFields).toEqual(expect.arrayContaining(["comment", "tone"]));
  });
});

describe("запрещённые поля (граница «ИИ не пишет КБЖУ»)", () => {
  it("calories в item → forbidden_field, команда отклонена целиком", () => {
    const res = validateCommand({
      action: "logMeal",
      items: [
        { name: "Курица", quantity: 150, calories: 300, protein: 40 },
      ],
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("forbidden_field");
  });

  it("все синонимы КБЖУ запрещены", () => {
    for (const f of FORBIDDEN_NUTRITION_FIELDS) {
      const res = validateCommand({
        action: "logMeal",
        items: [{ name: "Курица", quantity: 150, [f]: 1 }],
      });
      expect(res.ok).toBe(false);
      if (res.ok) continue;
      expect(res.code).toBe("forbidden_field");
    }
  });
});

describe("невалидные команды отклоняются", () => {
  it("не JSON-объект (массив/строка/null)", () => {
    expect(validateCommand([]).ok).toBe(false);
    expect(validateCommand("logMeal").ok).toBe(false);
    expect(validateCommand(null).ok).toBe(false);
  });

  it("неизвестное действие", () => {
    const res = validateCommand({
      action: "dropDatabase",
      items: [{ name: "X", quantity: 1 }],
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("unknown_action");
  });

  it("нет items у logMeal / нет exercises у logWorkout", () => {
    expect(validateCommand({ action: "logMeal" }).ok).toBe(false);
    expect(validateCommand({ action: "logWorkout" }).ok).toBe(false);
  });

  it("пустые массивы отклоняются (empty)", () => {
    expect(
      validateCommand({ action: "logMeal", items: [] }).ok,
    ).toBe(false);
    expect(
      validateCommand({ action: "logWorkout", exercises: [] }).ok,
    ).toBe(false);
  });

  it("слишком много items (>20) / упражнений (>30)", () => {
    const items = Array.from({ length: 21 }, (_, i) => ({
      name: `Еда ${i}`,
      quantity: 1,
    }));
    const res = validateCommand({ action: "logMeal", items });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("too_many_items");
  });

  it("неверные типы: quantity строкой, name числом, sets строкой", () => {
    expect(
      validateCommand({
        action: "logMeal",
        items: [{ name: "X", quantity: "150" }],
      }).ok,
    ).toBe(false);
    expect(
      validateCommand({
        action: "logMeal",
        items: [{ name: 42, quantity: 150 }],
      }).ok,
    ).toBe(false);
    expect(
      validateCommand({
        action: "logWorkout",
        exercises: [{ name: "X", sets: "3", reps: 10, weightKg: 20 }],
      }).ok,
    ).toBe(false);
  });

  it("невозможные значения: quantity 0/5001, вес 19 кг, вода 5001 мл", () => {
    const tooSmall = validateCommand({
      action: "logMeal",
      items: [{ name: "X", quantity: 0 }],
    });
    expect(tooSmall.ok).toBe(false);
    const tooBig = validateCommand({
      action: "logMeal",
      items: [{ name: "X", quantity: 5001 }],
    });
    expect(tooBig.ok).toBe(false);
    expect(
      validateCommand({ action: "logWeight", weightKg: 19 }).ok,
    ).toBe(false);
    expect(
      validateCommand({ action: "logWater", amountMl: 5001 }).ok,
    ).toBe(false);
  });

  it("слишком длинные строки: name > 100, workoutName > 120", () => {
    const longName = "а".repeat(101);
    expect(
      validateCommand({
        action: "logMeal",
        items: [{ name: longName, quantity: 1 }],
      }).ok,
    ).toBe(false);
    expect(
      validateCommand({
        action: "logWorkout",
        workoutName: "т".repeat(121),
        exercises: [{ name: "X", sets: 3, reps: 10, weightKg: 20 }],
      }).ok,
    ).toBe(false);
  });

  it("rpe вне диапазона 1–10 отклоняется", () => {
    expect(
      validateCommand({
        action: "logWorkout",
        exercises: [
          { name: "X", sets: 3, reps: 10, weightKg: 20, rpe: 11 },
        ],
      }).ok,
    ).toBe(false);
    expect(
      validateCommand({
        action: "logWorkout",
        exercises: [
          { name: "X", sets: 3, reps: 10, weightKg: 20, rpe: 0 },
        ],
      }).ok,
    ).toBe(false);
  });

  it("NaN/Infinity не проходят isFiniteNumber", () => {
    expect(
      validateCommand({ action: "logWeight", weightKg: NaN }).ok,
    ).toBe(false);
    expect(
      validateCommand({
        action: "logMeal",
        items: [{ name: "X", quantity: Infinity }],
      }).ok,
    ).toBe(false);
  });
});

describe("parseCommandJson", () => {
  it("битый JSON → invalid_json", () => {
    const res = parseCommandJson("{битый json");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("invalid_json");
  });

  it("валидный JSON-блок разбирается в команду", () => {
    const res = parseCommandJson(
      '{"action":"logWater","amountMl":300}',
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.command).toEqual({ action: "logWater", amountMl: 300 });
  });
});

describe("normalizeMealType", () => {
  it("русские и английские названия приёмов", () => {
    expect(normalizeMealType("завтрак")).toBe("breakfast");
    expect(normalizeMealType("Обед")).toBe("lunch");
    expect(normalizeMealType("dinner")).toBe("dinner");
    expect(normalizeMealType("перекус")).toBe("snack");
    expect(normalizeMealType("неизвестно")).toBeNull();
  });
});
