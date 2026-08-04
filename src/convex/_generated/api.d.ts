/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as activity from "../activity.js";
import type * as assistant from "../assistant.js";
import type * as auth from "../auth.js";
import type * as auth_emailOtp from "../auth/emailOtp.js";
import type * as devOtp from "../devOtp.js";
import type * as foods from "../foods.js";
import type * as guestStats from "../guestStats.js";
import type * as http from "../http.js";
import type * as mealLog from "../mealLog.js";
import type * as profiles from "../profiles.js";
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
  activity: typeof activity;
  assistant: typeof assistant;
  auth: typeof auth;
  "auth/emailOtp": typeof auth_emailOtp;
  devOtp: typeof devOtp;
  foods: typeof foods;
  guestStats: typeof guestStats;
  http: typeof http;
  mealLog: typeof mealLog;
  profiles: typeof profiles;
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
