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
  v.literal("strength"),
);

export const experienceLevelValidator = v.union(
  v.literal("beginner"),
  v.literal("intermediate"),
  v.literal("advanced"),
);

/** Предпочтение стиля тренировок: влияет на повторы/отдых в плане. */
export const trainingStyleValidator = v.union(
  v.literal("power"),
  v.literal("hypertrophy"),
  v.literal("functional"),
  v.literal("balanced"),
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
  approxMinutes: v.optional(v.number()), // примерная длительность сессии (мин)
});

/** Один подход упражнения: фактический вес × повторы (+RPE, если заполнен). */
export const loggedSetValidator = v.object({
  weightKg: v.number(),
  reps: v.number(),
  rpe: v.optional(v.number()),
});

export const loggedExerciseValidator = v.object({
  name: v.string(),
  sets: v.number(),
  reps: v.number(),
  weightKg: v.number(),
  rpe: v.optional(v.number()),
  setDetails: v.optional(v.array(loggedSetValidator)),
});

// User profile with the inputs for the calorie / macro calculator.
export const profileFieldsValidator = v.object({
  userId: v.id("users"),
  age: v.number(),
  gender: genderValidator,
  heightCm: v.number(),
  weightKg: v.number(),
  targetWeightKg: v.optional(v.number()),
  activityLevel: activityLevelValidator,
  fitnessGoal: fitnessGoalValidator,
  experienceLevel: experienceLevelValidator,
  equipment: v.optional(v.array(equipmentValidator)),
  limitations: v.optional(v.array(limitationValidator)),
  preferredTrainingDays: v.optional(v.number()),
  trainingStyle: v.optional(trainingStyleValidator),
  updatedAt: v.number(),
});
export type ProfileFields = Infer<typeof profileFieldsValidator>;

// Weight check-ins over time (drives the progress chart).
export const weightEntryFieldsValidator = v.object({
  userId: v.id("users"),
  date: v.string(), // YYYY-MM-DD (local)
  weightKg: v.number(),
  createdAt: v.number(),
});
export type WeightEntryFields = Infer<typeof weightEntryFieldsValidator>;

// One row per logged meal / food for a given day.
export const mealLogEntryFieldsValidator = v.object({
  userId: v.id("users"),
  date: v.string(), // YYYY-MM-DD (local)
  mealType: mealTypeValidator,
  foodId: v.optional(v.id("foods")),
  name: v.string(),
  quantity: v.number(),
  calories: v.number(),
  protein: v.number(),
  carbs: v.number(),
  fat: v.number(),
  createdAt: v.number(),
});
export type MealLogEntryFields = Infer<typeof mealLogEntryFieldsValidator>;

// User-defined custom foods / products.
export const foodsFieldsValidator = v.object({
  userId: v.id("users"),
  name: v.string(),
  amount: v.number(),
  unit: v.string(),
  calories: v.number(),
  protein: v.number(),
  carbs: v.number(),
  fat: v.number(),
  createdAt: v.number(),
});
export type FoodFields = Infer<typeof foodsFieldsValidator>;

