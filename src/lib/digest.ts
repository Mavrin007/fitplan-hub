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

export interface DigestInsightOpts {
  /** Дневная цель по воде в мл (waterGoal(weightKg)); по умолчанию 2000. */
  waterTargetMl?: number;
  /** Цель по тренировкам в неделю (preferredTrainingDays); по умолчанию 3. */
  trainingTarget?: number;
  /** Цель по белку в день (computeTargets().protein) для оценки «+N г к среднему». */
  proteinTargetG?: number | null;
}

/**
 * Короткий «AI-разбор» недели для карточки итогов в UI. Приоритетная цепочка
 * (как buildCoachAdvice в today.ts): сначала самое заметное — вес, затем
 * перебор/недобор калорий, пропуск тренировок, вода, последовательность;
 * всё закрыто — похвала. Без React и без Convex — чистая функция.
 */
export function buildWeeklyInsight(
  d: WeeklyDigest,
  opts: DigestInsightOpts = {},
): string {
  if (!d.hasData) {
    return "За эту неделю записей пока нет — начните с малого: стакан воды или один приём пищи в дневнике.";
  }
  const trainingTarget = opts.trainingTarget ?? 3;
  const waterTarget = opts.waterTargetMl ?? 2000;
  const waterPct = d.avgWaterMl !== null ? d.avgWaterMl / waterTarget : null;

  if (d.weightDeltaKg !== null && Math.abs(d.weightDeltaKg) >= 0.5) {
    if (d.weightDeltaKg < 0) {
      return `Вес снизился на ${fmtNum(Math.abs(d.weightDeltaKg))} кг за неделю — темп хороший. Держите белок и сон, чтобы вес уходил за счёт жира, а не мышц.`;
    }
    return `Вес вырос на ${fmtNum(d.weightDeltaKg)} кг. Не паникуйте из-за одного замера — ориентируйтесь на тренд за 2–3 недели.`;
  }
  if (d.caloriePct !== null && d.caloriePct > 120) {
    return `Калорий в среднем ${d.caloriePct}% от цели — похоже, было много перекусов. Вернитесь к трём основным приёмам пищи, и цель снова будет посильной.`;
  }
  if (d.caloriePct !== null && d.caloriePct < 70) {
    return `Питание недотягивает: в среднем ${Math.round(d.avgCalories ?? 0)} ккал/день — это ${d.caloriePct}% от цели. Резкий недобор замедляет прогресс и бьёт по восстановлению.`;
  }
  if (d.workoutCount === 0) {
    const planned =
      trainingTarget > 0 ? ` из ${trainingTarget} запланированных` : "";
    return `Тренировок за неделю не было${planned} — главное не прервать ритм. Начните с одной короткой сессии, и серия вернётся.`;
  }
  if (waterPct !== null && waterPct < 0.7) {
    return `Воды в среднем ${fmtNum(d.avgWaterMl! / 1000)} л/день — это ниже цели. Поставьте бутылку на стол и добавляйте +250 мл к каждому приёму пищи.`;
  }
  if (d.trackedDays < 5) {
    return `Активных дней ${d.trackedDays} из 7. Даже 5 минут записи в день строят привычку — начните с фиксации воды.`;
  }
  return "Отличная неделя: привычки держатся, и именно последовательность приносит результат. Продолжайте в том же темпе.";
}

/** Русская плюрализация «тренировка/тренировки/тренировок» для планов. */
function pluralWorkouts(n: number): string {
  const abs = Math.abs(Math.round(n)) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return "тренировок";
  if (last === 1) return "тренировку";
  if (last >= 2 && last <= 4) return "тренировки";
  return "тренировок";
}

/**
 * «На следующей неделе» — конкретный шаг вперёд из сводки недели. В отличие от
 * buildWeeklyInsight (что было хорошо/плохо) здесь одно действие: дефицит при
 * наборе веса, план тренировок, белок, вода, калории. Чистая функция без UI.
 */
export function buildNextWeekPlan(
  d: WeeklyDigest,
  opts: DigestInsightOpts = {},
): string {
  if (!d.hasData) {
    return "Начните с малого: один приём пищи и стакан воды в день — через неделю будет, что подвести.";
  }
  const trainingTarget = opts.trainingTarget ?? 3;
  const waterTarget = opts.waterTargetMl ?? 2000;
  const workoutsLeft = Math.max(0, trainingTarget - d.workoutCount);
  const waterPct = d.avgWaterMl !== null ? d.avgWaterMl / waterTarget : null;
  const proteinTarget = opts.proteinTargetG ?? null;
  const proteinPct =
    d.avgProteinG !== null && proteinTarget !== null && proteinTarget > 0
      ? d.avgProteinG / proteinTarget
      : null;

  if (d.weightDeltaKg !== null && d.weightDeltaKg >= 0.5) {
    return "Сфокусируйтесь на лёгком дефиците: −300–500 ккал от цели в день и 8–10 тыс. шагов — вес снова пойдёт вниз.";
  }
  if (workoutsLeft > 0) {
    const days = ["Пн", "Ср", "Пт", "Вт", "Чт", "Сб", "Вс"].slice(0, trainingTarget);
    return `Проведите ${trainingTarget} ${pluralWorkouts(trainingTarget)} — например, ${days.join(" / ")}. Если ритм потерян — начните с одной.`;
  }
  if (proteinPct !== null && proteinPct < 0.9) {
    const need = Math.round(proteinTarget! - (d.avgProteinG ?? 0));
    return `Увеличьте белок до ${proteinTarget} г в день (+${Math.max(0, need)} г к среднему) — порция белка к каждому приёму пищи.`;
  }
  if (waterPct !== null && waterPct < 0.8) {
    return `Пейте ${fmtNum(waterTarget / 1000)} л воды в день — сейчас в среднем ${fmtNum((d.avgWaterMl ?? 0) / 1000)} л. Бутылка на столе = половина успеха.`;
  }
  if (d.caloriePct !== null && d.caloriePct > 115) {
    return "Удержите калории в цели: три основных приёма пищи и без перекусов после ужина.";
  }
  return "Удерживайте текущий темп — он уже даёт результат. Добавьте один новый источник белка для разнообразия.";
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
