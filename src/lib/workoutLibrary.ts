/** Генератор плана тренировок — подбирает структурированный недельный план
 *  исходя из полного профиля: цели, уровня подготовки, антропометрии
 *  (рост/вес/ИМТ), пола, возраста, повседневной активности, целевого веса,
 *  доступного инвентаря, ограничений/травм и предпочитаемого числа тренировок
 *  в неделю. Понимает, какие упражнения подходят конкретному пользователю
 *  (приоритеты и замены с объяснением причин), назначает стартовые рабочие
 *  веса под профиль, темп выполнения, разминку и раскладывает план на цикл
 *  из 4 недель с автоматической прогрессией нагрузки. */

import type {
  ActivityLevel,
  ExperienceLevel,
  FitnessGoal,
  Gender,
  Limitation,
} from "./nutrition";
import {
  ACTIVITY_LABELS,
  EXPERIENCE_LABELS,
  GENDER_LABELS,
  GOAL_LABELS,
  LIMITATION_LABELS,
} from "./nutrition";

export interface Exercise {
  name: string;
  sets: number;
  reps: string;
  restSeconds: number;
  priority?: boolean; // стоит в приоритете для этого профиля
  weightNote?: string; // рекомендация по прогрессии на конкретную неделю
  weightKg?: number; // стартовый рабочий вес (кг) под профиль пользователя
  tempo?: string; // темп выполнения, напр. "3-1-1" (эксцентрика-пауза-концентрика)
}

export interface WorkoutDay {
  day: number; // 0 = Понедельник ... 6 = Воскресенье
  focus: string;
  exercises: Exercise[];
  notes?: string[]; // персональные замечания по дню
  warmup?: string[]; // разминка/мобильность перед тренировкой
}

export interface WorkoutTemplate {
  name: string;
  adaptedFor?: string; // краткая сводка адаптации под профиль
  splitType?: string; // «Фулбоди», «Жим/Тяга/Ноги», «Силовая + HIIT»…
  sessionsPerWeek?: number; // 1–6
  durationWeeks?: number; // длина цикла (4)
  howCalculated?: string[]; // пункты «как считается этот план»
  days: WorkoutDay[];
}

/** Одна неделя цикла прогрессии: те же дни, что в базовом плане, но с
 *  пересчитанными подходами/повторами и рабочими весами. */
export interface ProgressionWeek {
  week: number; // 1-based
  label: string; // например «Неделя 2 · Прогресс»
  weightNote?: string; // общая рекомендация недели
  days: WorkoutDay[];
}

/** Полный профиль пользователя — все данные, которые влияют на план:
 *  пол, возраст, рост, вес, целевой вес, повседневная активность,
 *  фитнес-цель, уровень подготовки, доступный инвентарь, ограничения
 *  и предпочитаемое число тренировок в неделю. */
export interface TrainingProfile {
  gender: Gender;
  age: number;
  heightCm: number;
  weightKg: number;
  targetWeightKg?: number;
  activityLevel: ActivityLevel;
  fitnessGoal: FitnessGoal;
  experienceLevel: ExperienceLevel;
  equipment?: string[]; // сырые ключи инвентаря (нормализуются внутри)
  limitations?: string[]; // сырые ключи ограничений (нормализуются внутри)
  preferredTrainingDays?: number; // 1–6
}

export type BodyBuild = "tall" | "average" | "short";

/** Количество недель в цикле прогрессии. */
export const PLAN_WEEKS = 4;

/** Фазы цикла: база → двойная прогрессия (+1 повтор) → пик (+вес) → разгрузка. */
const PROGRESSION_PHASES = [
  { label: "База", hint: "рабочие веса с прошлого цикла" },
  { label: "Прогресс", hint: "те же веса, +1 повтор в каждом подходе" },
  { label: "Пик", hint: "веса +2.5 кг, повторения к базе" },
  { label: "Разгрузка", hint: "−20% веса, меньше подходов, восстановление" },
];

/* ------------------------------------------------------------------ */
/* Инвентарь                                                           */
/* ------------------------------------------------------------------ */

export type Equipment =
  | "barbell" // штанга
  | "dumbbell" // гантели
  | "machine" // тренажёры
  | "cable" // блоки
  | "kettlebell" // гиря
  | "bodyweight"; // собственный вес

export const EQUIPMENT_KEYS: Equipment[] = [
  "barbell",
  "dumbbell",
  "machine",
  "cable",
  "kettlebell",
  "bodyweight",
];

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  barbell: "Штанга",
  dumbbell: "Гантели",
  machine: "Тренажёры",
  cable: "Блоки",
  kettlebell: "Гиря",
  bodyweight: "Собственный вес",
};

/** Быстрые пресеты инвентаря для страницы профиля. */
export const EQUIPMENT_PRESETS: { label: string; items: Equipment[] }[] = [
  {
    label: "Полный зал",
    items: ["barbell", "dumbbell", "machine", "cable", "kettlebell", "bodyweight"],
  },
  { label: "Штанга + гантели", items: ["barbell", "dumbbell", "bodyweight"] },
  { label: "Гантели дома", items: ["dumbbell", "bodyweight"] },
  { label: "Без инвентаря", items: ["bodyweight"] },
];

