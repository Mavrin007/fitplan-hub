/**
 * Тесты чистых агрегатов статистики «Тренировок».
 */
import { describe, expect, it } from "vitest";
import { personalRecords, tonnageByWeek, type WorkoutLog } from "./workoutStats";
import { weekStart } from "./workoutFormatting";

function log(
  date: string,
  exercises: { name: string; weightKg: number; reps: number; sets: number }[],
): WorkoutLog {
  return {
    _id: date as WorkoutLog["_id"],
    _creationTime: 0,
    createdAt: 0,
    userId: "u" as WorkoutLog["userId"],
    date,
    workoutName: "Тренировка",
    exercises: exercises.map((e) => ({ ...e, restSeconds: 60 })),
  };
}

describe("weekStart", () => {
  it("понедельник недели для даты в середине недели", () => {
    // 2026-08-18 — вторник → понедельник 2026-08-17.
    expect(weekStart("2026-08-18")).toBe("2026-08-17");
  });

  it("понедельник — сам день", () => {
    expect(weekStart("2026-08-17")).toBe("2026-08-17");
  });

  it("воскресенье относится к предыдущей неделе", () => {
    // 2026-08-23 — воскресенье → понедельник 2026-08-17.
    expect(weekStart("2026-08-23")).toBe("2026-08-17");
  });
});

describe("tonnageByWeek", () => {
  it("суммирует вес×повторы×подходы по неделям, отсортировано по дате", () => {
    const logs = [
      log("2026-08-10", [{ name: "Жим", weightKg: 40, reps: 10, sets: 3 }]), // 1200
      log("2026-08-17", [{ name: "Жим", weightKg: 42.5, reps: 10, sets: 3 }]), // 1275
    ];
    const data = tonnageByWeek(logs);
    expect(data).toHaveLength(2);
    expect(data[0]).toEqual({ label: expect.stringMatching(/авг/), tonnage: 1200 });
    expect(data[1].tonnage).toBe(1275);
    expect(data[0].label < data[1].label).toBe(true);
  });

  it("игнорирует упражнения без веса и пустые недели", () => {
    const logs = [
      log("2026-08-17", [
        { name: "Отжимания", weightKg: 0, reps: 15, sets: 3 },
      ]),
    ];
    expect(tonnageByWeek(logs)).toEqual([]);
  });

  it("группирует несколько тренировок одной недели", () => {
    const logs = [
      log("2026-08-17", [{ name: "Жим", weightKg: 40, reps: 10, sets: 3 }]), // 1200
      log("2026-08-19", [{ name: "Присед", weightKg: 60, reps: 8, sets: 3 }]), // 1440
    ];
    const data = tonnageByWeek(logs);
    expect(data).toHaveLength(1);
    expect(data[0].tonnage).toBe(2640);
  });

  it("оставляет последние 10 недель", () => {
    const logs = Array.from({ length: 14 }, (_, i) =>
      log(`2026-${String(5 + Math.floor(i / 7)).padStart(2, "0")}-${String((i % 7) + 1).padStart(2, "0")}`, [
        { name: "Жим", weightKg: 40, reps: 10, sets: 3 },
      ]),
    );
    expect(tonnageByWeek(logs).length).toBeLessThanOrEqual(10);
  });
});

describe("personalRecords", () => {
  it("максимальный вес по каждому упражнению, отсортирован по убыванию веса", () => {
    const logs = [
      log("2026-08-10", [
        { name: "Жим", weightKg: 40, reps: 10, sets: 3 },
        { name: "Присед", weightKg: 60, reps: 8, sets: 3 },
      ]),
      log("2026-08-17", [{ name: "Жим", weightKg: 45, reps: 8, sets: 3 }]),
    ];
    const prs = personalRecords(logs);
    expect(prs).toEqual([
      { name: "Присед", weightKg: 60, date: "2026-08-10", sets: 3, reps: 8 },
      { name: "Жим", weightKg: 45, date: "2026-08-17", sets: 3, reps: 8 },
    ]);
  });

  it("без весовых упражнений рекордов нет", () => {
    const logs = [log("2026-08-17", [{ name: "Отжимания", weightKg: 0, reps: 15, sets: 3 }])];
    expect(personalRecords(logs)).toEqual([]);
  });
});
