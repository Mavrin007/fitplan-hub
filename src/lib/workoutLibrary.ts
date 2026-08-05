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
  TrainingStyle,
} from "./nutrition";
import {
  ACTIVITY_LABELS,
  EXPERIENCE_LABELS,
  GENDER_LABELS,
  LIMITATION_LABELS,
  TRAINING_STYLE_LABELS,
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
  /** Примерная длительность сессии в минутах (разминка + подходы + отдых). */
  approxMinutes?: number;
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
  trainingStyle?: TrainingStyle; // предпочтение стиля (power/hypertrophy/functional/balanced)
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
 *  варианты перечислены от «желательно» к «запасному» — первой выбирается
 *  подходящая по инвентарю замена, которой ещё нет в этом дне (дедупликация).
 *  Для каждого отягощённого движения есть минимум один вариант на собственный
 *  вес, чтобы план оставался выполнимым даже с минимальным инвентарём. */
const EQUIPMENT_ALTERNATIVES: Record<
  string,
  { name: string; equipment: Equipment[] }[]
> = {
  "Становая тяга": [
    { name: "Румынская тяга", equipment: ["barbell", "dumbbell"] },
    { name: "Ягодичный мостик", equipment: ["bodyweight"] },
  ],
  "Румынская тяга": [
    { name: "Ягодичный мостик", equipment: ["bodyweight"] },
  ],
  "Приседания со штангой": [
    { name: "Гоблет-приседания", equipment: ["dumbbell", "bodyweight"] },
    { name: "Приседания", equipment: ["bodyweight"] },
  ],
  "Жим лёжа": [
    { name: "Отжимания", equipment: ["bodyweight"] },
  ],
  "Жим стоя": [
    { name: "Жим гантелей под наклоном", equipment: ["dumbbell"] },
    { name: "Отжимания", equipment: ["bodyweight"] },
  ],
  "Жим гантелей под наклоном": [
    { name: "Отжимания", equipment: ["bodyweight"] },
  ],
  "Махи в стороны": [
    { name: "Отжимания", equipment: ["bodyweight"] },
  ],
  "Разгибание рук на блоке": [
    { name: "Французский жим с гантелью", equipment: ["dumbbell"] },
    { name: "Отжимания", equipment: ["bodyweight"] },
  ],
  "Подтягивания": [
    { name: "Тяга верхнего блока", equipment: ["machine", "cable"] },
    { name: "Тяга гантели в наклоне", equipment: ["dumbbell"] },
  ],
  "Тяга штанги в наклоне": [
    { name: "Тяга гантели в наклоне", equipment: ["dumbbell"] },
    { name: "Тяга горизонтального блока", equipment: ["machine", "cable"] },
    { name: "Подтягивания", equipment: ["bodyweight"] },
  ],
  "Тяга к лицу": [
    { name: "Разведение гантелей в наклоне", equipment: ["dumbbell"] },
    { name: "Птица-собака", equipment: ["bodyweight"] },
  ],
  "Сгибания рук со штангой": [
    { name: "Сгибания с гантелями", equipment: ["dumbbell"] },
    { name: "Подтягивания", equipment: ["bodyweight"] },
  ],
  "Жим ногами": [
    { name: "Гоблет-приседания", equipment: ["dumbbell", "bodyweight"] },
    { name: "Приседания", equipment: ["bodyweight"] },
  ],
  "Махи гирей": [
    { name: "Ягодичный мостик", equipment: ["bodyweight"] },
  ],
  "Тяга верхнего блока": [
    { name: "Подтягивания", equipment: ["bodyweight"] },
    { name: "Тяга гантели в наклоне", equipment: ["dumbbell"] },
  ],
  "Тяга горизонтального блока": [
    { name: "Тяга гантели в наклоне", equipment: ["dumbbell"] },
    { name: "Подтягивания", equipment: ["bodyweight"] },
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
    heavy: {
      alternative: "Марш с подъёмом коленей",
      reason: "высокоударная связка с лишним весом избыточна — марш безопаснее",
    },
  },
  "Спринт-интервалы": {
    heavy: {
      alternative: "Ходьба / бег",
      reason: "спринты с лишним весом перегружают суставы — ровный темп безопаснее",
    },
    senior: {
      alternative: "Ходьба / бег",
      reason: "спринты с возрастом травмоопасны — ровный темп безопаснее",
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
  "Сгибания с гантелями": {
    short: { priority: true, reason: "короткие руки — компактная амплитуда" },
  },
  "Махи в стороны": {
    tall: { priority: true, reason: "изолирует средние дельты при длинных рычагах" },
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
    "Приседания": {
      alternative: "Степ-ап с весом",
      reason: "без глубоких приседаний — контролируемая амплитуда для коленей",
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
    "Жим лёжа": {
      alternative: "Отжимания",
      reason: "широкий жим лёжа перегружает плечи — отжимания щадят суставы",
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

/** Плечи и руки — четвёртый день для тех, кто тренируется 4+ раз в неделю.
 *  Даёт полноценный 4-дневный сплит «Жим/Тяга/Ноги/Плечи и руки» вместо
 *  повторяющегося жимового дня, когда фокусы кончаются раньше недели. */
const ARMS = [
  ex("Жим гантелей под наклоном", 3, "10–12", 90),
  ex("Махи в стороны", 3, "12–15", 60),
  ex("Разгибание рук на блоке", 3, "10–12", 60),
  ex("Сгибания с гантелями", 3, "10–12", 60),
  ex("Тяга к лицу", 3, "12–15", 60),
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

/* Силовой пул (цель «Сила»): базовые движения, 3–6 повторов,
 * длинный отдых 2–4 мин — прогрессия весов в приоритете. */
const STRENGTH_PUSH = [
  ex("Жим лёжа", 5, "5", 180),
  ex("Жим стоя", 4, "5", 150),
  ex("Махи в стороны", 3, "10–12", 60),
  ex("Разгибание рук на блоке", 3, "8–10", 60),
];

const STRENGTH_PULL = [
  ex("Становая тяга", 5, "3–5", 240),
  ex("Подтягивания", 4, "5", 180),
  ex("Тяга штанги в наклоне", 4, "5", 150),
  ex("Тяга к лицу", 3, "12–15", 60),
];

const STRENGTH_LEGS = [
  ex("Приседания со штангой", 5, "5", 240),
  ex("Румынская тяга", 4, "6", 180),
  ex("Жим ногами", 3, "8", 120),
  ex("Подъёмы на носки", 4, "12–15", 45),
];

const STRENGTH_FULLBODY_A = [
  ex("Приседания со штангой", 3, "6", 180),
  ex("Жим лёжа", 3, "6", 150),
  ex("Тяга штанги в наклоне", 3, "6", 150),
  ex("Жим стоя", 2, "8", 90),
  ex("Планка", 3, "30–45с", 45),
];

const STRENGTH_FULLBODY_B = [
  ex("Становая тяга", 3, "5", 240),
  ex("Жим гантелей под наклоном", 3, "6–8", 120),
  ex("Гоблет-приседания", 3, "8", 120),
  ex("Подтягивания", 3, "6", 150),
  ex("Скручивания «велосипед»", 3, "15", 45),
];

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
  if (goal === "strength") {
    if (experience === "beginner") {
      return {
        splitType: "Силовой фулбоди",
        pool: [
          { name: "Силовой фулбоди A", exercises: STRENGTH_FULLBODY_A },
          { name: "Силовой фулбоди B", exercises: STRENGTH_FULLBODY_B },
        ],
      };
    }
    return {
      splitType: "Силовой сплит",
      pool: [
        { name: "Силовые ноги", exercises: STRENGTH_LEGS },
        { name: "Силовой жим", exercises: STRENGTH_PUSH },
        { name: "Силовая тяга", exercises: STRENGTH_PULL },
      ],
    };
  }
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
        // 4+ тренировок: полноценный сплит вместо повторов жимового дня.
        { name: "Плечи и руки", exercises: ARMS },
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
  if (goal === "strength")
    return experience === "beginner" ? 3 : 4;
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
 *  подходами/повторами), а причины попадают в заметки дня. Из нескольких
 *  подходящих замен предпочитается та, которой ещё нет в этом дне — чтобы
 *  несколько упражнений не превращались в одинаковые строки.
 *  У каждого отягощённого движения есть вариант на собственный вес, поэтому
 *  план остаётся выполнимым даже с минимальным инвентарём. */
function adaptForEquipment(
  day: WorkoutDay,
  available: Set<Equipment>,
): { day: WorkoutDay; notes: string[] } {
  // Инвентарь не выбран — считаем, что есть всё (полный зал по умолчанию).
  if (available.size === 0) return { day, notes: [] };

  const notes: string[] = [];
  const used = new Set<string>(); // финальные имена уже обработанных упражнений
  const exercises = day.exercises.map((exercise) => {
    const required = EXERCISE_EQUIPMENT[exercise.name];
    if (!required || required.some((e) => available.has(e))) {
      used.add(exercise.name);
      return exercise; // подходит для доступного инвентаря
    }
    const options = EQUIPMENT_ALTERNATIVES[exercise.name] ?? [];
    const fitting = options.filter((o) =>
      o.equipment.some((e) => available.has(e)),
    );
    // Сначала — подходящая замена, которой нет в этом дне; если таких нет —
    // берём первую подходящую (повтор допустим, но лучше, чем невозможный
    // снаряд).
    const alt = fitting.find((o) => !used.has(o.name)) ?? fitting[0];
    if (!alt) {
      used.add(exercise.name);
      return exercise; // нет подходящей замены — оставляем как есть
    }

    used.add(alt.name);
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
  // Медленная эксцентрика, пауза, взрывная концентрика — классика силы.
  strength: "3-0-2",
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
  splitType: string,
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

  const equipment = normalizeEquipment(profile.equipment);
  if (equipment.length > 0 && equipment.every((e) => e === "bodyweight")) {
    bullets.push(
      "Инвентарь: только собственный вес — сплит переключён на фулбоди/круги, отягощения заменены на упражнения с весом тела.",
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
    strength:
      "Цель «сила»: базовые движения, 3–6 повторов, отдых 2–4 мин, прогрессия рабочих весов — в приоритете.",
  };
  bullets.push(goalBullets[profile.fitnessGoal]);

  const style = profile.trainingStyle ?? "balanced";
  const styleBullets: Partial<Record<TrainingStyle, string>> = {
    power: "Стиль «силовой»: повторы сдвинуты вниз (3–6), отдых увеличен — база на максимуме силы.",
    hypertrophy:
      "Стиль «объёмный»: повторы сдвинуты вверх (10–15), отдых сокращён — больше работы на мышцу.",
    functional:
      "Стиль «функциональный»: короткий отдых 30–45 с, комбинированная нагрузка.",
  };
  // Дефолтный стиль не объясняем — это и есть «классический» план.
  const styleBullet = styleBullets[style];
  if (styleBullet) bullets.push(styleBullet);

  bullets.push(
    `Тренировок в неделю: ${sessions}${profile.preferredTrainingDays ? " (по вашему выбору)" : ""} — выбрана схема «${splitType}».`,
  );
  bullets.push(
    "Прогрессия: +2.5 кг или +1–2 повтора, когда дойдёте до верхней границы диапазона. Цикл: база → +1 повтор → +2.5 кг → разгрузка.",
  );

  return bullets.slice(0, 8);
}

/** Строит сводку «под кого собран план»: пол, возраст, рост/вес, активность,
 *  цель, целевой вес, инвентарь, ограничения и количество замен.
 *  `hasWeighted`/`hasBarbell` — реальное наличие отягощений в финальном плане:
 *  для планов на собственном весе не пишем «стартовые веса рассчитаны» и
 *  «штанга — общий вес с грифом». */
function buildAdaptedFor(
  profile: TrainingProfile,
  substitutions: number,
  limitations: Limitation[],
  hasWeighted: boolean,
  hasBarbell: boolean,
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
  } else if (profile.fitnessGoal === "strength") {
    parts.push("фокус на силовые показатели");
  } else {
    parts.push("поддержание формы");
  }

  if (profile.trainingStyle && profile.trainingStyle !== "balanced") {
    parts.push(
      `стиль: ${TRAINING_STYLE_LABELS[profile.trainingStyle].toLowerCase()}`,
    );
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
    parts.push(`цель: ${profile.targetWeightKg} кг (${direction})`);
  }

  if (hasWeighted) parts.push("стартовые веса рассчитаны по профилю");
  // Штанговые упражнения: вес указан общим (гриф 20 кг включён).
  if (hasBarbell) parts.push("штанга — общий вес с грифом 20 кг");
  if (profile.age >= 50) parts.push("щадящий режим с возрастом (+30 с отдыха)");
  if (limitations.length > 0) {
    parts.push(
      `учтены ограничения: ${limitations.map((l) => LIMITATION_LABELS[l].toLowerCase()).join(", ")}`,
    );
  }
  if (substitutions > 0) parts.push(`${substitutions} замен под профиль`);

  const equipment = normalizeEquipment(profile.equipment);
  parts.push(
    equipment.length > 0
      ? `инвентарь: ${equipmentSummary(profile.equipment)}`
      : "инвентарь не выбран (полный зал)",
  );

  return parts.join(" · ");
}

/** Генерирует план тренировок с учётом полного профиля (пол, возраст, рост,
 *  вес, активность, цель, опыт, инвентарь, ограничения, предпочитаемые дни):
 *  заменяет рискованные для пользователя упражнения и те, что не подходят под
 *  доступное оборудование, помечает приоритетные, назначает стартовые рабочие
 *  веса и темп, добавляет разминку и объясняет изменения в заметках. */
/** Распределяет фокусы пула по числу тренировок в неделю:
 *  - если тренировок не больше фокусов — берём первые `sessions` (для
 *    «Жим/Тяга/Ноги/Плечи и руки» 3 дня = без плечевого дня);
 *  - иначе каждый фокус получает `floor(sessions/n)` дней по кругу, а
 *    остаток раздаётся с конца пула — «Ноги» и «Плечи и руки» получают
 *    второй день раньше, чем «Жимовая». Соседние дни никогда не
 *    дублируются (старт остатка сдвигается от последнего фокуса круга). */
function distributeSessions(pool: SessionSeed[], sessions: number): SessionSeed[] {
  const n = pool.length;
  if (sessions <= n) return pool.slice(0, sessions);

  const base = Math.floor(sessions / n);
  const extra = sessions % n;
  const out: SessionSeed[] = [];
  for (let r = 0; r < base; r++) {
    for (let i = 0; i < n; i++) out.push(pool[i]);
  }
  // Остаток: с конца пула, но не совпадающий с последним фокусом круга.
  const last = out[out.length - 1].name;
  let start = n - 1;
  if (pool[start].name === last) start = n - 2;
  for (let i = 0; i < extra; i++) {
    out.push(pool[(start - i + n) % n]);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Предпочтение стиля тренировок                                        */
/* ------------------------------------------------------------------ */

/** Сдвиг повторов/отдыха по выбранному стилю: power — низкие повторы и
 *  длинный отдых, hypertrophy — объём и короткий отдых, functional —
 *  минимальный отдых, balanced — без изменений. */
const STYLE_RULES: Record<
  TrainingStyle,
  { repsDelta: number; restDelta: number; restMin: number }
> = {
  power: { repsDelta: -2, restDelta: 30, restMin: 90 },
  hypertrophy: { repsDelta: 2, restDelta: -15, restMin: 45 },
  functional: { repsDelta: 1, restDelta: -15, restMin: 30 },
  balanced: { repsDelta: 0, restDelta: 0, restMin: 0 },
};

/** Сдвигает диапазон повторов на delta с защитой от вырождения:
 *  «6–8» → «4–6», одиночное «5» → «3–5» (delta<0) или «5–7» (delta>0),
 *  минимум 3 повтора. Тайминги («30с») не трогаем. */
function shiftStyleReps(reps: string, delta: number): string {
  if (delta === 0) return reps;
  const range = reps.match(/^(\d+)\s*[–—-]\s*(\d+)(.*)$/);
  if (range) {
    const lo = Math.max(3, parseInt(range[1], 10) + delta);
    const hi = Math.max(lo, parseInt(range[2], 10) + delta);
    return `${lo}–${hi}${range[3]}`;
  }
  const single = reps.match(/^(\d+)(.*)$/);
  if (single) {
    const n = parseInt(single[1], 10);
    const shifted = Math.max(3, n + delta);
    return delta > 0
      ? `${n}–${shifted}${single[2]}`
      : `${shifted}–${n}${single[2]}`;
  }
  return reps;
}

/** Применяет предпочтение стиля к упражнению: сдвиг повторов и отдыха.
 *  Тайминги («30с») и кардио («30–40 мин») не трогаем — отдых там зашит
 *  в строку или не применим (повторы «мин» нельзя сдвигать по стилю). */
function applyTrainingStyle(exercise: Exercise, style: TrainingStyle): Exercise {
  const rule = STYLE_RULES[style];
  if (rule.repsDelta === 0 && rule.restDelta === 0) return exercise;
  const kind = classifyExercise(exercise);
  if (kind === "timed" || kind === "cardio") return exercise;
  return {
    ...exercise,
    reps: shiftStyleReps(exercise.reps, rule.repsDelta),
    restSeconds: Math.max(
      rule.restMin,
      exercise.restSeconds + rule.restDelta,
    ),
  };
}

/** Есть ли в пуле хоть одно упражнение, требующее снаряда (не только
 *  собственный вес)? По этому признаку решаем, переключать ли сплит для
 *  пользователей без инвентаря. */
function poolNeedsEquipment(pool: SessionSeed[]): boolean {
  return pool.some((s) =>
    s.exercises.some(
      (ex) =>
        !(EXERCISE_EQUIPMENT[ex.name]?.length === 1 &&
          EXERCISE_EQUIPMENT[ex.name][0] === "bodyweight"),
    ),
  );
}

export function generateWorkoutTemplate(
  profile: TrainingProfile,
): WorkoutTemplate {
  const equipmentOnly = normalizeEquipment(profile.equipment);
  // У пользователя ТОЛЬКО собственный вес (без гантелей/штанги/тренажёров).
  const bodyweightOnly =
    equipmentOnly.length > 0 && equipmentOnly.every((e) => e === "bodyweight");

  let { splitType, pool } = buildSessionPool(
    profile.fitnessGoal,
    profile.experienceLevel,
  );
  // Без инвентаря тренажёрный сплит («Жим/Тяга/Ноги», «Верх/Низ») выродился
  // бы в несколько одинаковых отжиманий. Переключаемся на фулбоди/круги,
  // которые почти целиком адаптируются под собственный вес.
  if (bodyweightOnly && poolNeedsEquipment(pool)) {
    const bw = buildSessionPool(profile.fitnessGoal, "beginner");
    splitType = `${bw.splitType} · без инвентаря`;
    pool = bw.pool;
  }
  const sessions = Math.min(
    6,
    Math.max(
      1,
      profile.preferredTrainingDays ??
        defaultSessions(profile.fitnessGoal, profile.experienceLevel),
    ),
  );
  const name = `${splitType} — ${EXPERIENCE_LABELS[profile.experienceLevel].toLowerCase()}`;

  // Сессии для недели: фокусы пула без соседних повторов, дополнительные
  // дни отдаются «Ногам» и «Плечам и рукам» (конец пула), а не жимовому дню.
  const order = distributeSessions(pool, sessions);
  const baseDays: WorkoutDay[] = order.map((seed, i) => {
    const day = sessions === 1 ? 1 : Math.min(6, Math.floor((i * 7) / sessions));
    return { day, focus: seed.name, exercises: seed.exercises };
  });

  const base: WorkoutTemplate = {
    name,
    splitType,
    sessionsPerWeek: sessions,
    durationWeeks: PLAN_WEEKS,
    days: baseDays,
  };

  if (profile.heightCm <= 0 || profile.weightKg <= 0) {
    return {
      ...base,
      howCalculated: buildHowCalculated(
        profile,
        {
          build: "average",
          heavy: false,
          bmi: 0,
          female: profile.gender === "female",
          senior: profile.age >= 50,
          mid: profile.age > 30 && profile.age < 50,
          underweight: false,
        },
        normalizeLimitations(profile.limitations),
        sessions,
        splitType,
      ),
    };
  }

  const { build, heavy, bmi } = classifyProfile(profile);
  const limitations = normalizeLimitations(profile.limitations);
  const ctx = {
    build,
    heavy,
    bmi,
    female: profile.gender === "female",
    senior: profile.age >= 50,
    mid: profile.age > 30 && profile.age < 50,
    underweight: bmi < 18.5,
  };
  const availableEquipment = new Set(normalizeEquipment(profile.equipment));

  let substitutions = 0;
  const days = baseDays.map((d) => {
    // Сначала антропометрия, потом ограничения, потом инвентарь — замены
    // применяются к итоговым именам.
    const anthrop = adaptDay(d, ctx);
    const injured = adaptForInjuries(anthrop.day, limitations);
    const equipped = adaptForEquipment(injured.day, availableEquipment);
    substitutions += injured.notes.length + equipped.notes.length;
    const notes = [...anthrop.notes, ...injured.notes, ...equipped.notes];

    const withWeights: WorkoutDay = {
      ...equipped.day,
      warmup: buildWarmup(profile, ctx, limitations),
      exercises: equipped.day.exercises.map((exercise) => {
        // Стиль тренировок (повторы/отдых) применяется после замен —
        // к итоговым именам упражнений.
        const styled = applyTrainingStyle(
          exercise,
          profile.trainingStyle ?? "balanced",
        );
        return {
          ...styled,
          weightKg: computeStartWeight(styled, profile),
          // Темп только для отягощённых упражнений.
          tempo: REFERENCE_WEIGHTS[styled.name] !== undefined
            ? TEMPO_BY_GOAL[profile.fitnessGoal]
            : undefined,
        };
      }),
    };
    const withMinutes: WorkoutDay = {
      ...withWeights,
      approxMinutes: estimateSessionMinutes(withWeights),
    };
    return notes.length > 0 ? { ...withMinutes, notes } : withMinutes;
  });

  const finalExercises = days.flatMap((d) => d.exercises);
  const hasWeighted = finalExercises.some((e) => e.weightKg !== undefined);
  const hasBarbell = finalExercises.some((e) => isBarbellExercise(e.name));

  return {
    name,
    adaptedFor: buildAdaptedFor(
      profile,
      substitutions,
      limitations,
      hasWeighted,
      hasBarbell,
    ),
    splitType,
    sessionsPerWeek: sessions,
    durationWeeks: PLAN_WEEKS,
    howCalculated: buildHowCalculated(profile, ctx, limitations, sessions, splitType),
    days,
  };
}

/** Слепок профиля — по нему определяется, устарел ли сохранённый план. */
export function profileSignature(profile: TrainingProfile): string {
  return [
    profile.gender,
    profile.age,
    profile.heightCm,
    profile.weightKg,
    profile.targetWeightKg ?? 0,
    profile.activityLevel,
    profile.fitnessGoal,
    profile.experienceLevel,
    normalizeEquipment(profile.equipment).slice().sort().join(","),
    normalizeLimitations(profile.limitations).slice().sort().join(","),
    profile.preferredTrainingDays ?? "",
    profile.trainingStyle ?? "",
  ].join("|");
}

/* ------------------------------------------------------------------ */
/* Техника выполнения и разминка                                       */
/* ------------------------------------------------------------------ */

/** Короткие подсказки по технике для каждого упражнения каталога и замен. */
export const EXERCISE_TIPS: Record<string, string> = {
  "Жим лёжа": "Лопатки сведены, стопы в пол. Опускайте штангу до касания груди, локти под углом ~45° — не растаскивайте их в стороны.",
  "Жим стоя": "Корпус напряжён, ягодицы сжаты, не прогибайтесь в пояснице. Штанга движется вертикально вдоль лица.",
  "Жим гантелей под наклоном": "Спина прижата к скамье. Опускайте гантели до уровня груди, не сводя локти внутрь.",
  "Махи в стороны": "Локти чуть согнуты, поднимайте гантели до уровня плеч. Без рывков корпусом — вес не должен «летать».",
  "Разгибание рук на блоке": "Локти прижаты к корпусу. Разгибайте руки до конца, не наклоняясь вперёд всем телом.",
  "Становая тяга": "Спина прямая, штанга скользит по ногам. Подъём начинайте ногами, вверху не отклоняйтесь назад.",
  "Подтягивания": "Не раскачивайтесь. Подтягивайтесь до подбородка над перекладиной, опускайтесь полностью — без «половинок».",
  "Тяга штанги в наклоне": "Корпус в наклоне ~45°, спина прямая. Тяните штангу к животу, локти вдоль корпуса.",
  "Тяга к лицу": "Тяните трос к лицу, разводя локти в стороны и сводя лопатки. Работают задние дельты, а не бицепс.",
  "Сгибания рук со штангой": "Локти прижаты к корпусу, без раскачивания. Поднимайте штангу до конца, опускайте медленно.",
  "Приседания со штангой": "Стопы на ширине плеч, колени в сторону носков. Грудь вперёд, приседайте до параллели бедра полу.",
  "Румынская тяга": "Спина прямая, лёгкий сгиб в коленях. Опускайте штангу вдоль ног до натяжения задней поверхности бедра.",
  "Жим ногами": "Спина и таз прижаты к сиденью. Не выпрямляйте колени до щелчка — оставляйте лёгкий сгиб вверху.",
  "Выпады в ходьбе": "Шаг шире обычного, корпус вертикально. Колено задней ноги почти касается пола, отталкивайтесь пяткой.",
  "Подъёмы на носки": "Медленно вниз до растяжения икры, резко вверх с паузой на секунду. Полная амплитуда обязательна.",
  "Тяга верхнего блока": "Тяните к верху груди, а не за голову. Локти вниз, лопатки сводите в конечной точке.",
  "Тяга горизонтального блока": "Спина прямая, не раскачивайтесь. Тяните рукоять к животу, сводя лопатки.",
  "Гоблет-приседания": "Гантель у груди, локти вниз. Приседайте глубоко, держите пятки на полу и спину прямой.",
  "Махи гирей": "Движение от таза, а не от рук: резкий толчок бёдрами вперёд, гиря летит до уровня груди.",
  "Степ-ап с весом": "Полная стопа на платформе. Подъём за счёт ноги на платформе, без отталкивания задней ногой.",
  "Запрыгивания на тумбу": "Приземляйтесь мягко на полную стопу, колени слегка согнуты. Начинайте с невысокой тумбы.",
  "Приседания": "Вес на пятки, колени в сторону носков. Спина прямая, глубина комфортная, без округления поясницы.",
  "Отжимания": "Корпус — прямая линия от головы до пяток. Опускайтесь, пока грудь не коснётся пола, без прогиба в пояснице.",
  "Планка": "Прямая линия тела, пресс и ягодицы напряжены. Не проваливайте поясницу и не поднимайте таз.",
  "Скалолаз": "Плечи над ладонями, корпус в планке. Поочерёдно подтягивайте колени к груди в быстром темпе.",
  "Приседания без веса": "Вес на пятки, спина прямая. Приседайте до комфортной глубины, колени не заваливайте внутрь.",
  "Подъём коленей в висе": "Не раскачивайтесь. Поднимайте колени до уровня таза, опускайте медленно, без рывков.",
  "Скручивания «велосипед»": "Поясница прижата к полу. Вращайте корпус, подтягивая локоть к противоположному колену.",
  "Джампинг-джек": "Мягкое приземление на переднюю часть стопы. Руки и ноги движутся синхронно, темп средний.",
  "Бёрпи": "Из упора лёжа подтяните ноги прыжком, затем выпрыгните вверх. Держите спину прямой в упоре.",
  "Марш с подъёмом коленей": "Колени поднимайте до уровня таза, спина прямая. Работайте руками в такт.",
  "Ходьба / бег": "Держите ровный темп, в котором можете говорить. Шаг лёгкий, приземление на середину стопы.",
  "Спринт-интервалы": "20 секунд максимального ускорения, затем полное восстановление. Не форсируйте старт — разогрейтесь.",
  "Птица-собака": "Стоя на четвереньках, вытяните противоположные руку и ногу. Спина прямая, не прогибайтесь.",
  "Тяга гантели в наклоне": "Опора на скамью или колено. Спина параллельна полу, тяните гантель к поясу, локти вдоль корпуса.",
  "Французский жим с гантелью": "Локти смотрят вверх и не расходятся. Опускайте гантель за голову, разгибайте руки до конца.",
  "Разведение гантелей в наклоне": "Корпус в наклоне, спина прямая. Разводите гантели в стороны, сводя лопатки вверху.",
  "Сгибания с гантелями": "Локти прижаты к корпусу, без раскачивания. Поднимайте до конца, опускайте медленно.",
  "Ягодичный мостик": "Стопы у таза, поднимайте таз до прямой линии тела. Вверху сожмите ягодицы на секунду.",
};

/** Разминочные подходы: нарастающий процент от рабочего веса. */
export interface WarmUpSet {
  weightKg: number;
  reps: string;
}

/** Строит разминочную лестницу от рабочего веса: 40% → 60% → 80%,
 *  округлённую до блинов по 2.5 кг. `minKg` — нижняя граница веса
 *  (для штанговых упражнений — вес грифа 20 кг: разминочный подход на
 *  штанге не может быть легче пустого грифа). Без веса (собственный
 *  вес/кардио) возвращает пустой список — разминка не нужна.
 *  При малых весах несколько ступеней могут округлиться к одному весу —
 *  повторы с одинаковым весом схлопываются в один подход (не показываем
 *  «20 кг × 8, 20 кг × 6, 20 кг × 4»). */
export function warmUpSets(
  weightKg: number | undefined,
  minKg = 0,
): WarmUpSet[] {
  if (weightKg === undefined || !Number.isFinite(weightKg) || weightKg <= 0) {
    return [];
  }
  const steps = [
    { factor: 0.4, reps: "8–10" },
    { factor: 0.6, reps: "6–8" },
    { factor: 0.8, reps: "4–6" },
  ];
  const unique: WarmUpSet[] = [];
  for (const step of steps) {
    const weight = Math.min(weightKg, roundToPlate(weightKg * step.factor, minKg));
    const last = unique[unique.length - 1];
    if (!last || last.weightKg !== weight) {
      unique.push({ weightKg: weight, reps: step.reps });
    }
  }
  return unique;
}

/* ------------------------------------------------------------------ */
/* Прогрессия нагрузки: 4-недельный цикл                               */
/* ------------------------------------------------------------------ */

type ExerciseKind = "weighted" | "bodyweight" | "timed" | "cardio";

function classifyExercise(ex: Exercise): ExerciseKind {
  if (ex.reps.includes("мин")) return "cardio";
  if (ex.reps.includes("с")) return "timed";
  if (BODYWEIGHT_NAMES.has(ex.name)) return "bodyweight";
  return "weighted";
}

/** Сдвигает диапазон повторений на delta: «6–8» → «7–9», «5» → «5–6»,
 *  «10–12 / нога» → «11–13 / нога». Строки без чисел возвращает как есть. */
function shiftReps(reps: string, delta: number): string {
  const range = reps.match(/^(\d+)\s*[–—-]\s*(\d+)(.*)$/);
  if (range) {
    return `${parseInt(range[1], 10) + delta}–${parseInt(range[2], 10) + delta}${range[3]}`;
  }
  const single = reps.match(/^(\d+)(.*)$/);
  if (single) {
    return `${parseInt(single[1], 10)}–${parseInt(single[1], 10) + delta}${single[2]}`;
  }
  return reps;
}

/** Сдвигает время/секунды: «30–45с» → «35–50с», «20с / 40с отдых» → «25с / 40с отдых». */
function shiftTime(reps: string, delta: number): string {
  const range = reps.match(/^(\d+)\s*[–—-]\s*(\d+)(.*)$/);
  if (range) {
    return `${parseInt(range[1], 10) + delta}–${parseInt(range[2], 10) + delta}${range[3]}`;
  }
  const single = reps.match(/^(\d+)(.*)$/);
  if (single) {
    return `${parseInt(single[1], 10) + delta}${single[2]}`;
  }
  return reps;
}

/** Рабочий вес упражнения на неделю цикла (индекс 0..3):
 *  база — стартовый, прогресс — тот же, пик — +2.5 кг, разгрузка — −20%.
 *  `minKg` ограничивает снижение: для штанги разгрузка не опускается ниже
 *  веса грифа (пустой гриф — минимальная нагрузка). */
function progressWeight(
  weightKg: number | undefined,
  weekIdx: number,
  minKg = 0,
): number | undefined {
  if (weightKg === undefined) return undefined;
  if (weekIdx === 0 || weekIdx === 1) return weightKg;
  if (weekIdx === 2) return roundToPlate(weightKg + 2.5, minKg);
  return roundToPlate(weightKg * 0.8, minKg);
}

/** Пересчитывает упражнение для конкретной недели цикла (индекс 0..3):
 *  Неделя 1 — база, Неделя 2 — те же веса +1 повтор (двойная прогрессия),
 *  Неделя 3 — +2.5 кг (для безвесовых — +1 подход), повторения к базе,
 *  Неделя 4 — разгрузка: −20% веса / −1 подход (штанга — не ниже грифа). */
function progressExercise(ex: Exercise, weekIdx: number): Exercise {
  const minKg = minWeightFor(ex.name);
  const weightKg = progressWeight(ex.weightKg, weekIdx, minKg);
  if (weekIdx === 0) return ex;

  const kind = classifyExercise(ex);

  // Неделя 2 — двойная прогрессия: та же нагрузка, больше повторений.
  if (weekIdx === 1) {
    if (kind === "weighted") {
      return {
        ...ex,
        weightKg,
        reps: shiftReps(ex.reps, 1),
        weightNote: "те же веса, +1 повтор",
      };
    }
    if (kind === "bodyweight") {
      return { ...ex, reps: shiftReps(ex.reps, 1), weightNote: "+1 повтор" };
    }
    if (kind === "timed") {
      return { ...ex, reps: shiftTime(ex.reps, 5), weightNote: "+5 секунд" };
    }
    return { ...ex, reps: shiftTime(ex.reps, 5), weightNote: "+5 минут" };
  }

  // Неделя 3 — пик: вес вверх, повторения к базе.
  if (weekIdx === 2) {
    if (kind === "weighted") {
      return { ...ex, weightKg, weightNote: "+2.5 кг" };
    }
    if (kind === "bodyweight" || kind === "timed") {
      return { ...ex, sets: ex.sets + 1, weightNote: "+1 подход" };
    }
    return { ...ex, reps: shiftTime(ex.reps, 10), weightNote: "+10 минут" };
  }

  // Неделя 4 — разгрузка: меньше объёма и веса, восстановление.
  if (kind === "cardio") {
    return { ...ex, weightNote: "−30% объёма" };
  }
  return {
    ...ex,
    weightKg,
    sets: Math.max(2, ex.sets - 1),
    weightNote: kind === "weighted" ? "−20% веса" : "лёгкий день",
  };
}

/** Раскладывает недельный шаблон на цикл прогрессии из `weeks` недель
 *  (по умолчанию 4): каждая неделя содержит те же дни, но с пересчитанными
 *  подходами/повторами и рабочими весами. */
export function applyProgression(
  template: WorkoutTemplate,
  weeks: number = PLAN_WEEKS,
): ProgressionWeek[] {
  return Array.from({ length: weeks }, (_, i) => {
    const phase = PROGRESSION_PHASES[i % PROGRESSION_PHASES.length];
    const days = template.days.map((day) => ({
      ...day,
      exercises: day.exercises.map((exercise) =>
        progressExercise(exercise, i),
      ),
    }));
    return {
      week: i + 1,
      label: `Неделя ${i + 1} · ${phase.label}`,
      weightNote: phase.hint,
      days,
    };
  });
}

/** Рабочие секунды одного подхода для `reps` (строки вида «6–8», «30с»,
 *  «20с / 40с отдых», «30–40 мин»). Для повторов — ~2.5 с на повтор,
 *  для секундных интервалов — само время работы, для минут — минуты. */
function workSecondsPerSet(reps: string): number {
  const nums = (reps.match(/\d+/g) ?? []).map(Number);
  const avg = nums.reduce((s, n) => s + n, 0) / Math.max(1, nums.length);
  if (reps.includes("мин")) return avg * 60;
  if (reps.includes("с")) return avg; // «30с» или «20с / 40с отдых» — работа = avg
  return avg * 2.5;
}

/** Примерная длительность тренировки в минутах: разминка + сумма подходов
 *  (работа + отдых). Показывает пользователю, сколько времени заложить. */
export function estimateSessionMinutes(day: WorkoutDay): number {
  const warmup = (day.warmup?.length ?? 0) > 0 ? 6 : 3;
  const training = day.exercises.reduce(
    (s, ex) => s + ex.sets * (workSecondsPerSet(ex.reps) + ex.restSeconds),
    0,
  );
  return Math.max(10, Math.round((warmup + training) / 60));
}

export const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
