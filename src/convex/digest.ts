/**
 * Недельная сводка: агрегирует записи пользователя за последние 7 дней
 * (вес, питание, тренировки, воду) и отправляет письмо через VLY-шлюз.
 *
 * - runWeeklyDigest (internalMutation) — вызывается cron-джобой
 *   (src/convex/crons.ts, понедельник 08:00 UTC). Проходит по всем
 *   пользователям с email, пропускает гостей и тех, у кого за неделю не
 *   было ни одной записи (письмо «у вас пусто» спамило бы и не помогало).
 * - getMyWeeklyDigest (query) — та же сводка для текущего пользователя:
 *   вкладка «итоги недели» в UI и быстрая проверка без реальной отправки.
 *
 * Отправка не критична для пользователя: сбой одного адреса не роняет
 * остальных (try/catch на каждого получателя). Гейты: DIGEST_DISABLED=1
 * и отсутствие VLY_INTEGRATION_KEY молча пропускают прогон (в dev без
 * шлюза cron не должен падать).
 */
import { internalMutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { GenericDatabaseReader } from "convex/server";
import type { DataModel } from "./_generated/dataModel";
import { vly } from "../lib/vly-integrations";
import { addDays, toDateKey } from "../lib/dates";
import {
  buildWeeklyDigest,
  renderDigestHtml,
  renderDigestText,
  type DigestInput,
  type DigestMealRow,
  type DigestWaterRow,
  type DigestWeightRow,
  type DigestWorkoutRow,
  type WeeklyDigest,
} from "../lib/digest";
import { computeTargets } from "../lib/nutrition";

type Reader = GenericDatabaseReader<DataModel>;

/** Ключи окна: 7 дней, заканчивающиеся «вчера» (понедельничный прогон
 *  закрывает прошлую неделю Пн–Вс, а не текущий день). Старые даты —
 *  в начале массива: [вчера-6 … вчера].
 *
 *  Ограничение: окно строится в серверном UTC, а date-ключи приложения —
 *  в локальном часовом поясе пользователя (в схеме таймзона не хранится).
 *  Для прогона в понедельник 08:00 UTC это совпадает для UTC+0…+14;
 *  для крайних западных поясов граница может сместиться на день — TODO. */
function weekWindowKeys(): string[] {
  const yesterday = addDays(new Date(), -1);
  const keys: string[] = [];
  for (let i = 6; i >= 0; i--) {
    keys.push(toDateKey(addDays(yesterday, -i)));
  }
  return keys;
}

/** Сборка входных строк для buildWeeklyDigest по пользователю за окно. */
async function loadDigest(
  ctx: { db: Reader },
  userId: DataModel["users"]["document"]["_id"],
  dayKeys: string[],
): Promise<{ digest: WeeklyDigest; calorieTarget: number | null }> {
  // dayKeys старые→новые: from — самый ранний день, to — самый поздний.
  const from = dayKeys[0];
  const to = dayKeys[dayKeys.length - 1];

  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();

  const weightRows: DigestWeightRow[] = (
    await ctx.db
      .query("weightEntries")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", userId).gte("date", from).lte("date", to),
      )
      .collect()
  ).map((d) => ({ date: d.date, weightKg: d.weightKg }));

  const mealRows: DigestMealRow[] = (
    await ctx.db
      .query("mealLog")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", userId).gte("date", from).lte("date", to),
      )
      .collect()
  ).map((d) => ({ date: d.date, calories: d.calories, protein: d.protein }));

  const workoutRows: DigestWorkoutRow[] = (
    await ctx.db
      .query("workoutLogs")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", userId).gte("date", from).lte("date", to),
      )
      .collect()
  ).map((d) => ({
    date: d.date,
    workoutName: d.workoutName,
    // Тоннаж как на Прогрессе: Σ вес × повторы × подходы по упражнениям.
    tonnageKg: d.exercises.reduce(
      (s, ex) => s + ex.weightKg * ex.reps * ex.sets,
      0,
    ),
  }));

  const waterRows: DigestWaterRow[] = (
    await ctx.db
      .query("waterEntries")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", userId).gte("date", from).lte("date", to),
      )
      .collect()
  ).map((d) => ({ date: d.date, amountMl: d.amountMl }));

  const calorieTarget =
    profile !== null
      ? computeTargets({
          age: profile.age,
          gender: profile.gender,
          heightCm: profile.heightCm,
          weightKg: profile.weightKg,
          activityLevel: profile.activityLevel,
          fitnessGoal: profile.fitnessGoal,
        }).calories
      : null;

  const digest = buildWeeklyDigest({
    weightRows,
    mealRows,
    workoutRows,
    waterRows,
    calorieTarget,
  } satisfies DigestInput);
  return { digest, calorieTarget };
}

