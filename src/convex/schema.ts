import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

export const activityLevelValidator = v.union(
  v.literal("sedentary"),
  v.literal("light"),
  v.literal("moderate"),
  v.literal("active"),
  v.literal("very_active"),
);

export const fitnessGoalValidator = v.union(
  v.literal("lose_weight"),
  v.literal("maintain"),
  v.literal("gain_muscle"),
  v.literal("improve_endurance"),
);

export const experienceLevelValidator = v.union(
  v.literal("beginner"),
  v.literal("intermediate"),
  v.literal("advanced"),
);

export const genderValidator = v.union(v.literal("male"), v.literal("female"));

/** Ограничения/травмы пользователя — влияют на подбор упражнений в плане. */
export const limitationValidator = v.union(
  v.literal("lower_back"),
  v.literal("knees"),
  v.literal("shoulders"),
);

/** Доступный инвентарь пользователя — упражнения плана подстраиваются под него. */
export const equipmentValidator = v.union(
  v.literal("barbell"),
  v.literal("dumbbell"),
  v.literal("machine"),
  v.literal("cable"),
  v.literal("kettlebell"),
  v.literal("bodyweight"),
);

/** Субъективная оценка нагрузки после тренировки — влияет на прогрессию. */
export const effortValidator = v.union(
  v.literal("easy"),
  v.literal("normal"),
  v.literal("hard"),
);

export const mealTypeValidator = v.union(
  v.literal("breakfast"),
  v.literal("lunch"),
  v.literal("dinner"),
  v.literal("snack"),
);

export const exerciseValidator = v.object({
  name: v.string(),
  sets: v.number(),
  reps: v.string(), // e.g. "8-12" or "30s"
  restSeconds: v.number(),
  priority: v.optional(v.boolean()), // рекомендовано для профиля пользователя
  weightNote: v.optional(v.string()), // рекомендация по прогрессии нагрузки на неделю
  weightKg: v.optional(v.number()), // стартовый рабочий вес (кг) под профиль пользователя
  tempo: v.optional(v.string()), // темп выполнения, напр. "3-1-1" (эксцентрика-пауза-концентрика)
});

export const workoutDayValidator = v.object({
  day: v.number(), // 0 = Monday ... 6 = Sunday
  focus: v.string(),
  exercises: v.array(exerciseValidator),
  notes: v.optional(v.array(v.string())), // персональные заметки
  warmup: v.optional(v.array(v.string())), // разминка/мобильность перед тренировкой
});

export const loggedExerciseValidator = v.object({
  name: v.string(),
  sets: v.number(),
  reps: v.number(),
  weightKg: v.number(),
});

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // ---- Fitness & nutrition app tables ---- //

    // User profile with the inputs for the calorie / macro calculator.
    profiles: defineTable({
      userId: v.id("users"),
      age: v.number(),
      gender: genderValidator,
      heightCm: v.number(),
      weightKg: v.number(),
      targetWeightKg: v.optional(v.number()), // goal weight shown as a dashed line on the progress chart
      activityLevel: activityLevelValidator,
      fitnessGoal: fitnessGoalValidator,
      experienceLevel: experienceLevelValidator,
      equipment: v.optional(v.array(equipmentValidator)), // доступный инвентарь для плана тренировок
      limitations: v.optional(v.array(limitationValidator)), // ограничения/травмы (поясница, колени, плечи)
      preferredTrainingDays: v.optional(v.number()), // сколько тренировок в неделю хочет пользователь (1–6)
      updatedAt: v.number(),
    }).index("by_user", ["userId"]),

    // Weight check-ins over time (drives the progress chart).
    weightEntries: defineTable({
      userId: v.id("users"),
      date: v.string(), // YYYY-MM-DD (local)
      weightKg: v.number(),
      createdAt: v.number(),
    }).index("by_user_date", ["userId", "date"]),

    // User-defined custom foods / products.
    foods: defineTable({
      userId: v.id("users"),
      name: v.string(),
      amount: v.number(), // serving size in `unit`
      unit: v.string(), // "g", "ml", "serving", "piece", ...
      calories: v.number(), // per `amount`
      protein: v.number(), // per `amount`
      carbs: v.number(), // per `amount`
      fat: v.number(), // per `amount`
      createdAt: v.number(),
    }).index("by_user", ["userId"]),

    // One row per logged meal / food for a given day.
    mealLog: defineTable({
      userId: v.id("users"),
      date: v.string(), // YYYY-MM-DD (local)
      mealType: mealTypeValidator,
      foodId: v.optional(v.id("foods")), // set when logged from a custom food
      name: v.string(),
      quantity: v.number(), // multiplier of the recorded serving
      calories: v.number(),
      protein: v.number(),
      carbs: v.number(),
      fat: v.number(),
      createdAt: v.number(),
    }).index("by_user_date", ["userId", "date"]),

    // Daily water intake, one row per user per day (total ml).
    waterEntries: defineTable({
      userId: v.id("users"),
      date: v.string(), // YYYY-MM-DD (local)
      amountMl: v.number(),
      createdAt: v.number(),
    }).index("by_user_date", ["userId", "date"]),

    // The user's current generated workout plan (one doc per user).
    workoutPlans: defineTable({
      userId: v.id("users"),
      name: v.string(),
      adaptedFor: v.optional(v.string()), // сводка адаптации под профиль
      profileSignature: v.optional(v.string()), // слепок профиля, по которому собран план
      goal: fitnessGoalValidator,
      experienceLevel: experienceLevelValidator,
      // Метаданные персонального плана (для сводной карточки на странице).
      splitType: v.optional(v.string()), // «Фулбоди», «Жим/Тяга/Ноги» и т.п.
      sessionsPerWeek: v.optional(v.number()), // 1–6 тренировок в неделю
      durationWeeks: v.optional(v.number()), // длина цикла (4)
      howCalculated: v.optional(v.array(v.string())), // пункты «как считается этот план»
      days: v.array(workoutDayValidator),
      // Цикл прогрессии нагрузки по неделям (опционально — старые планы без него).
      weeks: v.optional(
        v.array(
          v.object({
            week: v.number(), // 1-based
            label: v.string(), // «Неделя 2 · Прогресс»
            weightNote: v.optional(v.string()),
            days: v.array(workoutDayValidator),
          }),
        ),
      ),
      updatedAt: v.number(),
    }).index("by_user", ["userId"]),

    // Completed workout sessions.
    workoutLogs: defineTable({
      userId: v.id("users"),
      date: v.string(), // YYYY-MM-DD (local)
      workoutName: v.string(),
      exercises: v.array(loggedExerciseValidator),
      effort: v.optional(effortValidator), // насколько тяжело было («лёгко/норм/тяжело») — влияет на следующий цикл
      createdAt: v.number(),
    }).index("by_user_date", ["userId", "date"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
