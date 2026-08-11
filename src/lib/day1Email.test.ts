import { describe, expect, it } from "vitest";
import { buildDay1Email } from "./day1Email";

describe("buildDay1Email", () => {
  const exercises = [
    { name: "Приседания со штангой", sets: 3, reps: 10, weightKg: 70 },
    { name: "Жим лёжа", sets: 3, reps: 8, weightKg: 40 },
  ];

  it("собирает тему, факты тренировки и следующий шаг", () => {
    const email = buildDay1Email({
      name: "Алекс",
      workoutName: "Фулбоди A",
      exercises,
    });

    expect(email.subject).toContain("Первая тренировка");
    expect(email.text).toContain("Алекс, отличная работа!");
    expect(email.text).toContain("Фулбоди A");
    // 70*10*3 + 40*8*3 = 2100 + 960 = 3060 (ru-RU разделитель — nbsp)
    expect(email.text).toMatch(/3[\s\u00a0]060 кг/);
    expect(email.text).toContain("2 упражнения");
    expect(email.text).toContain("6 подходов");
    // «завтра сделай X» — возврат в приложение.
    expect(email.text).toContain("завтра откройте КИЛО");
  });

  it("без siteUrl CTA-кнопки в html нет, без имени — без обращения", () => {
    const email = buildDay1Email({
      workoutName: "Фулбоди A",
      exercises,
    });
    expect(email.html).not.toContain("Открыть КИЛО");
    expect(email.html).not.toContain("<a href=");
    expect(email.text).toContain("Отличная работа!");
    expect(email.text).not.toContain("Алекс");
  });

  it("html с siteUrl содержит кнопку возврата", () => {
    const email = buildDay1Email({
      workoutName: "Фулбоди A",
      exercises,
      siteUrl: "https://kilo.example",
    });
    expect(email.html).toContain("Открыть КИЛО");
    expect(email.html).toContain("https://kilo.example");
  });

  it("правильная плюрализация упражнений", () => {
    const one = buildDay1Email({ workoutName: "X", exercises: [exercises[0]] });
    expect(one.text).toContain("1 упражнение");

    const five = buildDay1Email({
      workoutName: "X",
      exercises: Array.from({ length: 5 }, (_, i) => ({
        ...exercises[0],
        name: `Упражнение ${i}`,
      })),
    });
    expect(five.text).toContain("5 упражнений");
  });
});
