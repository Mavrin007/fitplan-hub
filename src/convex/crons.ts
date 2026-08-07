/**
 * Расписание периодических задач (cron).
 *
 * Единственная джоба сейчас — недельная email-сводка (понедельник 08:00 UTC,
 * ~11:00 МСК). Прогон сам пропускается, если нет VLY_INTEGRATION_KEY или
 * задан DIGEST_DISABLED=1 — dev-окружение не спамит и не падает.
 */
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.weekly(
  "weekly email digest",
  { dayOfWeek: "monday", hourUTC: 8, minuteUTC: 0 },
  internal.digest.runWeeklyDigest,
  {},
);

export default crons;
