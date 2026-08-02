import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { assertRange, assertText } from "./validation";

const MAX_NAME_LEN = 100;
const MAX_AMOUNT = 10000;
const MAX_CALORIES = 20000;
const MAX_MACRO_G = 2000;
/** Ограничиваем выдачу своих продуктов — дальше их редко используют. */
const DEFAULT_LIMIT = 300;

/** Понятная ошибка сессии вместо «Server Error» без текста. */
function authError(): ConvexError<{ message: string }> {
  return new ConvexError({ message: "Сессия истекла — войдите заново." });
}

export const listMyFoods = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    return await ctx.db
      .query("foods")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(Math.min(Math.max(limit ?? DEFAULT_LIMIT, 1), 500));
  },
});

export const addFood = mutation({
  args: {
    name: v.string(),
    amount: v.number(),
    unit: v.string(),
    calories: v.number(),
    protein: v.number(),
    carbs: v.number(),
    fat: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw authError();

    assertText(args.name, MAX_NAME_LEN, "Название");
    assertText(args.unit, 20, "Единица измерения");
    assertRange(args.amount, 1, MAX_AMOUNT, "Порция");
    assertRange(args.calories, 0, MAX_CALORIES, "Калории");
    assertRange(args.protein, 0, MAX_MACRO_G, "Белки (г)");
    assertRange(args.carbs, 0, MAX_MACRO_G, "Углеводы (г)");
    assertRange(args.fat, 0, MAX_MACRO_G, "Жиры (г)");

    return await ctx.db.insert("foods", {
      ...args,
      userId,
      createdAt: Date.now(),
    });
  },
});

export const deleteFood = mutation({
  args: { id: v.id("foods") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw authError();
    const food = await ctx.db.get(id);
    if (!food || food.userId !== userId) {
      throw new ConvexError({ message: "Продукт не найден или уже удалён." });
    }
    await ctx.db.delete(id);
  },
});