/** Отбрасывает неизвестные ключи из сырого списка инвентаря. */
export function normalizeEquipment(raw: string[] | undefined): Equipment[] {
  if (!raw) return [];
  return raw.filter((e): e is Equipment =>
    EQUIPMENT_KEYS.includes(e as Equipment),
  );
}

/** Отбрасывает неизвестные ключи из сырого списка ограничений. */
export function normalizeLimitations(raw: string[] | undefined): Limitation[] {
  if (!raw) return [];
  const known: Limitation[] = ["lower_back", "knees", "shoulders"];
  return raw.filter((l): l is Limitation => (known as string[]).includes(l));
}

/** Человекочитаемый список инвентаря: «штанга, гантели» или «без инвентаря». */
export function equipmentSummary(equipment?: string[]): string {
  const list = normalizeEquipment(equipment);
  if (list.length === 0) return "без инвентаря";
  return list.map((e) => EQUIPMENT_LABELS[e].toLowerCase()).join(", ");
}

/** Упражнения с собственным весом — им нельзя советовать «+2.5 кг». */
const BODYWEIGHT_NAMES = new Set([
  "Отжимания",
  "Планка",
  "Скалолаз",
  "Приседания без веса",
  "Приседания",
  "Подъём коленей в висе",
  "Скручивания «велосипед»",
  "Джампинг-джек",
  "Бёрпи",
  "Марш с подъёмом коленей",
  "Ходьба / бег",
  "Спринт-интервалы",
  "Ягодичный мостик",
  "Птица-собака",
]);

/** Какое оборудование требуется упражнению (если перечислено несколько —
 *  достаточно любого из них). */
const EXERCISE_EQUIPMENT: Record<string, Equipment[]> = {
  "Жим лёжа": ["barbell", "dumbbell"],
  "Жим стоя": ["barbell", "dumbbell"],
  "Жим гантелей под наклоном": ["dumbbell"],
  "Махи в стороны": ["dumbbell"],
  "Разгибание рук на блоке": ["cable"],
  "Становая тяга": ["barbell"],
  "Подтягивания": ["bodyweight"],
  "Тяга штанги в наклоне": ["barbell"],
  "Тяга к лицу": ["cable"],
  "Сгибания рук со штангой": ["barbell"],
  "Приседания со штангой": ["barbell"],
  "Румынская тяга": ["barbell", "dumbbell"],
  "Жим ногами": ["machine"],
  "Выпады в ходьбе": ["dumbbell", "bodyweight"],
  "Подъёмы на носки": ["machine", "bodyweight"],
  "Тяга верхнего блока": ["machine", "cable"],
  "Тяга горизонтального блока": ["machine", "cable"],
  "Гоблет-приседания": ["dumbbell", "bodyweight"],
  "Махи гирей": ["kettlebell", "dumbbell"],
  "Степ-ап с весом": ["dumbbell", "bodyweight"],
  "Запрыгивания на тумбу": ["bodyweight"],
  "Приседания": ["bodyweight"],
  "Отжимания": ["bodyweight"],
  "Планка": ["bodyweight"],
  "Скалолаз": ["bodyweight"],
  "Приседания без веса": ["bodyweight"],
  "Подъём коленей в висе": ["bodyweight"],
  "Скручивания «велосипед»": ["bodyweight"],
  "Джампинг-джек": ["bodyweight"],
  "Бёрпи": ["bodyweight"],
  "Марш с подъёмом коленей": ["bodyweight"],
  "Ходьба / бег": ["bodyweight"],
  "Спринт-интервалы": ["bodyweight"],
  "Птица-собака": ["bodyweight"],
  // Замены из карты EQUIPMENT_ALTERNATIVES тоже должны быть оттегированы.
  "Тяга гантели в наклоне": ["dumbbell"],
  "Французский жим с гантелью": ["dumbbell"],
  "Разведение гантелей в наклоне": ["dumbbell"],
  "Сгибания с гантелями": ["dumbbell"],
  "Ягодичный мостик": ["bodyweight"],
};

/** Вес олимпийского грифа (кг). Все веса штанговых упражнений в плане — это
 *  ОБЩИЙ вес снаряда: гриф + блины. Например «жим лёжа 40 кг» = гриф 20 кг
 *  + блины по 10 кг с каждой стороны. Стартовый вес, разминка и разгрузка
 *  штанговых упражнений никогда не опускаются ниже веса грифа (пустой гриф
 *  — минимально возможная нагрузка на штанге). */
export const BARBELL_BAR_WEIGHT_KG = 20;

/** Штанговые упражнения: их вес считается общим (гриф включён). */
export function isBarbellExercise(name: string): boolean {
  return EXERCISE_EQUIPMENT[name]?.includes("barbell") ?? false;
}

/** Замены упражнения, если его нельзя выполнить с доступным инвентарём:
 *  первая подходящая по инвентарю замена выигрывает. */
