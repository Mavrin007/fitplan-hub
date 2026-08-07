/**
 * Чистая логика недельной сводки (без Convex-рантайма): агрегация записей
 * за окно в структуру WeeklyDigest + рендер текста/HTML письма.
 *
 * Всё, что зависит от БД/окружения, живёт в src/convex/digest.ts; сюда
 * передаются уже собранные строки. Благодаря этому агрегацию можно
 * юнит-тестировать так же, как effort/projection/export — без фейкового
 * ctx.db и без моков отправки.
 */

/** Строка записи веса из weightEntries (проекция). */
export interface DigestWeightRow {
  date: string; // YYYY-MM-DD
  weightKg: number;
}

/** Строка приёма пищи из mealLog (проекция). */
export interface DigestMealRow {
  date: string;
  calories: number;
  protein: number;
}

/** Строка тренировки из workoutLogs (проекция с посчитанным тоннажем). */
export interface DigestWorkoutRow {
  date: string;
  workoutName: string;
  tonnageKg: number;
}

/** Строка воды из waterEntries (проекция). */
export interface DigestWaterRow {
  date: string;
  amountMl: number;
}

export interface DigestInput {
  weightRows: DigestWeightRow[];
  mealRows: DigestMealRow[];
  workoutRows: DigestWorkoutRow[];
  waterRows: DigestWaterRow[];
  /** Цель по калориям (computeTargets.calories) или null без профиля. */
  calorieTarget: number | null;
}

export interface WeeklyDigest {
  /** Есть ли хоть одна запись за окно (иначе письмо не отправляется). */
  hasData: boolean;
  /** Сколько дней окна имеют хоть какую-то активность. */
  trackedDays: number;
  /** Первая запись веса в окне. */
  weightStartKg: number | null;
  /** Последняя запись веса в окне (нужны минимум 2 записи). */
  weightEndKg: number | null;
  /** Изменение веса за окно (последняя − первая). */
  weightDeltaKg: number | null;
  /** Средние калории за дни с записями дневника. */
  avgCalories: number | null;
  /** Средний белок за дни с записями дневника. */
  avgProteinG: number | null;
  /** avgCalories / calorieTarget × 100 (0–999; null без данных/цели). */
  caloriePct: number | null;
  /** Число выполненных тренировок за окно. */
  workoutCount: number;
  /** Суммарный тоннаж (Σ вес × повторы × подходы). */
  tonnageKg: number;
  /** Средняя вода за дни с записями, мл. */
  avgWaterMl: number | null;
}

