import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import {
  effortValidator,
  experienceLevelValidator,
  fitnessGoalValidator,
  loggedExerciseValidator,
  workoutDayValidator,
} from "./schema";
import { assertDate, assertMaxItems, assertRange, assertText } from "./validation";

const MAX_DAYS = 7;
const MAX_WEEKS = 16;
const MAX_EXERCISES = 40;
const MAX_NAME_LEN = 120;
const MAX_SIGNATURE_LEN = 200;

/** Понятная ошибка сессии вместо «Server Error» без текста. */
function authError(): ConvexError {
  return new ConvexError({ message: "Сессия истекла — войдите заново." });
}

export const getMyPlan = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    return (
      (await ctx.db
        .query("workoutPlans")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .first()) ?? null
    );
  },
});

export const savePlan = mutation({
  args: {
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
    // Цикл прогрессии нагрузки по неделям (4 недели: база → +1 повтор → +2.5 кг → разгрузка).
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
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw authError();

    assertText(args.name, MAX_NAME_LEN, "Название плана");
    if (args.profileSignature) {
      assertText(args.profileSignature, MAX_SIGNATURE_LEN, "Слепок профиля");
    }
    if (args.splitType) assertText(args.splitType, MAX_NAME_LEN, "Тип сплита");
    if (args.sessionsPerWeek !== undefined) {
      assertRange(args.sessionsPerWeek, 1, 6, "Тренировок в неделю");
    }
    if (args.durationWeeks !== undefined) {
      assertRange(args.durationWeeks, 1, 16, "Недель цикла");
    }
    if (args.howCalculated !== undefined) {
      assertMaxItems(args.howCalculated, 12, "Пунктов «как считается»");
    }
    assertMaxItems(args.days, MAX_DAYS, "Дней в неделе");
    if (args.weeks) {
      assertMaxItems(args.weeks, MAX_WEEKS, "Недель в цикле");
    }
    for (const day of [...args.days, ...(args.weeks ?? []).flatMap((w) => w.days)]) {
      assertMaxItems(day.exercises, MAX_EXERCISES, "Упражнений");
      if (day.warmup) {
        assertMaxItems(day.warmup, 10, "Пунктов разминки");
      }
      for (const ex of day.exercises) {
        assertText(ex.name, MAX_NAME_LEN, "Упражнение");
        assertRange(ex.sets, 1, 20, "Подходы");
        assertRange(ex.restSeconds, 0, 600, "Отдых (сек)");
      }
    }

    const existing = await ctx.db
      .query("workoutPlans")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    const data = { ...args, userId, updatedAt: Date.now() };
    if (existing) {
      await ctx.db.patch(existing._id, data);
      return existing._id;
    }
    return await ctx.db.insert("workoutPlans", data);
  },
});

export const logWorkout = mutation({
  args: {
    date: v.string(),
    workoutName: v.string(),
    exercises: v.array(loggedExerciseValidator),
    effort: v.optional(effortValidator),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw authError();

    assertDate(args.date);
    assertText(args.workoutName, MAX_NAME_LEN, "Название тренировки");
    assertMaxItems(args.exercises, MAX_EXERCISES, "Упражнений");
    for (const ex of args.exercises) {
      assertText(ex.name, MAX_NAME_LEN, "Упражнение");
      assertRange(ex.sets, 1, 50, "Подходы");
      assertRange(ex.reps, 1, 500, "Повторения");
      assertRange(ex.weightKg, 0, 1000, "Вес (кг)");
    }

    return await ctx.db.insert("workoutLogs", {
      ...args,
      userId,
      createdAt: Date.now(),
    });
  },
});

export const listLogs = query({
  args: {
    from: v.optional(v.string()),
    to: v.optional(v.string()),
  },
  handler: async (ctx, { from, to }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const q =
      from && to
        ? ctx.db
            .query("workoutLogs")
            .withIndex("by_user_date", (qq) =>
              qq.eq("userId", userId).gte("date", from).lte("date", to),
            )
        : ctx.db
            .query("workoutLogs")
            .withIndex("by_user_date", (qq) => qq.eq("userId", userId));
    return await q.order("desc").collect();
  },
});

export const deleteLog = mutation({
  args: { id: v.id("workoutLogs") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw authError();
    const log = await ctx.db.get(id);
    if (!log || log.userId !== userId) {
      throw new ConvexError({ message: "Запись не найдена или уже удалена." });
    }
    await ctx.db.delete(id);
  },
});