const EQUIPMENT_ALTERNATIVES: Record<
  string,
  { name: string; equipment: Equipment[] }[]
> = {
  "Становая тяга": [
    { name: "Румынская тяга", equipment: ["barbell", "dumbbell"] },
    { name: "Ягодичный мостик", equipment: ["bodyweight"] },
  ],
  "Приседания со штангой": [
    { name: "Гоблет-приседания", equipment: ["dumbbell", "bodyweight"] },
    { name: "Приседания", equipment: ["bodyweight"] },
  ],
  "Подтягивания": [
    { name: "Тяга верхнего блока", equipment: ["machine", "cable"] },
    { name: "Тяга гантели в наклоне", equipment: ["dumbbell"] },
  ],
  "Тяга штанги в наклоне": [
    { name: "Тяга гантели в наклоне", equipment: ["dumbbell"] },
    { name: "Тяга горизонтального блока", equipment: ["machine", "cable"] },
  ],
  "Разгибание рук на блоке": [
    { name: "Французский жим с гантелью", equipment: ["dumbbell"] },
  ],
  "Тяга к лицу": [
    { name: "Разведение гантелей в наклоне", equipment: ["dumbbell"] },
  ],
  "Сгибания рук со штангой": [
    { name: "Сгибания с гантелями", equipment: ["dumbbell"] },
  ],
  "Жим ногами": [
    { name: "Гоблет-приседания", equipment: ["dumbbell", "bodyweight"] },
    { name: "Приседания", equipment: ["bodyweight"] },
  ],
  "Тяга верхнего блока": [
    { name: "Подтягивания", equipment: ["bodyweight"] },
    { name: "Тяга гантели в наклоне", equipment: ["dumbbell"] },
  ],
  "Тяга горизонтального блока": [
    { name: "Тяга гантели в наклоне", equipment: ["dumbbell"] },
  ],
};

/** Правила подбора упражнений по антропометрии, полу и возрасту:
 *  tall (≥185 см) — длинные рычаги: классические тяги, приседания со штангой
 *  и подтягивания дают больше нагрузки на суставы → безопасные аналоги и
 *  приоритет тренажёрам / шарнирным движениям.
 *  short (≤170 см) — компактные рычаги: база (тяга, присед, жимы, подтягивания)
 *  технически выгодна → приоритет.
 *  heavy (ИМТ ≥ 27) — низкоударные замены: без прыжков и подтягиваний.
 *  female — приоритет задней цепи, ягодицам и ногам (сильная зона),
 *  верх тела в тех же диапазонах.
 *  senior (≥ 50 лет) — щадящие замены без осевой/ударной нагрузки, +30 с отдыха. */
const ANTHRO_RULES: Record<
  string,
  Partial<Record<BodyBuild | "heavy" | "female" | "senior", AnthroRule>>
> = {
  "Становая тяга": {
    tall: {
      alternative: "Румынская тяга",
      reason:
        "при высоком росте длинные рычаги перегружают поясницу — румынская тяга нагружает заднюю цепь безопаснее",
      priority: true,
    },
    short: {
      priority: true,
      reason: "короткие конечности дают отличный рычаг",
    },
    senior: {
      alternative: "Румынская тяга",
      reason:
        "с возрастом осевая нагрузка на поясницу избыточна — румынская тяга безопаснее",
      restBonus: 30,
    },
  },
  "Приседания со штангой": {
    tall: {
      alternative: "Гоблет-приседания",
      reason:
        "длинные бёдра заставляют сильно наклоняться — гоблет-приседания держат корпус прямее",
      priority: true,
    },
    short: {
      priority: true,
      reason: "компактная механика — идеальный рычаг",
    },
    senior: {
      alternative: "Гоблет-приседания",
      reason:
        "с возрастом осевая нагрузка на позвоночник избыточна — гоблет-приседания безопаснее",
      restBonus: 30,
    },
  },
  Подтягивания: {
    tall: {
      alternative: "Тяга верхнего блока",
      reason:
        "при длинных руках подтягивания тяжелее для плеч — верхний блок безопаснее",
      priority: true,
    },
    heavy: {
      alternative: "Тяга верхнего блока",
      reason: "с лишним весом подтягивания перегружают суставы",
    },
    short: {
      priority: true,
      reason: "короткие руки — выигрышный рычаг",
    },
    senior: {
      alternative: "Тяга верхнего блока",
      reason: "с возрастом подтягивания тяжелее для плеч и локтей",
    },
  },
  "Запрыгивания на тумбу": {
    heavy: {
      alternative: "Степ-ап с весом",
      reason: "прыжки с лишним весом бьют по коленям — степ-ап безопаснее",
    },
    senior: {
      alternative: "Степ-ап с весом",
      reason: "прыжковая нагрузка с возрастом травмоопасна — степ-ап безопаснее",
      restBonus: 15,
    },
  },
  "Джампинг-джек": {
    heavy: {
      alternative: "Марш с подъёмом коленей",
      reason: "низкоударная замена прыжкам",
    },
    senior: {
      alternative: "Марш с подъёмом коленей",
      reason: "низкоударная замена прыжкам с возрастом",
    },
  },
  Бёрпи: {
    senior: {
      alternative: "Марш с подъёмом коленей",
      reason: "высокоударная связка с возрастом избыточна",
      restBonus: 15,
    },
  },
  "Жим ногами": {
    tall: {
      priority: true,
      reason: "тренажёр снимает нагрузку со спины при длинных ногах",
    },
    female: {
      priority: true,
      reason: "акцент на бёдра и ягодицы — сильная зона",
    },
  },
  "Румынская тяга": {
    tall: {
      priority: true,
      reason: "шарнирное движение — идеально для длинных ног",
    },
    female: {
      priority: true,
      reason: "нагружает заднюю цепь и ягодицы — сильная зона",
    },
  },
  "Выпады в ходьбе": {
    female: {
      priority: true,
      reason: "изолированно нагружают ягодицы и бицепс бедра",
    },
  },
  "Подъёмы на носки": {
    female: {
      priority: true,
      reason: "формируют икры и голень — хороший баланс",
    },
  },
  "Тяга к лицу": {
    tall: {
      priority: true,
      reason: "укрепляет плечи — защита при длинных рычагах",
    },
  },
  "Жим лёжа": {
    short: { priority: true, reason: "короткие руки — короткая амплитуда" },
  },
  "Жим стоя": {
    short: { priority: true, reason: "короткий путь снаряда — лучший контроль" },
  },
};

