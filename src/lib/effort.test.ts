/**
 * Юнит-тесты авторегуляции нагрузки по субъективной оценке усилия
 * (src/lib/effort.ts): усреднение оценки за последние тренировки,
 * корректировка стартовых весов (легко/норм/тяжело), защита штанговых
 * упражнений от веса ниже грифа (20 кг) и подсчёт скорректированных.
 */
import { describe, expect, it } from "vitest";
import {
  applyEffortAdjustment,
  effortAdjustedCount,
  lastEffortByExercise,
  type Effort,
} from "./effort";
import type { WorkoutTemplate } from "./workoutLibrary";

/** Лог с одним упражнением и оценкой усилия. */
function log(
  date: string,
  effort: Effort,
  exercises: { name: string; weightKg: number }[],
) {
  return { date, effort, exercises };
}

/** Минимальный шаблон: жим лёжа (штанга) + махи в стороны (гантели). */
const template: WorkoutTemplate = {
  name: "Тест",
  days: [
    {
      day: 1,
      focus: "Сила",
      exercises: [
        { name: "Жим лёжа", sets: 4, reps: "6–8", restSeconds: 120, weightKg: 40 },
        { name: "Махи в стороны", sets: 3, reps: "12–15", restSeconds: 60, weightKg: 5 },
      ],
    },
  ],
};

describe("lastEffortByExercise — усреднение оценки за окно", () => {
  it("пустые логи и логи без оценки дают пустую карту", () => {
    expect(lastEffortByExercise([]).size).toBe(0);
    expect(
      lastEffortByExercise([
        { date: "2026-08-01", effort: null, exercises: [{ name: "Жим лёжа", weightKg: 40 }] },
        { date: "2026-08-02", exercises: [{ name: "Жим лёжа", weightKg: 40 }] },
      ]).size,
    ).toBe(0);
  });

  it("одна лёгкая тренировка → easy", () => {
    const m = lastEffortByExercise([log("2026-08-01", "easy", [{ name: "Жим лёжа", weightKg: 40 }])]);
    expect(m.get("Жим лёжа")?.effort).toBe("easy");
  });

  it("усредняет оценки: easy + hard = 2.0 → normal", () => {
    const m = lastEffortByExercise([
      log("2026-08-01", "easy", [{ name: "Жим лёжа", weightKg: 40 }]),
      log("2026-08-03", "hard", [{ name: "Жим лёжа", weightKg: 42.5 }]),
    ]);
    expect(m.get("Жим лёжа")?.effort).toBe("normal");
  });

  it("границы усреднения: 1.5 и 2.5 → normal, выше 2.5 → hard", () => {
    // easy(1) + normal(2) = 1.5 → normal
    const a = lastEffortByExercise([
      log("2026-08-01", "easy", [{ name: "X", weightKg: 10 }]),
      log("2026-08-02", "normal", [{ name: "X", weightKg: 10 }]),
    ]);
    expect(a.get("X")?.effort).toBe("normal");

    // normal(2) + hard(3) = 2.5 → normal
    const b = lastEffortByExercise([
      log("2026-08-01", "normal", [{ name: "X", weightKg: 10 }]),
      log("2026-08-02", "hard", [{ name: "X", weightKg: 10 }]),
    ]);
    expect(b.get("X")?.effort).toBe("normal");

    // normal(2) + hard(3) + hard(3) = 2.67 → hard
    const c = lastEffortByExercise([
      log("2026-08-01", "normal", [{ name: "X", weightKg: 10 }]),
      log("2026-08-02", "hard", [{ name: "X", weightKg: 10 }]),
      log("2026-08-03", "hard", [{ name: "X", weightKg: 10 }]),
    ]);
    expect(c.get("X")?.effort).toBe("hard");
  });

  it("учитывает только последние `window` тренировок (по умолчанию 3)", () => {
    // Старый лог «тяжело» должен остаться за окном, иначе среднее (3+1+1+1)/4 = 1.5
    // дало бы normal. С окном 3: (1+1+1)/3 = 1 → easy.
    const m = lastEffortByExercise(
      [
        log("2026-07-30", "hard", [{ name: "X", weightKg: 10 }]), // старое
        log("2026-08-01", "easy", [{ name: "X", weightKg: 10 }]),
        log("2026-08-02", "easy", [{ name: "X", weightKg: 10 }]),
        log("2026-08-03", "easy", [{ name: "X", weightKg: 10 }]),
      ],
      3,
    );
    expect(m.get("X")?.effort).toBe("easy");
  });

  it("вес берётся из самого свежего лога с этим упражнением и оценкой", () => {
    const m = lastEffortByExercise([
      log("2026-08-01", "easy", [{ name: "Жим лёжа", weightKg: 40 }]),
      log("2026-08-02", "normal", [{ name: "Жим лёжа", weightKg: 45 }]),
      log("2026-08-03", "easy", [{ name: "Жим лёжа", weightKg: 42.5 }]),
    ]);
    expect(m.get("Жим лёжа")?.weightKg).toBe(42.5);
  });

  it("пропускает упражнения с weightKg <= 0", () => {
    const m = lastEffortByExercise([
      log("2026-08-01", "easy", [
        { name: "Жим лёжа", weightKg: 0 },
        { name: "Махи в стороны", weightKg: -3 },
      ]),
    ]);
    expect(m.size).toBe(0);
  });
});

