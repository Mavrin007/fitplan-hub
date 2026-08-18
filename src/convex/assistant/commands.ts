/**
 * Типовая модель команд ассистента + строгая runtime-валидация ответа ИИ.
 *
 * Архитектурный принцип: ИИ выдаёт КОМАНДЫ (намерения), а не произвольные
 * данные для записи. В команде нет КБЖУ — питательная ценность вычисляется
 * сервером из проверенных источников (кураторская библиотека, свои продукты)
 * или явной логикой оценки (с пометкой ai_estimate). Это не позволяет модели
 * сделать калории/белки/жиры/углеводы authoritative.
 *
 * Валидация строгая: типы, диапазоны, длины, enums, границы массивов.
 * Поля calories/protein/carbs/fat в items ЗАПРЕЩЕНЫ (это попытка обойти
 * границу) — команда отклоняется целиком, БД не изменяется.
 */

/** Допустимые единицы количества для item команды logMeal. */
export type QuantityUnit = "г" | "g" | "шт" | "serving" | "piece";

export const QUANTITY_UNITS: readonly QuantityUnit[] = [
  "г",
  "g",
  "шт",
  "serving",
  "piece",
];

export interface LogMealItemCommand {
  name: string;
  quantity: number;
  unit?: QuantityUnit;
}

export interface LogWorkoutExerciseCommand {
  name: string;
  sets: number;
  reps: number;
  weightKg: number;
  rpe?: number;
}

export type AssistantCommand =
  | {
      action: "logMeal";
      mealType?: string;
      items: LogMealItemCommand[];
    }
  | {
      action: "logWorkout";
      workoutName?: string;
      exercises: LogWorkoutExerciseCommand[];
    }
  | { action: "logWeight"; weightKg: number }
  | { action: "logWater"; amountMl: number };

/** Поля, которые модель НЕ может передавать — они вычисляются сервером. */
export const FORBIDDEN_NUTRITION_FIELDS = [
  "calories",
  "protein",
  "carbs",
  "fat",
  "kcal",
  "proteins",
  "carbohydrates",
] as const;

export const COMMAND_ACTIONS = [
  "logMeal",
  "logWorkout",
  "logWeight",
  "logWater",
] as const;

/** Пределы санитарной валидации (защита от абсурдных значений). */
export const LIMITS = {
  maxItems: 20,
  maxExercises: 30,
  maxNameLen: 100,
  maxWorkoutNameLen: 120,
  quantityMin: 1,
  quantityMax: 5000,
  setsMin: 1,
  setsMax: 50,
  repsMin: 1,
  repsMax: 500,
  weightMin: 0,
  weightMax: 1000,
  rpeMin: 1,
  rpeMax: 10,
  bodyWeightMin: 20,
  bodyWeightMax: 500,
  waterMin: 1,
  waterMax: 5000,
} as const;

export type CommandErrorCode =
  | "invalid_json"
  | "unknown_action"
  | "missing_field"
  | "wrong_type"
  | "out_of_range"
  | "too_long"
  | "too_many_items"
  | "forbidden_field"
  | "empty";

export interface CommandValidationFailure {
  ok: false;
  code: CommandErrorCode;
  /** Понятное описание (безопасное, без пользовательских данных). */
  message: string;
}

export interface CommandValidationSuccess {
  ok: true;
  command: AssistantCommand;
  /** Игнорированные незнакомые поля (безопасные имена). */
  ignoredFields: string[];
}

export type CommandValidationResult =
  | CommandValidationFailure
  | CommandValidationSuccess;

function fail(
  code: CommandErrorCode,
  message: string,
): CommandValidationFailure {
  return { ok: false, code, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function inRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}

function trimStr(value: unknown, maxLen: number): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (t.length === 0 || t.length > maxLen) return null;
  return t;
}

/** Приводит русские/английские названия приёмов пищи к валидным значениям. */
const MEAL_TYPE_ALIASES: Record<string, string> = {
  завтрак: "breakfast",
  breakfast: "breakfast",
  обед: "lunch",
  lunch: "lunch",
  ужин: "dinner",
  dinner: "dinner",
  перекус: "snack",
  снек: "snack",
  snack: "snack",
};

export function normalizeMealType(raw: unknown): string | null {
  const key = String(raw ?? "")
    .trim()
    .toLowerCase();
  return MEAL_TYPE_ALIASES[key] ?? null;
}