/** Правила подбора упражнений по ограничениям/травмам (применяются после
 *  антропометрии и до инвентаря): рискованные движения заменяются на
 *  безопасные аналоги с объяснением причины. */
const INJURY_RULES: Record<
  Limitation,
  Record<string, { alternative: string; reason: string; priority?: boolean }>
> = {
  lower_back: {
    "Становая тяга": {
      alternative: "Румынская тяга",
      reason: "осевая нагрузка на поясницу заменена на шарнирную тягу",
      priority: true,
    },
    "Приседания со штангой": {
      alternative: "Гоблет-приседания",
      reason: "меньше осевой нагрузки на поясницу",
      priority: true,
    },
    "Тяга штанги в наклоне": {
      alternative: "Тяга гантели в наклоне",
      reason: "опора снижает нагрузку на поясницу",
    },
    "Скручивания «велосипед»": {
      alternative: "Планка",
      reason: "статика безопаснее для поясницы, чем скручивания",
    },
  },
  knees: {
    "Приседания со штангой": {
      alternative: "Гоблет-приседания",
      reason: "меньше нагрузки на коленные суставы",
      priority: true,
    },
    "Выпады в ходьбе": {
      alternative: "Степ-ап с весом",
      reason: "контролируемая амплитуда вместо шагающих выпадов",
    },
    "Запрыгивания на тумбу": {
      alternative: "Степ-ап с весом",
      reason: "без ударной нагрузки на колени",
    },
    "Джампинг-джек": {
      alternative: "Марш с подъёмом коленей",
      reason: "низкоударная замена прыжкам",
    },
    Бёрпи: {
      alternative: "Марш с подъёмом коленей",
      reason: "без прыжков и приседаний с отскоком",
    },
    "Спринт-интервалы": {
      alternative: "Ходьба / бег",
      reason: "ровный темп вместо спринтов щадит колени",
    },
  },
  shoulders: {
    "Жим стоя": {
      alternative: "Жим гантелей под наклоном",
      reason: "без жима над головой — щадящая траектория для плеч",
      priority: true,
    },
    Подтягивания: {
      alternative: "Тяга верхнего блока",
      reason: "тяга сверху щадит плечевые суставы",
    },
  },
};

interface AnthroRule {
  reason: string;
  alternative?: string; // замена (с теми же подходами/повторами)
  priority?: boolean;
  restBonus?: number; // дополнительные секунды отдыха (напр. для старшего возраста)
}

function ex(name: string, sets: number, reps: string, restSeconds: number): Exercise {
  return { name, sets, reps, restSeconds };
}

const PUSH = [
  ex("Жим лёжа", 4, "6–8", 120),
  ex("Жим стоя", 3, "8–10", 90),
  ex("Жим гантелей под наклоном", 3, "8–10", 90),
  ex("Махи в стороны", 3, "12–15", 60),
  ex("Разгибание рук на блоке", 3, "10–12", 60),
];

const PULL = [
  ex("Становая тяга", 4, "5", 180),
  ex("Подтягивания", 4, "6–8", 120),
  ex("Тяга штанги в наклоне", 3, "8–10", 90),
  ex("Тяга к лицу", 3, "12–15", 60),
  ex("Сгибания рук со штангой", 3, "10–12", 60),
];

const LEGS = [
  ex("Приседания со штангой", 4, "6–8", 150),
  ex("Румынская тяга", 3, "8–10", 120),
  ex("Жим ногами", 3, "10–12", 90),
  ex("Выпады в ходьбе", 3, "10–12 / нога", 60),
  ex("Подъёмы на носки", 4, "15", 45),
];

