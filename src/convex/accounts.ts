// FitPlan Hub — Account layer on top of Convex Auth users table.
//
// Architecture:
//   Convex Auth identity (users._id)
//     → FitPlan Account (accounts table, keyed by userId)
//       → All app data (profiles, workouts, meals, etc.)
//
// The accounts table provides a stable FitPlan-specific entity that wraps
// the auth identity. This allows future multi-workspace or team features
// without changing how auth works.

import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation } from "./_generated/server";

/**
 * Get the current user's FitPlan account.
 * Returns null if not authenticated or no account exists yet.
 */
export const getMyAccount = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    // Account is keyed by auth userId — one account per auth identity.
    const account = await ctx.db
      .query("accounts")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    return account ?? null;
  },
});

/**
 * Ensure the current user has a FitPlan account.
 * Called after sign-in/sign-up. Creates the account if it doesn't exist.
 * Returns the account (existing or newly created).
 */
export const ensureAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    // Check if account already exists
    const existing = await ctx.db
      .query("accounts")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    if (existing) {
      // Update last active timestamp
      await ctx.db.patch(existing._id, { updatedAt: Date.now() });
      return existing;
    }

    // Get user email from auth record
    const user = await ctx.db.get(userId);
    const email = user?.email ?? "";

    // Create new FitPlan account
    const accountId = await ctx.db.insert("accounts", {
      userId,
      email,
      onboardingCompleted: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return await ctx.db.get(accountId);
  },
});

/**
 * Mark onboarding as completed for the current user.
 */
export const completeOnboarding = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");

    const account = await ctx.db
      .query("accounts")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    if (!account) throw new Error("Account not found");

    await ctx.db.patch(account._id, {
      onboardingCompleted: true,
      updatedAt: Date.now(),
    });

    return account;
  },
});
