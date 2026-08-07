import { describe, expect, it } from "vitest";
import {
  describeProjection,
  humanizeDistance,
  projectGoal,
  type GoalProjection,
  type WeightSample,
} from "./projection";

/** Серия замеров с одинаковым темпом −0.2 кг/день (примерно −1.4 кг/нед). */
function losingSeries(): WeightSample[] {
  const base = Date.UTC(2026, 0, 1) / 86_400_000; // 2026-01-01
  return [0, 1, 2, 3, 4].map((i) => ({
    date: new Date((base + i) * 86_400_000).toISOString().slice(0, 10),
    weightKg: 90 - i * 0.2,
  }));
}

describe("projectGoal", () => {
  it("возвращает null без целевого веса", () => {
    expect(projectGoal([], null)).toBeNull();
    expect(projectGoal([], undefined)).toBeNull();
    expect(projectGoal([], 0)).toBeNull();
  });

  it("возвращает null при недостатке замеров (< 3)", () => {
    const samples = losingSeries().slice(0, 2);
    expect(projectGoal(samples, 80)).toBeNull();
  });

  it("считает дату достижения цели при устойчивом снижении", () => {
    const proj = projectGoal(losingSeries(), 80);
    expect(proj).not.toBeNull();
    // 5 дней × 0.2 = 1 кг сброшено, осталось ~9 кг → ~45 дней от среднего.
    expect(proj!.ratePerWeek).toBeCloseTo(-1.4, 1);
    expect(proj!.remainingKg).toBeCloseTo(9, 0);
    expect(proj!.etaDate > "2026-01-06").toBe(true);
  });

  it("строит прогноз, когда тренд идёт к цели (набор веса)", () => {
    const rising: WeightSample[] = [0, 1, 2, 3, 4].map((i) => ({
      date: `2026-01-0${i + 1}`,
      weightKg: 70 + i * 0.3,
    }));
    const proj = projectGoal(rising, 80); // вес растёт к 80 — цель достижима
    expect(proj).not.toBeNull();
    expect(proj!.etaDate > "2026-01-05").toBe(true);
  });

  it("возвращает null при росте веса, когда цель — похудеть", () => {
    const rising: WeightSample[] = [0, 1, 2, 3, 4].map((i) => ({
      date: `2026-01-0${i + 1}`,
      weightKg: 70 + i * 0.3,
    }));
    expect(projectGoal(rising, 65)).toBeNull(); // цель ниже текущего, вес растёт
  });

  it("уверенность растёт с числом замеров", () => {
    // 4 замера — ниже порога уверенности (n >= 5): прогноз есть, но предварительный.
    const short = projectGoal(losingSeries().slice(0, 4), 80);
    const long: WeightSample[] = Array.from({ length: 12 }, (_, i) => ({
      date: new Date((Date.UTC(2026, 0, 1) / 86_400_000 + i) * 86_400_000)
        .toISOString()
        .slice(0, 10),
      weightKg: 90 - i * 0.2,
    }));
    const proj = projectGoal(long, 80);
    expect(short!.confident).toBe(false);
    expect(proj!.confident).toBe(true);
  });

  it("не выдумывает дату, если цель уже достигнута", () => {
    const samples = losingSeries().map((s) => ({ ...s, weightKg: s.weightKg - 15 }));
    expect(projectGoal(samples, 80)).toBeNull();
  });

  it("возвращает null, когда линия тренда пересекла цель до последнего замера", () => {
    // Тренд «худеем» (среднее ~84.8 > цели 80), но линия регрессии пересекает
    // 80 кг примерно на 9.5-й день — РАНЬШЕ последнего замера (10-й день, 80 кг).
    // Это ветка etaDays <= lastX: цель уже достигнута, прогнозную дату
    // выдумывать нельзя. Отличается от теста выше: там срабатывает проверка
    // направления тренда (цель ВЫШЕ весов), здесь — именно пересечение.
    const base = Date.UTC(2026, 0, 1) / 86_400_000;
    const samples: WeightSample[] = [0, 2, 4, 6, 8, 10].map((d) => ({
      date: new Date((base + d) * 86_400_000).toISOString().slice(0, 10),
      weightKg: 90 - d, // 90 → 88 → 86 → 84 → 82 → 80
    }));
    expect(projectGoal(samples, 80)).toBeNull();
  });

  it("возвращает null, если все замеры в один день (нет разброса по времени)", () => {
    const sameDay = [
      { date: "2026-01-01", weightKg: 90 },
      { date: "2026-01-01", weightKg: 89 },
      { date: "2026-01-01", weightKg: 88 },
    ];
    expect(projectGoal(sameDay, 80)).toBeNull();
  });

  it("возвращает null при пологом тренде к цели (slope ≥ −0.001)", () => {
    const shallow = [
      { date: "2026-01-01", weightKg: 90 },
      { date: "2026-01-02", weightKg: 89.9995 },
      { date: "2026-01-03", weightKg: 89.999 },
    ];
    // Снижение ~ −0.0005 кг/день — слишком медленно, чтобы верить прогнозу.
    expect(projectGoal(shallow, 80)).toBeNull();
  });

  it("уважает параметр minSamples", () => {
    // 4 замера достаточно по умолчанию, но не для minSamples = 5.
    expect(projectGoal(losingSeries().slice(0, 4), 80, 5)).toBeNull();
    expect(projectGoal(losingSeries().slice(0, 4), 80)).not.toBeNull();
  });

  it("отфильтровывает замеры с весом ≤ 0", () => {
    const withBad = [
      { date: "2026-01-01", weightKg: 0 },
      { date: "2026-01-02", weightKg: -5 },
      { date: "2026-01-03", weightKg: 90 },
      { date: "2026-01-04", weightKg: 89.8 },
      { date: "2026-01-05", weightKg: 89.6 },
    ];
    const proj = projectGoal(withBad, 85);
    expect(proj).not.toBeNull();
    expect(proj!.remainingKg).toBeCloseTo(4.6, 1); // 89.6 − 85
  });

  it("не зависит от порядка замеров на входе (сортирует внутри)", () => {
    const sorted = losingSeries();
    const reversed = [...sorted].reverse();
    const a = projectGoal(sorted, 80);
    const b = projectGoal(reversed, 80);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a!.etaDate).toBe(b!.etaDate);
    expect(a!.ratePerWeek).toBeCloseTo(b!.ratePerWeek, 6);
  });

  it("remainingKg считается от ПОСЛЕДНЕГО замера, а не от среднего", () => {
    // Серия 90 → 89.2: последний замер 89.2, цель 80 → осталось 9.2 кг.
    const proj = projectGoal(losingSeries(), 80);
    expect(proj).not.toBeNull();
    expect(proj!.remainingKg).toBeCloseTo(9.2, 1);
  });

  it("не уверен в прогнозе на горизонте дольше года", () => {
    // Очень медленное снижение (−0.002 кг/день): цель в ~5000 днях — это
    // далеко за горизонтом 365 дней, даже при 5 замеров confident = false.
    const slow = [0, 1, 2, 3, 4].map((i) => ({
      date: `2026-01-0${i + 1}`,
      weightKg: 90 - i * 0.002,
    }));
    const proj = projectGoal(slow, 80);
    expect(proj).not.toBeNull();
    expect(proj!.confident).toBe(false);
  });
});