// Daily water intake, one row per user per day (total ml).
export const waterEntryFieldsValidator = v.object({
  userId: v.id("users"),
  date: v.string(),
  amountMl: v.number(),
  createdAt: v.number(),
});
export type WaterEntryFields = Infer<typeof waterEntryFieldsValidator>;

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()),
      image: v.optional(v.string()),
      email: v.optional(v.string()),
      emailVerificationTime: v.optional(v.number()),
      isAnonymous: v.optional(v.boolean()),
      role: v.optional(roleValidator),
    }).index("email", ["email"]),

    // ── FitPlan Account ──────────────────────────────────────────────
    // Wraps the Convex Auth identity. All user data is linked via this
    // account's _id. This allows future multi-workspace/team features.
    accounts: defineTable({
      userId: v.id("users"),        // links to auth identity
      email: v.string(),
      onboardingCompleted: v.boolean(),
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("by_userId", ["userId"]),

    // ---- Fitness & nutrition app tables ---- //

    // User profile with the inputs for the calorie / macro calculator.
    profiles: defineTable(profileFieldsValidator).index("by_user", ["userId"]),

    // Weight check-ins over time (drives the progress chart).
    weightEntries: defineTable(weightEntryFieldsValidator).index("by_user_date", ["userId", "date"]),

    // User-defined custom foods / products.
    foods: defineTable(foodsFieldsValidator).index("by_user", ["userId"]),

    // One row per logged meal / food for a given day.
    mealLog: defineTable(mealLogEntryFieldsValidator).index("by_user_date", ["userId", "date"]),

    // Daily water intake, one row per user per day (total ml).
    waterEntries: defineTable(waterEntryFieldsValidator).index("by_user_date", ["userId", "date"]),

    // The user's current generated workout plan (one doc per user).
    workoutPlans: defineTable({
      userId: v.id("users"),
      name: v.string(),
      adaptedFor: v.optional(v.string()),
      profileSignature: v.optional(v.string()),
      goal: fitnessGoalValidator,
      experienceLevel: experienceLevelValidator,
      splitType: v.optional(v.string()),
      sessionsPerWeek: v.optional(v.number()),
      durationWeeks: v.optional(v.number()),
      howCalculated: v.optional(v.array(v.string())),
      days: v.array(workoutDayValidator),
      weeks: v.optional(
        v.array(
          v.object({
            week: v.number(),
            label: v.string(),
            weightNote: v.optional(v.string()),
            days: v.array(workoutDayValidator),
          }),
        ),
      ),
      updatedAt: v.number(),
    }).index("by_user", ["userId"]),

    // Dev-only: перехваченные OTP-коды для локальной разработки без внешнего SMTP.
    devOtpCodes: defineTable({
      email: v.string(),
      code: v.string(),
      createdAt: v.number(),
    }).index("by_email_created", ["email", "createdAt"]),

    // Привязка Telegram-аккаунта к пользователю приложения (бот + Mini App):
    telegramAccounts: defineTable({
      telegramUserId: v.number(),
      userId: v.id("users"),
      username: v.optional(v.string()),
      firstName: v.optional(v.string()),
      chatId: v.optional(v.number()),
      linkedAt: v.number(),
      lastActiveAt: v.optional(v.number()),
    })
      .index("by_telegram", ["telegramUserId"])
      .index("by_user", ["userId"]),

    // Защита от повторной доставки апдейтов Telegram (webhook replay):
    telegramSeenUpdates: defineTable({
      updateId: v.number(),
      processedAt: v.number(),
    })
      .index("by_updateId", ["updateId"])
      .index("by_processedAt", ["processedAt"]),

    // Одноразовые коды привязки Telegram:
    linkCodes: defineTable({
      userId: v.id("users"),
      code: v.string(),
      expiresAt: v.number(),
      createdAt: v.number(),
    })
      .index("by_code", ["code"])
      .index("by_user", ["userId"]),

    // Состояние диалога пользователя с ботом:
    telegramStates: defineTable({
      chatId: v.number(),
      state: v.any(),
      updatedAt: v.number(),
    }).index("by_chat", ["chatId"]),

    // Rate-limit отправки OTP:
    otpRateLimits: defineTable({
      email: v.string(),
      lastSentAt: v.number(),
    }).index("by_email", ["email"]),

    // Глобальный throttle записей (анти-флуд):
    rateLimitEvents: defineTable({
      key: v.string(),
      timestamp: v.number(),
    }).index("by_key_timestamp", ["key", "timestamp"]),

    // Daily AI-assistant usage limits:
    assistantLimits: defineTable({
      userId: v.id("users"),
      day: v.string(),
      count: v.number(),
      totalTokens: v.optional(v.number()),
      lastMessageAt: v.number(),
    }).index("by_user_day", ["userId", "day"]),

    // Product analytics events:
    events: defineTable({
      userId: v.id("users"),
      name: v.string(),
      ts: v.number(),
      meta: v.optional(
        v.record(v.string(), v.union(v.string(), v.number(), v.boolean())),
      ),
    })
      .index("by_user_ts", ["userId", "ts"])
      .index("by_ts", ["ts"]),

    // Completed workout sessions.
    workoutLogs: defineTable({
      userId: v.id("users"),
      date: v.string(),
      workoutName: v.string(),
      exercises: v.array(loggedExerciseValidator),
      effort: v.optional(effortValidator),
      createdAt: v.number(),
    }).index("by_user_date", ["userId", "date"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