export interface DigestRunResult {
  skipped: "dev" | "disabled" | "no-vly-key" | null;
  sent: number;
  noData: number;
  failed: number;
}

/**
 * Прогон недельной сводки для всех пользователей с email.
 *
 * TODO(mvp): при росте базы пользователей перевести на fan-out —
 * cron вызывает internal.digest.sendOne на пользователя через queue
 * (или расписание), а не перебирает всех в одной мутации.
 */
export const runWeeklyDigest = internalMutation({
  args: {},
  handler: async (ctx): Promise<DigestRunResult> => {
    // Cron работает и на локальном convex dev: без этого гейта дев-бэкенд
    // с заданным VLY_INTEGRATION_KEY слал бы реальные письма тестовым
    // пользователям по понедельникам. NODE_ENV выставляет сам Convex.
    if (process.env.NODE_ENV === "development") {
      return { skipped: "dev", sent: 0, noData: 0, failed: 0 };
    }
    if (process.env.DIGEST_DISABLED === "1") {
      console.log("[digest] выключен (DIGEST_DISABLED=1)");
      return { skipped: "disabled", sent: 0, noData: 0, failed: 0 };
    }
    if (!process.env.VLY_INTEGRATION_KEY) {
      console.log("[digest] пропуск: нет VLY_INTEGRATION_KEY");
      return { skipped: "no-vly-key", sent: 0, noData: 0, failed: 0 };
    }

    const dayKeys = weekWindowKeys();
    const users = await ctx.db.query("users").collect();
    let sent = 0;
    let noData = 0;
    let failed = 0;

    for (const user of users) {
      const email = typeof user.email === "string" ? user.email : "";
      // Гости без привязанной почты и анонимные сессии письмо не получают.
      if (!email || user.isAnonymous) continue;
      try {
        const { digest } = await loadDigest(ctx, user._id, dayKeys);
        if (!digest.hasData) {
          noData += 1;
          continue;
        }
        const name =
          typeof user.name === "string" && user.name.length > 0
            ? user.name
            : undefined;
        const res = await vly.email.send({
          to: email,
          subject: "Ваша неделя в КИЛО",
          text: renderDigestText(digest, { name }),
          html: renderDigestHtml(digest, { name }),
        });
        if (!res.success || res.data?.status === "failed") {
          failed += 1;
          console.error(
            `[digest] не отправлено ${email}:`,
            res.error ?? "status failed",
          );
        } else {
          sent += 1;
        }
      } catch (err) {
        // Один плохой адрес не должен валить всю рассылку.
        failed += 1;
        console.error(`[digest] ошибка для ${email}:`, err);
      }
    }
    return { skipped: null, sent, noData, failed };
  },
});

/** Та же сводка, но для текущего пользователя — без отправки (UI/проверка). */
export const getMyWeeklyDigest = query({
  args: {},
  handler: async (ctx): Promise<WeeklyDigest | null> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const { digest } = await loadDigest(ctx, userId, weekWindowKeys());
    return digest;
  },
});