const FULL_BODY_A = [
  ex("Приседания", 3, "8–10", 120),
  ex("Жим лёжа", 3, "8–10", 120),
  ex("Тяга верхнего блока", 3, "10–12", 90),
  ex("Жим стоя", 2, "10–12", 90),
  ex("Планка", 3, "30–45с", 45),
];

const FULL_BODY_B = [
  ex("Становая тяга", 3, "6–8", 150),
  ex("Жим гантелей под наклоном", 3, "10–12", 90),
  ex("Тяга горизонтального блока", 3, "10–12", 90),
  ex("Гоблет-приседания", 3, "10–12", 90),
  ex("Подъём коленей в висе", 3, "10–15", 45),
];

const CIRCUIT = [
  ex("Джампинг-джек", 4, "30с", 30),
  ex("Отжимания", 4, "10–15", 30),
  ex("Приседания без веса", 4, "15–20", 30),
  ex("Скалолаз", 4, "30с", 30),
  ex("Планка", 4, "30с", 30),
];

const HIIT = [
  ex("Спринт-интервалы", 8, "20с / 40с отдых", 40),
  ex("Бёрпи", 4, "10–12", 45),
  ex("Махи гирей", 4, "15", 45),
  ex("Запрыгивания на тумбу", 4, "10–12", 60),
  ex("Скручивания «велосипед»", 4, "20", 30),
];

/** Круговая тренировка для цели «выносливость»: больше повторений,
 *  короткий отдых, упор на работу всего тела. */
const ENDURANCE_CIRCUIT = [
  ex("Марш с подъёмом коленей", 5, "40с", 30),
  ex("Отжимания", 5, "12–20", 30),
  ex("Приседания без веса", 5, "15–25", 30),
  ex("Скалолаз", 5, "40с", 30),
  ex("Планка", 5, "40с", 30),
];

/** Метаболический круг для цели «выносливость»: интервалы + гири + кор. */
const ENDURANCE_HIIT = [
  ex("Спринт-интервалы", 10, "20с / 40с отдых", 40),
  ex("Махи гирей", 5, "15–20", 40),
  ex("Бёрпи", 5, "12–15", 45),
  ex("Марш с подъёмом коленей", 5, "40с", 30),
  ex("Скручивания «велосипед»", 5, "25", 30),
];

const CARDIO_DAY = [ex("Ходьба / бег", 1, "30–40 мин", 0)];

/** Сессия-«семя»: упражнения без дня недели — день назначается при сборке. */
interface SessionSeed {
  name: string; // название фокуса («Фулбоди A»)
  exercises: Exercise[];
}

/** Пулы сессий по цели и уровню подготовки + тип сплита. */
function buildSessionPool(
  goal: FitnessGoal,
  experience: ExperienceLevel,
): { splitType: string; pool: SessionSeed[] } {
  if (goal === "improve_endurance") {
    return {
      splitType: "Круги на выносливость",
      pool: [
        { name: "Круговая", exercises: ENDURANCE_CIRCUIT },
        { name: "Метаболический круг", exercises: ENDURANCE_HIIT },
        { name: "Лёгкое кардио", exercises: CARDIO_DAY },
      ],
    };
  }
  if (goal === "gain_muscle") {
    if (experience === "beginner") {
      return {
        splitType: "Фулбоди",
        pool: [
          { name: "Фулбоди A", exercises: FULL_BODY_A },
          { name: "Фулбоди B", exercises: FULL_BODY_B },
        ],
      };
    }
    return {
      splitType: "Жим/Тяга/Ноги",
      pool: [
        { name: "Жимовая", exercises: PUSH },
        { name: "Тяговая", exercises: PULL },
        { name: "Ноги", exercises: LEGS },
      ],
    };
  }
  if (goal === "lose_weight") {
    if (experience === "beginner") {
      return {
        splitType: "Круговая + силовая",
        pool: [
          { name: "Круговая", exercises: CIRCUIT },
          { name: "Фулбоди B", exercises: FULL_BODY_B },
          { name: "Лёгкое кардио", exercises: CARDIO_DAY },
        ],
      };
    }
    return {
      splitType: "Силовая + HIIT",
      pool: [
        { name: "Ноги", exercises: LEGS },
        { name: "HIIT", exercises: HIIT },
        { name: "Жимовая", exercises: PUSH },
        { name: "Тяговая", exercises: PULL },
      ],
    };
  }
  // Поддержание веса / общей формы
  if (experience === "beginner") {
    return {
      splitType: "Фулбоди",
      pool: [
        { name: "Фулбоди A", exercises: FULL_BODY_A },
        { name: "Фулбоди B", exercises: FULL_BODY_B },
      ],
    };
  }
  return {
    splitType: "Верх/Низ",
    pool: [
      { name: "Жимовая", exercises: PUSH },
      { name: "Ноги", exercises: LEGS },
      { name: "Тяговая", exercises: PULL },
    ],
  };
}

