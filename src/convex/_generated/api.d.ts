/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as account from "../account.js";
import type * as accounts from "../accounts.js";
import type * as activity from "../activity.js";
import type * as analytics from "../analytics.js";
import type * as assistant from "../assistant.js";
import type * as assistantLimits from "../assistantLimits.js";
import type * as auth from "../auth.js";
import type * as auth_emailOtp from "../auth/emailOtp.js";
import type * as auth_telegramLogin from "../auth/telegramLogin.js";
import type * as crons from "../crons.js";
import type * as day1Email from "../day1Email.js";
import type * as devOtp from "../devOtp.js";
import type * as digest from "../digest.js";
import type * as foods from "../foods.js";
import type * as guestStats from "../guestStats.js";
import type * as http from "../http.js";
import type * as mealLog from "../mealLog.js";
import type * as otpRateLimit from "../otpRateLimit.js";
import type * as photo from "../photo.js";
import type * as premium from "../premium.js";
import type * as profiles from "../profiles.js";
import type * as rateLimit from "../rateLimit.js";
import type * as roles from "../roles.js";
import type * as telegram from "../telegram.js";
import type * as users from "../users.js";
import type * as validation from "../validation.js";
import type * as water from "../water.js";
import type * as weightEntries from "../weightEntries.js";
import type * as workouts from "../workouts.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  account: typeof account;
  accounts: typeof accounts;
  activity: typeof activity;
  analytics: typeof analytics;
  assistant: typeof assistant;
  assistantLimits: typeof assistantLimits;
  auth: typeof auth;
  "auth/emailOtp": typeof auth_emailOtp;
  "auth/telegramLogin": typeof auth_telegramLogin;
  crons: typeof crons;
  day1Email: typeof day1Email;
  devOtp: typeof devOtp;
  digest: typeof digest;
  foods: typeof foods;
  guestStats: typeof guestStats;
  http: typeof http;
  mealLog: typeof mealLog;
  otpRateLimit: typeof otpRateLimit;
  photo: typeof photo;
  premium: typeof premium;
  profiles: typeof profiles;
  rateLimit: typeof rateLimit;
  roles: typeof roles;
  telegram: typeof telegram;
  users: typeof users;
  validation: typeof validation;
  water: typeof water;
  weightEntries: typeof weightEntries;
  workouts: typeof workouts;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