/** Проверяет item команды logMeal (без КБЖУ — они запрещены). */
function validateMealItem(raw: unknown, path: string): LogMealItemCommand | null {
  if (!isRecord(raw)) {
    throw fail("wrong_type", `Поле ${path} должно быть объектом`);
  }
  for (const forbidden of FORBIDDEN_NUTRITION_FIELDS) {
    if (forbidden in raw) {
      throw fail(
        "forbidden_field",
        `Поле «${forbidden}» в ${path} запрещено — КБЖУ вычисляются приложением`,
      );
    }
  }
  const name = trimStr(raw.name, LIMITS.maxNameLen);
  if (!name) {
    throw fail("missing_field", `Поле ${path}.name: строка 1–${LIMITS.maxNameLen} символов`);
  }
  if (!isFiniteNumber(raw.quantity) || !inRange(raw.quantity, LIMITS.quantityMin, LIMITS.quantityMax)) {
    throw fail(
      "out_of_range",
      `Поле ${path}.quantity: число ${LIMITS.quantityMin}–${LIMITS.quantityMax}`,
    );
  }
  let unit: QuantityUnit | undefined;
  if (raw.unit !== undefined) {
    if (
      typeof raw.unit !== "string" ||
      !(QUANTITY_UNITS as readonly string[]).includes(raw.unit.toLowerCase())
    ) {
      throw fail(
        "wrong_type",
        `Поле ${path}.unit: одно из ${QUANTITY_UNITS.join(", ")}`,
      );
    }
    unit = raw.unit.toLowerCase() as QuantityUnit;
  }
  return { name, quantity: Math.round(raw.quantity * 10) / 10, unit };
}

/** Проверяет упражнение команды logWorkout. */
function validateExercise(raw: unknown, path: string): LogWorkoutExerciseCommand | null {
  if (!isRecord(raw)) {
    throw fail("wrong_type", `Поле ${path} должно быть объектом`);
  }
  const name = trimStr(raw.name, LIMITS.maxNameLen);
  if (!name) {
    throw fail("missing_field", `Поле ${path}.name: строка 1–${LIMITS.maxNameLen} символов`);
  }
  if (!isFiniteNumber(raw.sets) || !inRange(raw.sets, LIMITS.setsMin, LIMITS.setsMax)) {
    throw fail("out_of_range", `Поле ${path}.sets: число ${LIMITS.setsMin}–${LIMITS.setsMax}`);
  }
  if (!isFiniteNumber(raw.reps) || !inRange(raw.reps, LIMITS.repsMin, LIMITS.repsMax)) {
    throw fail("out_of_range", `Поле ${path}.reps: число ${LIMITS.repsMin}–${LIMITS.repsMax}`);
  }
  if (!isFiniteNumber(raw.weightKg) || !inRange(raw.weightKg, LIMITS.weightMin, LIMITS.weightMax)) {
    throw fail("out_of_range", `Поле ${path}.weightKg: число ${LIMITS.weightMin}–${LIMITS.weightMax}`);
  }
  let rpe: number | undefined;
  if (raw.rpe !== undefined) {
    if (!isFiniteNumber(raw.rpe) || !inRange(raw.rpe, LIMITS.rpeMin, LIMITS.rpeMax)) {
      throw fail("out_of_range", `Поле ${path}.rpe: число ${LIMITS.rpeMin}–${LIMITS.rpeMax}`);
    }
    rpe = Math.round(raw.rpe * 10) / 10;
  }
  return { name, sets: raw.sets, reps: raw.reps, weightKg: raw.weightKg, rpe };
}

/**
 * Строгая валидация сырого JSON-блока модели. Возвращает команду или
 * понятную ошибку. НИКОГДА не мутирует БД и не возвращает «частичный»
 * результат: либо команда целиком валидна, либо отклонена.
 */