/** Сколько тренировок в неделю задаёт цель и уровень по умолчанию. */
function defaultSessions(goal: FitnessGoal, experience: ExperienceLevel): number {
  if (goal === "improve_endurance") return experience === "beginner" ? 3 : 4;
  if (goal === "gain_muscle")
    return experience === "beginner" ? 3 : experience === "advanced" ? 5 : 4;
  if (goal === "lose_weight")
    return experience === "beginner" ? 3 : experience === "advanced" ? 5 : 4;
  return experience === "beginner" ? 2 : 3;
}

/** Классифицирует профиль по антропометрии и ИМТ. */
function classifyProfile(profile: TrainingProfile): {
  build: BodyBuild;
  heavy: boolean;
  bmi: number;
} {
  const bmi = profile.weightKg / Math.pow(profile.heightCm / 100, 2);
  const build: BodyBuild =
    profile.heightCm >= 185
      ? "tall"
      : profile.heightCm <= 170
        ? "short"
        : "average";
  return { build, heavy: bmi >= 27, bmi };
}

/** Применяет персональные правила к дню плана: заменяет неподходящие
 *  упражнения, помечает приоритетные и собирает заметки с причинами. */
function adaptDay(
  day: WorkoutDay,
  ctx: {
    build: BodyBuild;
    heavy: boolean;
    female: boolean;
    senior: boolean;
  },
): { day: WorkoutDay; notes: string[] } {
  const notes: string[] = [];
  const exercises = day.exercises.map((exercise) => {
    const rule =
      (ctx.senior ? ANTHRO_RULES[exercise.name]?.senior : undefined) ??
      (ctx.heavy ? ANTHRO_RULES[exercise.name]?.heavy : undefined) ??
      ANTHRO_RULES[exercise.name]?.[ctx.build] ??
      (ctx.female ? ANTHRO_RULES[exercise.name]?.female : undefined);

    if (!rule) {
      // Без замен, но возрастное правило отдыха всё равно применяется.
      return ctx.senior
        ? { ...exercise, restSeconds: exercise.restSeconds + 30 }
        : exercise;
    }

    const restSeconds =
      exercise.restSeconds + (rule.restBonus ?? (ctx.senior ? 30 : 0));

    if (rule.alternative) {
      notes.push(`«${exercise.name}» → «${rule.alternative}»: ${rule.reason}.`);
      return {
        ...exercise,
        name: rule.alternative,
        restSeconds,
        priority: rule.priority,
      };
    }
    if (rule.priority) {
      notes.push(`«${exercise.name}» — ${rule.reason}.`);
      return { ...exercise, restSeconds, priority: true };
    }
    return { ...exercise, restSeconds };
  });
  return { day: { ...day, exercises }, notes };
}

/** Применяет правила ограничений/травм: рискованные движения заменяются на
 *  безопасные аналоги, причины попадают в заметки дня. */
function adaptForInjuries(
  day: WorkoutDay,
  limitations: Limitation[],
): { day: WorkoutDay; notes: string[] } {
  if (limitations.length === 0) return { day, notes: [] };

  const notes: string[] = [];
  const exercises = day.exercises.map((exercise) => {
    for (const limitation of limitations) {
      const rule = INJURY_RULES[limitation]?.[exercise.name];
      if (!rule) continue;
      notes.push(
        `По ограничению «${LIMITATION_LABELS[limitation].toLowerCase()}»: «${exercise.name}» → «${rule.alternative}» — ${rule.reason}.`,
      );
      return { ...exercise, name: rule.alternative, priority: rule.priority };
    }
    return exercise;
  });
  return { day: { ...day, exercises }, notes };
}

/** Подстраивает день под доступный инвентарь: упражнения, которые нельзя
 *  выполнить с выбранным оборудованием, заменяются на аналоги (с теми же
 *  подходами/повторами), а причины попадают в заметки дня. */
function adaptForEquipment(
  day: WorkoutDay,
  available: Set<Equipment>,
): { day: WorkoutDay; notes: string[] } {
  // Инвентарь не выбран — считаем, что есть всё (полный зал по умолчанию).
  if (available.size === 0) return { day, notes: [] };

  const notes: string[] = [];
  const exercises = day.exercises.map((exercise) => {
    const required = EXERCISE_EQUIPMENT[exercise.name];
    if (!required || required.some((e) => available.has(e))) {
      return exercise; // подходит для доступного инвентаря
    }
    const options = EQUIPMENT_ALTERNATIVES[exercise.name] ?? [];
    const alt = options.find((o) => o.equipment.some((e) => available.has(e)));
    if (!alt) return exercise; // нет подходящей замены — оставляем как есть

    notes.push(
      `«${exercise.name}» → «${alt.name}»: нет нужного инвентаря (${equipmentSummary([...required])}).`,
    );
    return { ...exercise, name: alt.name };
  });
  return { day: { ...day, exercises }, notes };
}

/** Справочные стартовые веса (кг) для отягощённых упражнений — отправная
 *  точка для мужчины ~75 кг, ~30 лет, среднего уровня подготовки.
 *  Ниже корректируются под пол, возраст, опыт и собственный вес.
 *  ВАЖНО: для штанговых упражнений это ОБЩИЙ вес снаряда (гриф 20 кг + блины),
 *  и он никогда не опускается ниже 20 кг — пустой гриф это минимум. */
