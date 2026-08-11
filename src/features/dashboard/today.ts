/**
 * Действия и оценка «дня» для главного экрана (Overview).
 *
 * Чистые функции без UI: из одних и тех же цифр дня собираются три вещи —
 * оценка дня (0–100), чек-лист привычек и совет коуча. Экран отвечает на
 * вопрос «что мне сегодня сделать, чтобы приблизиться к цели?», поэтому вся
 * логика живёт здесь и тестируется без React.
 */

export interface MealsLogged {
  breakfast: boolean;
  lunch: boolean;
  dinner: boolean;
}

export interface TodayInput {
  /** Съедено калорий за сегодня. */
  calories: number;
  calorieTarget: number;
  protein: number;
  proteinTarget: number;
  waterMl: number;
  waterTarget: number;
  /** Тренировок за текущую неделю (Пн–вс). */
  workoutsThisWeek: number;
  /** Цель по тренировкам в неделю (из профиля). */
  trainingTarget: number;
  /** Есть ли запись тренировки за сегодня. */
  workoutToday: boolean;
  /** Какие из трёх основных приёмов пищи записаны сегодня. */
  meals: MealsLogged;
  /** Был ли замер веса на текущей неделе. */
  weightLoggedThisWeek: boolean;
}

export interface ScoreComponent {
  key: "calories" | "water" | "workout" | "protein" | "meals";
  label: string;
  /** 0..100 — насколько привычка закрыта. */
  value: number;
  /** Вклад в итог (сумма = 1). */
  weight: number;
}

export interface TodayScore {
  score: number; // 0..100
  label: string;
  components: ScoreComponent[];
}

export interface ChecklistItem {
  id: "breakfast" | "lunch" | "dinner" | "water" | "workout" | "weight";
  label: string;
  detail?: string;
  done: boolean;
  /** Куда ведёт строка; пустая строка — не ссылка (вода, +рядом кнопки). */
  href: string;
}

export interface CoachAdvice {
  text: string;
  cta?: { label: string; to?: string; action?: "water" | "assistant" };
}

const BANDS: ReadonlyArray<{ min: number; label: string }> = [
  { min: 90, label: "Отличный день" },
  { min: 75, label: "Очень хорошо" },
  { min: 55, label: "Неплохо" },
  { min: 30, label: "Начало положено" },
  { min: 0, label: "Новый день — начнём" },
];