/** Формат числа с дробной запятой (как в CSV-экспорте, ru-RU). */
export function fmtNum(n: number, digits = 1): string {
  return n.toLocaleString("ru-RU", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function buildWeeklyDigest(input: DigestInput): WeeklyDigest {
  const { weightRows, mealRows, workoutRows, waterRows } = input;

  // Вес: первая и последняя запись окна (по дате). Дельту честно показываем
  // только при наличии минимум двух записей — одна точка ни о чём не говорит.
  const sortedWeights = [...weightRows].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const weightStartKg = sortedWeights[0]?.weightKg ?? null;
  const weightEndKg =
    sortedWeights.length > 1
      ? sortedWeights[sortedWeights.length - 1].weightKg
      : null;
  const weightDeltaKg =
    weightStartKg !== null && weightEndKg !== null
      ? weightEndKg - weightStartKg
      : null;

  // Дневные итоги дневника: среднее считается по дням с записями, а не по
  // всем 7 дням окна — «0 ккал» за пропущенный день искажал бы картину.
  const byDay = new Map<string, { calories: number; protein: number }>();
  for (const m of mealRows) {
    const cur = byDay.get(m.date) ?? { calories: 0, protein: 0 };
    cur.calories += m.calories;
    cur.protein += m.protein;
    byDay.set(m.date, cur);
  }
  const mealDays = [...byDay.values()];
  const avgCalories =
    mealDays.length > 0
      ? mealDays.reduce((s, d) => s + d.calories, 0) / mealDays.length
      : null;
  const avgProteinG =
    mealDays.length > 0
      ? mealDays.reduce((s, d) => s + d.protein, 0) / mealDays.length
      : null;
  const caloriePct =
    avgCalories !== null && input.calorieTarget !== null && input.calorieTarget > 0
      ? Math.round((avgCalories / input.calorieTarget) * 100)
      : null;

  const workoutCount = workoutRows.length;
  const tonnageKg = workoutRows.reduce((s, w) => s + w.tonnageKg, 0);

  const waterByDay = new Map<string, number>();
  for (const w of waterRows) {
    waterByDay.set(w.date, (waterByDay.get(w.date) ?? 0) + w.amountMl);
  }
  const waterDays = [...waterByDay.values()];
  const avgWaterMl =
    waterDays.length > 0
      ? waterDays.reduce((s, v) => s + v, 0) / waterDays.length
      : null;

  const tracked = new Set<string>([
    ...weightRows.map((r) => r.date),
    ...mealRows.map((r) => r.date),
    ...workoutRows.map((r) => r.date),
    ...waterRows.map((r) => r.date),
  ]);

  return {
    hasData: tracked.size > 0,
    trackedDays: tracked.size,
    weightStartKg,
    weightEndKg,
    weightDeltaKg,
    avgCalories,
    avgProteinG,
    caloriePct,
    workoutCount,
    tonnageKg,
    avgWaterMl,
  };
}

/** Экранирование HTML для имени пользователя в письме (защита от инъекций). */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface DigestRenderOpts {
  name?: string;
  appName?: string;
}

/**
 * Строки сводки (по одной на пункт) — общий источник для текстовой версии
 * письма и HTML. Не-ASCII пункты легко добавить/убрать в одном месте.
 */
export function digestLines(d: WeeklyDigest, opts: DigestRenderOpts = {}): string[] {
  const lines: string[] = [
    `Привет${opts.name ? `, ${opts.name}` : ""}! Ваша неделя в ${
      opts.appName ?? "КИЛО"
    }:`,
  ];
  if (d.weightDeltaKg !== null && d.weightStartKg !== null && d.weightEndKg !== null) {
    const sign = d.weightDeltaKg < 0 ? "−" : d.weightDeltaKg > 0 ? "+" : "±";
    lines.push(
      `⚖️ Вес: ${sign}${fmtNum(Math.abs(d.weightDeltaKg))} кг (${fmtNum(
        d.weightStartKg,
      )} → ${fmtNum(d.weightEndKg)})`,
    );
  }
  if (d.avgCalories !== null) {
    const pct = d.caloriePct !== null ? ` — ${d.caloriePct}% цели` : "";
    lines.push(
      `🍽 Калории в среднем: ${Math.round(d.avgCalories)} ккал/день${pct}`,
    );
  }
  if (d.avgProteinG !== null) {
    lines.push(`🥩 Белок в среднем: ${Math.round(d.avgProteinG)} г/день`);
  }
  if (d.workoutCount > 0) {
    const tonnage =
      d.tonnageKg > 0 ? ` (тоннаж ${fmtNum(d.tonnageKg, 0)} кг)` : "";
    lines.push(`🏋️ Тренировок: ${d.workoutCount}${tonnage}`);
  }
  if (d.avgWaterMl !== null) {
    lines.push(`💧 Вода в среднем: ${fmtNum(d.avgWaterMl / 1000)} л/день`);
  }
  // Окно сводки всегда 7 дней (понедельничный cron закрывает прошлую неделю).
  lines.push(`📅 Активных дней: ${d.trackedDays} из 7`);
  lines.push("");
  lines.push(
    "Маленькие шаги каждый день работают лучше больших рывков. До встречи через неделю!",
  );
  return lines;
}

/** Текстовая версия письма (для почтовых клиентов без HTML и для логов). */
export function renderDigestText(d: WeeklyDigest, opts: DigestRenderOpts = {}): string {
  return digestLines(d, opts).join("\n");
}

/** Простая HTML-версия того же письма (та же структура, экранирование). */
export function renderDigestHtml(d: WeeklyDigest, opts: DigestRenderOpts = {}): string {
  const body = digestLines(d, opts)
    .filter((l) => l.length > 0)
    .map((l) => `<p style="margin:0 0 8px;font-size:14px;line-height:1.5;">${escapeHtml(l)}</p>`)
    .join("");
  return (
    `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#222;">` +
    `<h2 style="margin:0 0 16px;font-size:18px;">Неделя в ${escapeHtml(opts.appName ?? "КИЛО")}</h2>` +
    body +
    `<p style="margin:16px 0 0;color:#888;font-size:12px;">Если вы не хотите получать такие письма — напишите нам, и мы отключим рассылку.</p>` +
    `</div>`
  );
}