const REFERENCE_WEIGHTS: Record<string, number> = {
  "Жим лёжа": 40,
  "Жим стоя": 25,
  "Жим гантелей под наклоном": 12,
  "Махи в стороны": 5,
  "Разгибание рук на блоке": 15,
  "Становая тяга": 70,
  "Тяга штанги в наклоне": 40,
  "Тяга к лицу": 12,
  "Сгибания рук со штангой": 20,
  "Приседания со штангой": 50,
  "Румынская тяга": 40,
  "Жим ногами": 80,
  "Выпады в ходьбе": 10,
  "Подъёмы на носки": 30,
  "Тяга верхнего блока": 40,
  "Тяга горизонтального блока": 40,
  "Гоблет-приседания": 12,
  "Махи гирей": 16,
  "Степ-ап с весом": 10,
  // Замены по инвентарю
  "Тяга гантели в наклоне": 18,
  "Французский жим с гантелью": 8,
  "Разведение гантелей в наклоне": 6,
  "Сгибания с гантелями": 8,
};

/** Упражнения на ноги и заднюю цепь — у женщин соотношение к справочному
 *  весу выше, чем для верхней части тела. */
const LOWER_BODY_NAMES = new Set([
  "Приседания со штангой",
  "Становая тяга",
  "Румынская тяга",
  "Жим ногами",
  "Выпады в ходьбе",
  "Подъёмы на носки",
  "Гоблет-приседания",
  "Степ-ап с весом",
  "Махи гирей",
  "Ягодичный мостик",
]);

/** Округляет вес до ближайших 2.5 кг (под «блины»). Минимум — `minKg`:
 *  2.5 кг по умолчанию; для штанговых упражнений — вес грифа 20 кг
 *  (пустой гриф — минимально возможная нагрузка на штанге). */
function roundToPlate(kg: number, minKg = 2.5): number {
  return Math.max(minKg, Math.round(kg / 2.5) * 2.5);
}

/** Минимальный вес упражнения: для штанги — вес грифа (общий вес снаряда
 *  не может быть меньше пустого грифа), для остальных — 2.5 кг. */
function minWeightFor(exerciseName: string): number {
  return isBarbellExercise(exerciseName) ? BARBELL_BAR_WEIGHT_KG : 2.5;
}

/** Считает стартовый рабочий вес упражнения под профиль:
 *  женщины — ниже (на ноги разница меньше), возраст 50+ — −20%,
 *  новички — −35% (техника важнее веса), собственный вес — поправка
 *  относительно эталонных 75 кг (ограничена 0.7–1.3).
 *  Штанговые упражнения не опускаются ниже веса грифа (20 кг). */
function computeStartWeight(
  exercise: Exercise,
  profile: TrainingProfile,
): number | undefined {
  const reference = REFERENCE_WEIGHTS[exercise.name];
  if (reference === undefined) return undefined; // собственный вес / кардио

  let factor = 1;
  if (profile.gender === "female") {
    factor *= LOWER_BODY_NAMES.has(exercise.name) ? 0.75 : 0.6;
  }
  if (profile.experienceLevel === "beginner") factor *= 0.65;
  if (profile.age >= 50) factor *= 0.8;
  factor *= Math.min(1.3, Math.max(0.7, profile.weightKg / 75));

  return roundToPlate(reference * factor, minWeightFor(exercise.name));
}

/** Темп выполнения по цели: «эксцентрика-пауза-концентрика», секунды.
 *  Только для отягощённых упражнений (у собственного веса/кардио нет темпа). */
const TEMPO_BY_GOAL: Record<FitnessGoal, string> = {
  gain_muscle: "3-1-1",
  lose_weight: "2-1-1",
  maintain: "2-1-2",
  improve_endurance: "2-0-1",
};

/** Собирает разминку дня под профиль: базовое кардио + суставная гимнастика +
 *  активация под пол, возраст и ограничения. */
function buildWarmup(
  profile: TrainingProfile,
  ctx: { female: boolean; senior: boolean; mid: boolean },
  limitations: Limitation[],
): string[] {
  const lines: string[] = [
    "5–7 мин лёгкого кардио (ходьба, велосипед, эллипс)",
    "Суставная разминка: вращения плеч, таза, коленей",
  ];
  if (ctx.female) {
    lines.push("Активация ягодиц: ягодичный мостик 2×12");
  }
  if (ctx.mid) {
    lines.push("Подвижность: планка 2×20–30 с, глубокий присед с опорой");
  }
  if (ctx.senior) {
    lines.push("Удлинённая разминка: 8–10 мин, темп плавный");
  }
  if (limitations.includes("lower_back")) {
    lines.push("Поясница: птица-собака 2×10, ягодичный мостик 2×12");
  }
  if (limitations.includes("knees")) {
    lines.push("Колени: приседания без веса 2×10, ходьба на месте");
  }
  if (limitations.includes("shoulders")) {
    lines.push("Плечи: вращения рук, тяга к лицу лёгкой резинкой 2×15");
  }
  return lines;
}

