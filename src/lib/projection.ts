/** Прогноз достижения целевого веса на основе динамики замеров.
 *
 *  Берём последние замеры веса, строим линейную регрессию
 *  (вес = a + b × день) и считаем, когда линия пересечёт целевой вес.
 *  Если данных мало, тренд неуверенный или направлен от цели — честно
 *  возвращаем `null` вместо выдуманной даты.
 */

import { pluralDays, pluralMonths, pluralWeeks } from "./dates";

export interface WeightSample {
  date: string; // YYYY-MM-DD
  weightKg: number;
}

export interface GoalProjection {
  /** Дата (YYYY-MM-DD), когда прогноз достигает цели. */
  etaDate: string;
  /** Скорость изменения веса, кг в неделю (отрицательная — снижение). */
  ratePerWeek: number;
  /** Сколько килограммов осталось до цели (по модулю). */
  remainingKg: number;
  /** Верится ли прогнозу (достаточно замеров и уверенности тренда). */
  confident: boolean;
}

/** Разбирает «YYYY-MM-DD» в число дней от начала эпохи (локально). */
function daysFromKey(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** Дата в «YYYY-MM-DD» из числа дней от начала эпохи. */
function keyFromDays(days: number): string {
  const d = new Date(days * 86_400_000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Строит прогноз достижения `targetWeightKg` по зафиксированному весу.
 *
 * @param samples Замеры веса (порядок не важен — сортируются внутри).
 * @param targetWeightKg Целевой вес из профиля (0/undefined — нет цели).
 * @param minSamples Минимум замеров для прогноза (по умолчанию 3).
 * @returns Прогноз или `null`, если его нельзя построить честно.
 */
export function projectGoal(
  samples: WeightSample[],
  targetWeightKg: number | null | undefined,
  minSamples = 3,
): GoalProjection | null {
  if (!targetWeightKg || targetWeightKg <= 0) return null;

  const sorted = [...samples]
    .filter((s) => s.weightKg > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < minSamples) return null;

  // Линейная регрессия по дням: y = a + b·x
  const xs = sorted.map((s) => daysFromKey(s.date));
  const ys = sorted.map((s) => s.weightKg);
  const n = xs.length;
  const meanX = xs.reduce((s, x) => s + x, 0) / n;
  const meanY = ys.reduce((s, y) => s + y, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  // Нет разброса по времени (все замеры в один день) — тренда нет.
  if (den === 0) return null;
  const slope = num / den; // кг в день

  // Тренд должен вести к цели: снижение для похудения, рост для набора.
  const losing = targetWeightKg < meanY;
  if (losing ? slope >= -0.001 : slope <= 0.001) return null;

  const a = meanY - slope * meanX;
  const etaDays = (targetWeightKg - a) / slope;
  const lastX = xs[xs.length - 1];
  if (etaDays <= lastX) return null; // уже у цели или «мимо»

  const etaDate = keyFromDays(Math.ceil(etaDays));
  const remainingKg = Math.abs(targetWeightKg - meanY);
  const horizonDays = Math.max(30, etaDays - lastX);
  const ratePerWeek = slope * 7;

  // Уверенность: достаточно замеров и не слишком длинный горизонт.
  const confident = n >= 5 && horizonDays <= 365;

  return { etaDate, ratePerWeek, remainingKg, confident };
}

/** «2 недели», «3 недели», «около 2 месяцев» — человекочитаемая дистанция. */
export function humanizeDistance(etaDate: string, fromDate: string): string {
  const days = Math.max(1, Math.round(daysFromKey(etaDate) - daysFromKey(fromDate)));
  if (days < 7) return `${days} ${pluralDays(days)}`;
  if (days < 30) {
    const w = Math.round(days / 7);
    return `~${w} ${pluralWeeks(w)}`;
  }
  const m = Math.round(days / 30);
  return `~${m} ${pluralMonths(m)}`;
}