describe("humanizeDistance", () => {
  it("форматирует дни/недели/месяцы", () => {
    expect(humanizeDistance("2026-01-10", "2026-01-05")).toBe("5 дней");
    expect(humanizeDistance("2026-01-26", "2026-01-05")).toContain("3");
    expect(humanizeDistance("2026-04-05", "2026-01-05")).toContain("3");
  });
});

describe("describeProjection", () => {
  const proj: GoalProjection = {
    etaDate: "2026-10-28",
    ratePerWeek: -0.5,
    remainingKg: 5.5,
    confident: true,
  };

  it("уверенный прогноз: темп, направление, дистанция, дата, остаток", () => {
    const text = describeProjection(proj, 82, 87.5, "2026-08-07");
    expect(text).toContain("снизить");
    expect(text).toContain("0,5 кг в неделю");
    expect(text).toContain("82,0 кг");
    expect(text).toContain("28 октября 2026");
    expect(text).toContain("5,5 кг");
    expect(text).toContain("~3 месяца");
    expect(text).not.toContain("предварительный");
  });

  it("набор массы: направление «набрать», положительный темп", () => {
    const gain: GoalProjection = {
      etaDate: "2027-02-01",
      ratePerWeek: 0.3,
      remainingKg: 4,
      confident: true,
    };
    const text = describeProjection(gain, 80, 76, "2026-08-07");
    expect(text).toContain("набрать");
    expect(text).toContain("0,3 кг в неделю");
  });

  it("неуверенный прогноз: добавляется оговорка про замеры", () => {
    const text = describeProjection(
      { ...proj, confident: false },
      82,
      87.5,
      "2026-08-07",
    );
    expect(text).toContain("предварительный");
    expect(text).toContain("пару замеров");
  });
});