export function validateCommand(raw: unknown): CommandValidationResult {
  if (!isRecord(raw)) {
    return fail("wrong_type", "Команда должна быть JSON-объектом");
  }
  const action = raw.action;
  if (typeof action !== "string" || !(COMMAND_ACTIONS as readonly string[]).includes(action)) {
    return fail(
      "unknown_action",
      `Неизвестное действие «${String(action ?? "").slice(0, 20)}»`,
    );
  }

  const ignoredFields: string[] = [];
  for (const key of Object.keys(raw)) {
    if (key !== "action" && key !== "mealType" && key !== "items" && key !== "workoutName" && key !== "exercises" && key !== "weightKg" && key !== "amountMl") {
      ignoredFields.push(key.slice(0, 30));
    }
  }

  try {
    switch (action) {
      case "logMeal": {
        if (!Array.isArray(raw.items)) {
          return fail("missing_field", "Поле items обязательно для logMeal");
        }
        if (raw.items.length === 0) {
          return fail("empty", "В logMeal нет ни одного продукта");
        }
        if (raw.items.length > LIMITS.maxItems) {
          return fail("too_many_items", `В logMeal не более ${LIMITS.maxItems} продуктов`);
        }
        const items: LogMealItemCommand[] = [];
        for (let i = 0; i < raw.items.length; i++) {
          const item = validateMealItem(raw.items[i], `items[${i}]`);
          if (!item) return fail("wrong_type", `items[${i}] — некорректный продукт`);
          items.push(item);
        }
        let mealType: string | undefined;
        if (raw.mealType !== undefined) {
          mealType = normalizeMealType(raw.mealType) ?? undefined;
          if (!mealType) {
            return fail(
              "wrong_type",
              "mealType: завтрак/обед/ужин/перекус (breakfast/lunch/dinner/snack)",
            );
          }
        }
        return { ok: true, command: { action: "logMeal", mealType, items }, ignoredFields };
      }
      case "logWorkout": {
        if (!Array.isArray(raw.exercises)) {
          return fail("missing_field", "Поле exercises обязательно для logWorkout");
        }
        if (raw.exercises.length === 0) {
          return fail("empty", "В logWorkout нет ни одного упражнения");
        }
        if (raw.exercises.length > LIMITS.maxExercises) {
          return fail("too_many_items", `В logWorkout не более ${LIMITS.maxExercises} упражнений`);
        }
        const exercises: LogWorkoutExerciseCommand[] = [];
        for (let i = 0; i < raw.exercises.length; i++) {
          const ex = validateExercise(raw.exercises[i], `exercises[${i}]`);
          if (!ex) return fail("wrong_type", `exercises[${i}] — некорректное упражнение`);
          exercises.push(ex);
        }
        let workoutName: string | undefined;
        if (raw.workoutName !== undefined) {
          workoutName = trimStr(raw.workoutName, LIMITS.maxWorkoutNameLen) ?? undefined;
          if (!workoutName) {
            return fail(
              "too_long",
              `workoutName: строка 1–${LIMITS.maxWorkoutNameLen} символов`,
            );
          }
        }
        return { ok: true, command: { action: "logWorkout", workoutName, exercises }, ignoredFields };
      }
      case "logWeight": {
        if (!isFiniteNumber(raw.weightKg) || !inRange(raw.weightKg, LIMITS.bodyWeightMin, LIMITS.bodyWeightMax)) {
          return fail(
            "out_of_range",
            `weightKg: число ${LIMITS.bodyWeightMin}–${LIMITS.bodyWeightMax}`,
          );
        }
        return { ok: true, command: { action: "logWeight", weightKg: Math.round(raw.weightKg * 10) / 10 }, ignoredFields };
      }
      case "logWater": {
        if (!isFiniteNumber(raw.amountMl) || !inRange(raw.amountMl, LIMITS.waterMin, LIMITS.waterMax)) {
          return fail("out_of_range", `amountMl: число ${LIMITS.waterMin}–${LIMITS.waterMax}`);
        }
        return { ok: true, command: { action: "logWater", amountMl: Math.round(raw.amountMl) }, ignoredFields };
      }
      default:
        return fail("unknown_action", `Неизвестное действие «${action}»`);
    }
  } catch (e) {
    // validateMealItem/validateExercise кидают fail через throw — ловим и
    // возвращаем как результат.
    if (e && typeof e === "object" && "ok" in e) {
      return e as CommandValidationFailure;
    }
    throw e;
  }
}

/** Разбирает JSON-строку и валидирует команду (обёртка над validateCommand). */
export function parseCommandJson(json: string): CommandValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return fail("invalid_json", "Некорректный JSON от модели");
  }
  return validateCommand(parsed);
}