/** Собирает пункты «как считается этот план» — короткие объяснения решений. */
function buildHowCalculated(
  profile: TrainingProfile,
  ctx: {
    build: BodyBuild;
    heavy: boolean;
    bmi: number;
    female: boolean;
    senior: boolean;
    mid: boolean;
    underweight: boolean;
  },
  limitations: Limitation[],
  sessions: number,
): string[] {
  const bullets: string[] = [];

  if (profile.heightCm >= 185) {
    bullets.push(
      `При росте ${profile.heightCm} см длинные рычаги нагружают суставы — тяги и приседания со штангой заменены на безопасные варианты (румынская тяга, гоблет-приседания).`,
    );
  }
  if (ctx.heavy) {
    bullets.push(
      `ИМТ ${ctx.bmi.toFixed(1)} выше 27 — упор на низкоударные и тренажёрные упражнения, прыжки исключены.`,
    );
  }
  if (ctx.underweight) {
    bullets.push(
      `ИМТ ${ctx.bmi.toFixed(1)} ниже 18.5 — фокус на гипертрофию: умеренный объём, полное восстановление, прогрессивная перегрузка.`,
    );
  }
  if (ctx.female) {
    bullets.push(
      "Акцент на заднюю цепь (ягодицы, бицепс бедра) и кор — приоритетные упражнения отмечены бейджем «приоритет».",
    );
  }
  if (profile.age < 30) {
    bullets.push(
      "Возраст до 30 — допускается высокий объём и частота тренировок.",
    );
  } else if (profile.age <= 50) {
    bullets.push(
      "Возраст 30–50 — умеренный объём, обязательная разминка и подвижность.",
    );
  } else {
    bullets.push(
      "Возраст 50+ — щадящий режим: больше отдыха (+30 с), без осевой и ударной нагрузки.",
    );
  }
  if (limitations.length > 0) {
    bullets.push(
      `Учтены ограничения: ${limitations.map((l) => LIMITATION_LABELS[l].toLowerCase()).join(", ")} — рискованные движения заменены на безопасные аналоги.`,
    );
  }

  const goalBullets: Record<FitnessGoal, string> = {
    gain_muscle:
      "Цель «набор массы»: 3–4 подхода × 6–12 повторов, темп 3-1-1, отдых 90–120 с на базовых упражнениях.",
    lose_weight:
      "Цель «похудение»: силовые + метаболические круги, 8–15 повторов, отдых 60–90 с.",
    maintain:
      "Цель «поддержание»: сбалансированные тренировки на всё тело, сила + мобильность.",
    improve_endurance:
      "Цель «выносливость»: круги с собственным весом, 12–20 повторов, короткий отдых 30–45 с.",
  };
  bullets.push(goalBullets[profile.fitnessGoal]);

  bullets.push(
    `Тренировок в неделю: ${sessions}${profile.preferredTrainingDays ? " (по вашему выбору)" : ""} — выбрана схема «${buildSessionPool(profile.fitnessGoal, profile.experienceLevel).splitType}».`,
  );
  bullets.push(
    "Прогрессия: +2.5 кг или +1–2 повтора, когда дойдёте до верхней границы диапазона. Цикл: база → +1 повтор → +2.5 кг → разгрузка.",
  );

  return bullets.slice(0, 8);
}

/** Строит сводку «под кого собран план»: пол, возраст, рост/вес, активность,
 *  цель, целевой вес, инвентарь, ограничения и количество замен. */
function buildAdaptedFor(
  profile: TrainingProfile,
  substitutions: number,
  limitations: Limitation[],
): string {
  const parts: string[] = [];

  parts.push(
    `${GENDER_LABELS[profile.gender].toLowerCase()}, ${profile.age} лет, ` +
      `${profile.heightCm} см / ${profile.weightKg} кг`,
  );

  if (profile.fitnessGoal === "lose_weight") {
    parts.push("фокус на жиросжигание с сохранением мышц");
  } else if (profile.fitnessGoal === "gain_muscle") {
    parts.push("фокус на набор мышечной массы");
  } else if (profile.fitnessGoal === "improve_endurance") {
    parts.push("фокус на выносливость и работоспособность");
  } else {
    parts.push("поддержание формы");
  }

  const activity =
    profile.activityLevel === "sedentary"
      ? "низкая повседневная активность"
      : ACTIVITY_LABELS[profile.activityLevel].toLowerCase();
  parts.push(`активность: ${activity}`);

  if (profile.targetWeightKg) {
    const direction =
      profile.targetWeightKg < profile.weightKg
        ? "дефицит"
        : profile.targetWeightKg > profile.weightKg
          ? "профицит"
          : "удержание";
    parts.push(`цель: ${profile

[FILE_TOO_LARGE]: The combined read_files output exceeded the 100 000 character hard limit. This file was truncated after 33 619 characters. Read it separately or use code_search for the relevant section.