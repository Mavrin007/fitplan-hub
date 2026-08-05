import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import {
  activityLevelValidator,
  equipmentValidator,
  experienceLevelValidator,
  fitnessGoalValidator,
  genderValidator,
  limitationValidator,
  trainingStyleValidator,
} from "./schema";
import { assertMaxItems, assertRange } from "./validation";

/** Допустимые ключи инвентаря и ограничений — защита от дрейфа клиента:
 *  даже если клиент пришлёт неизвестный ключ (старая версия фронта или
 *  мусорный запрос), он не попадёт в базу и не сломает сохранение. */
const EQUIPMENT_KEYS = [
  "barbell",
  "dumbbell",
  "machine",
  "cable",
  "kettlebell",
  "bodyweight",
] as const;
type EquipmentKey = (typeof EQUIPMENT_KEYS)[number];

const LIMITATION_KEYS = ["lower_back", "knees", "shoulders"] as const;
type LimitationKey = (typeof LIMITATION_KEYS)[number];

export const getMyProfile = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    return profile ?? null;
  },
});

export const upsertProfile = mutation({
  args: {
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
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      // ConvexError доносит message до клиента (err.data), в отличие от
      // голого Error, который клиент показывает как «Server Error».
      throw new ConvexError({ message: "Сессия истекла — войдите заново." });
    }

    // Серверная валидация диапазонов — клиентские min/max не защищают API.
    assertRange(args.age, 10, 120, "Возраст");
    assertRange(args.heightCm, 100, 250, "Рост (см)");
    assertRange(args.weightKg, 20, 500, "Вес (кг)");
    if (args.targetWeightKg !== undefined) {
      assertRange(args.targetWeightKg, 20, 500, "Целевой вес (кг)");
    }
    if (args.equipment !== undefined) {
      assertMaxItems(args.equipment, 8, "Инвентарь");
    }
    if (args.limitations !== undefined) {
      assertMaxItems(args.limitations, 5, "Ограничения");
    }
    if (args.preferredTrainingDays !== undefined) {
      assertRange(args.preferredTrainingDays, 1, 6, "Тренировок в неделю");
    }

    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    // Собираем документ явно, без спреда args: в базу попадают только
    // известные поля, а неизвестные ключи (например, от устаревшего
    // фронтенда) отфильтровываются, а не приводят к ошибке валидации.
    const data = {
      userId,
      age: args.age,
      gender: args.gender,
      heightCm: args.heightCm,
      weightKg: args.weightKg,
      targetWeightKg: args.targetWeightKg,
      activityLevel: args.activityLevel,
      fitnessGoal: args.fitnessGoal,
      experienceLevel: args.experienceLevel,
      equipment: (args.equipment ?? []).filter(
        (e): e is EquipmentKey =>
          (EQUIPMENT_KEYS as readonly string[]).includes(e),
      ),
      limitations: (args.limitations ?? []).filter(
        (l): l is LimitationKey =>
          (LIMITATION_KEYS as readonly string[]).includes(l),
      ),
      preferredTrainingDays: args.preferredTrainingDays,
      trainingStyle: args.trainingStyle,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, data);
      return existing._id;
    }
    return await ctx.db.insert("profiles", data);
  },
});