describe("applyEffortAdjustment — корректировка весов плана", () => {
  it("без данных об усилии возвращает шаблон как есть (та же ссылка)", () => {
    const out = applyEffortAdjustment(template, []);
    expect(out).toBe(template);
  });

  it("«легко» поднимает вес на +2.5 кг", () => {
    const out = applyEffortAdjustment(template, [
      log("2026-08-03", "easy", [{ name: "Жим лёжа", weightKg: 42.5 }]),
    ]);
    const bench = out.days[0].exercises[0];
    expect(bench.weightKg).toBe(45); // 42.5 + 2.5 = 45, кратность 2.5
    expect(bench.weightNote).toContain("по усилию: легко");
  });

  it("«норм» оставляет последний вес (округлённый до 2.5)", () => {
    const out = applyEffortAdjustment(template, [
      log("2026-08-03", "normal", [{ name: "Жим лёжа", weightKg: 42.5 }]),
    ]);
    expect(out.days[0].exercises[0].weightKg).toBe(42.5);
  });

  it("«тяжело» опускает вес на −2.5 кг", () => {
    const out = applyEffortAdjustment(template, [
      log("2026-08-03", "hard", [{ name: "Жим лёжа", weightKg: 45 }]),
    ]);
    expect(out.days[0].exercises[0].weightKg).toBe(42.5);
  });

  it("штанговое упражнение не опускается ниже грифа (20 кг)", () => {
    const barbellOnly: WorkoutTemplate = {
      name: "Штанга",
      days: [
        {
          day: 1,
          focus: "Сила",
          exercises: [
            { name: "Приседания со штангой", sets: 4, reps: "6–8", restSeconds: 150, weightKg: 20 },
          ],
        },
      ],
    };
    const out = applyEffortAdjustment(barbellOnly, [
      log("2026-08-03", "hard", [{ name: "Приседания со штангой", weightKg: 20 }]),
    ]);
    // 20 − 2.5 = 17.5, но минимум для штанги — гриф 20 кг.
    expect(out.days[0].exercises[0].weightKg).toBe(20);
  });

  it("затрагивает только упражнения с данными об усилии", () => {
    const out = applyEffortAdjustment(template, [
      log("2026-08-03", "easy", [{ name: "Махи в стороны", weightKg: 7.5 }]),
    ]);
    const [bench, fly] = out.days[0].exercises;
    expect(fly.weightKg).toBe(10); // 7.5 + 2.5
    expect(fly.weightNote).toContain("по усилию");
    expect(bench.weightKg).toBe(40); // без данных — как было
    expect(bench.weightNote).toBeUndefined();
  });
});

describe("effortAdjustedCount", () => {
  it("считает только упражнения с пометкой «по усилию»", () => {
    const out = applyEffortAdjustment(template, [
      log("2026-08-03", "hard", [{ name: "Жим лёжа", weightKg: 42.5 }]),
    ]);
    expect(effortAdjustedCount(out)).toBe(1);

    const untouched = applyEffortAdjustment(template, []);
    expect(effortAdjustedCount(untouched)).toBe(0);
  });
});
