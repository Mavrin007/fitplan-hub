// FitPlan Hub — Email + Password authentication via @convex-dev/auth Password provider.
// Replaces the previous emailOtp + Anonymous + telegramLogin setup.

import { convexAuth, getAuthUserId } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import { ROLES } from "./schema";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password],
  signIn: {
    // Limit failed login attempts per hour (built-in @convex-dev/auth rate-limit).
    maxFailedAttempsPerHour: 10,
  },
  callbacks: {
    createOrUpdateUser: async (ctx, { existingUserId, type, profile }) => {
      // On every successful sign-in/sign-up, ensure the user record exists
      // and has the correct fields.
      const userData: {
        name?: string;
        image?: string;
        email?: string;
        emailVerificationTime?: number;
        isAnonymous?: boolean;
        role?: string;
      } = {
        ...(typeof profile.name === "string" ? { name: profile.name } : null),
        ...(typeof profile.image === "string"
          ? { image: profile.image }
          : null),
        ...(typeof profile.email === "string"
          ? { email: profile.email }
          : null),
      };

      // Set verification time on sign-in (password auth verifies identity)
      if (type === "verification" || type === "credentials") {
        const userId = existingUserId ?? (await getAuthUserId(ctx));
        if (userId !== null) {
          const existingUser = await ctx.db.get(userId);
          if (existingUser && existingUser.emailVerificationTime) {
            userData.emailVerificationTime =
              existingUser.emailVerificationTime;
          } else {
            userData.emailVerificationTime = Date.now();
          }
          // Only set role for new users
          if (!existingUser?.role) {
            userData.role = ROLES.USER;
          }
          await ctx.db.patch(userId, userData);
          return userId;
        }
      }

      // New user creation
      if (existingUserId === null) {
        return await ctx.db.insert("users", {
          ...userData,
          emailVerificationTime: Date.now(),
          role: ROLES.USER,
        });
      }

      // Existing user — patch
      await ctx.db.patch(existingUserId, userData);
      return existingUserId;
    },
  },
});