export function clampPct(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/** Человекочитаемый ярлык для оценки дня. */
export function scoreLabel(score: number): string {
  for (const band of BANDS) {
    if (score >= band.min) return band.label;
  }
  return BANDS[BANDS.length - 1].label;
}

/** Русская плюрализация: «1 тренировка, 2 тренировки, 5 тренировок». */
export function pluralize(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(Math.round(n)) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}

/** Литры с одним знаком после запятой: 2300 → «2,3». */
export function liters(ml: number): string {
  return (ml / 1000).toLocaleString("ru-RU", { maximumFractionDigits: 1 });
}

/** Сколько из трёх основных приёмов пищи записано. */
export function mealsLoggedCount(meals: MealsLogged): number {
  return [meals.breakfast, meals.lunch, meals.dinner].filter(Boolean).length;
}

/**
 * Оценка дня 0–100. Взвешенная сумма пяти привычек:
 *   калории 30% (близость к цели, перебор штрафуется),
 *   вода 25%, тренировки за неделю 20%, белок 15%, дневник 10%.
 */
export function computeTodayScore(input: TodayInput): TodayScore {
  const calRatio =
    input.calorieTarget > 0 ? input.calories / input.calorieTarget : 0;
  // На 100% цели — 100; на 50% или 150% — 40; дальше — к нулю.
  const caloriesScore = clampPct(100 - Math.abs(calRatio - 1) * 120);
  const proteinScore =
    input.proteinTarget > 0
      ? clampPct((input.protein / input.proteinTarget) * 100)
      : 0;
  const waterScore =
    input.waterTarget > 0
      ? clampPct((input.waterMl / input.waterTarget) * 100)
      : 0;
  const workoutScore =
    input.trainingTarget > 0
      ? clampPct((input.workoutsThisWeek / input.trainingTarget) * 100)
      : input.workoutsThisWeek > 0
        ? 100
        : 0;
  const mealsScore = clampPct((mealsLoggedCount(input.meals) / 3) * 100);

  const components: ScoreComponent[] = [
    { key: "calories", label: "Калории", value: Math.round(caloriesScore), weight: 0.3 },
    { key: "water", label: "Вода", value: Math.round(waterScore), weight: 0.25 },
    { key: "workout", label: "Тренировки", value: Math.round(workoutScore), weight: 0.2 },
    { key: "protein", label: "Белок", value: Math.round(proteinScore), weight: 0.15 },
    { key: "meals", label: "Дневник", value: Math.round(mealsScore), weight: 0.1 },
  ];

  const score = Math.round(components.reduce((sum, c) => sum + c.value * c.weight, 0));
  return { score, label: scoreLabel(score), components };
}

/** Чек-лист «что закрыть сегодня» — привязан к экранам, где это делается. */
export function buildTodayChecklist(input: TodayInput): ChecklistItem[] {
  const waterDone = input.waterMl >= input.waterTarget;
  return [
    {
      id: "breakfast",
      label: "Завтрак",
      done: input.meals.breakfast,
      href: "/dashboard/meals",
    },
    {
      id: "lunch",
      label: "Обед",
      done: input.meals.lunch,
      href: "/dashboard/meals",
    },
    {
      id: "dinner",
      label: "Ужин",
      done: input.meals.dinner,
      href: "/dashboard/meals",
    },
    {
      id: "water",
      label: "Вода",
      done: waterDone,
      detail: `${liters(input.waterMl)} / ${liters(input.waterTarget)} л`,
      href: "",
    },
    {
      id: "workout",
      label: "Тренировка",
      done: input.workoutToday,
      detail:
        input.workoutsThisWeek > 0
          ? `${input.workoutsThisWeek} за неделю`
          : undefined,
      href: "/dashboard/workouts",
    },
    {
      id: "weight",
      label: "Вес",
      done: input.weightLoggedThisWeek,
      detail: input.weightLoggedThisWeek ? undefined : "замер раз в неделю",
      href: "/dashboard/progress",
    },
  ];
}

/**
 * Короткое контекстное приветствие для чата коуча: «Я вижу твой прогресс
 * за сегодня…». Чистая функция — текст собирается из цифр дня, которые уже
 * загружены на главном экране, поэтому лишних запросов не появляется.
 */
export function buildCoachGreeting(input: TodayInput): string {
  const parts: string[] = [];
  if (input.calorieTarget > 0) {
    parts.push(
      `${input.calories.toLocaleString("ru-RU")} из ${input.calorieTarget.toLocaleString("ru-RU")} ккал`,
    );
  }
  if (input.waterMl > 0 && input.waterTarget > 0) {
    parts.push(`${liters(input.waterMl)} л воды`);
  }
  if (input.trainingTarget > 0) {
    parts.push(
      input.workoutToday ? "тренировка закрыта" : "тренировка ещё впереди",
    );
  }
  const mealsLogged = mealsLoggedCount(input.meals);
  if (mealsLogged > 0 && mealsLogged < 3) {
    parts.push(`записано ${mealsLogged} из 3 приёмов пищи`);
  }
  const summary = parts.length > 0 ? parts.join(", ") : "день пока пуст";
  return `Я вижу твой прогресс за сегодня: ${summary}. О чём рассказать подробнее?`;
}

/**
 * Совет коуча — приоритетная цепочка «что сделать следующим»: тренировка
 * важнее воды, вода — белка и так далее. Когда всё закрыто — похвала.
 */
export function buildCoachAdvice(input: TodayInput): CoachAdvice {
  const workoutsLeft = Math.max(0, input.trainingTarget - input.workoutsThisWeek);
  const waterLeft = input.waterTarget - input.waterMl;
  const proteinLeft = Math.max(0, Math.round(input.proteinTarget - input.protein));
  const caloriesRatio =
    input.calorieTarget > 0 ? input.calories / input.calorieTarget : 0;

  if (!input.workoutToday && workoutsLeft > 0) {
    return {
      text:
        `Сегодня ещё не было тренировки — до недельной цели осталось ` +
        `${workoutsLeft} ${pluralize(workoutsLeft, ["тренировка", "тренировки", "тренировок"])}. ` +
        `Лучший момент — сейчас.`,
      cta: { label: "Перейти к тренировке", to: "/dashboard/workouts" },
    };
  }
  if (waterLeft > 0 && input.waterMl < input.waterTarget * 0.7) {
    return {
      text:
        `До цели по воде не хватает ${liters(waterLeft)} л. ` +
        `Пейте по стакану каждый час — к вечеру догоните.`,
      cta: { label: "Добавить 250 мл", action: "water" },
    };
  }
  if (proteinLeft > 0 && input.protein < input.proteinTarget * 0.7) {
    return {
      text:
        `Сегодня маловато белка: до цели не хватает ${proteinLeft} г. ` +
        `Добавьте к следующему приёму курицу, рыбу или творог.`,
      cta: { label: "Записать еду", to: "/dashboard/meals" },
    };
  }
  if (caloriesRatio < 0.65) {
    return {
      text:
        "Пока съедено меньше половины дневной нормы — не пропускайте " +
        "обед и ужин, чтобы держать темп.",
      cta: { label: "Записать еду", to: "/dashboard/meals" },
    };
  }
  if (!input.meals.breakfast || !input.meals.lunch || !input.meals.dinner) {
    const left = 3 - mealsLoggedCount(input.meals);
    return {
      text:
        `Осталось ${left} ${pluralize(left, ["приём", "приёма", "приёмов"])} — ` +
        `добейте дневник, чтобы оценка дня была честной.`,
      cta: { label: "Записать еду", to: "/dashboard/meals" },
    };
  }
  if (!input.weightLoggedThisWeek) {
    return {
      text:
        "Запишите вес — недельный замер делает прогноз по цели заметно точнее.",
      cta: { label: "Записать вес", to: "/dashboard/progress" },
    };
  }
  return {
    text: "Отличный день — все привычки закрыты! Продолжайте в том же духе.",
    cta: { label: "Спросить ассистента", action: "assistant" },
  };
}
