/**
 * Письмо «первая тренировка» (Day-1 email): отправляется один раз, сразу после
 * первого завершённого воркаута пользователя с привязанной почтой.
 *
 * Чистые билдеры без I/O (как digest.ts): Convex-модуль (convex/day1Email.ts)
 * собирает данные из БД и зовёт sendResendEmail. Возвращает человека в
 * приложение: результат тренировки → «завтра сделай X» → ссылка открыть КИЛО.
 *
 * Воронка измерения: email_sent (событие пишется при успешной отправке) →
 * app_opened (выводится из today_opened) → day_completed.
 */

import { buildWorkoutSummary, type SummaryExercise } from "./workoutIntelligence";

export interface Day1EmailData {
  /** Имя пользователя (если заполнено) — для персонального обращения. */
  name?: string;
  workoutName: string;
  exercises: SummaryExercise[];
  /** Базовый URL приложения (SITE_URL); без него CTA-кнопки в письме нет. */
  siteUrl?: string;
}

export interface Day1Email {
  subject: string;
  text: string;
  html: string;
}

/** Множитель «упражнение/упражнения/упражнений» по числу. */
function exerciseWord(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return "упражнение";
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) {
    return "упражнения";
  }
  return "упражнений";
}

/** Собирает тему и оба варианта письма (text/html) из данных первой тренировки. */
export function buildDay1Email(data: Day1EmailData): Day1Email {
  // Сводка без истории: только факты текущей сессии (сравнений нет).
  const summary = buildWorkoutSummary({
    exercises: data.exercises,
    prevLogs: [],
  });

  const greeting = data.name
    ? `${data.name}, отличная работа!`
    : "Отличная работа!";
  const headline = `Вы завершили свою первую тренировку «${data.workoutName}»:`;
  const facts = `${summary.exerciseCount} ${exerciseWord(
    summary.exerciseCount,
  )} · ${summary.setCount} подходов · объём ${Math.round(
    summary.tonnage,
  ).toLocaleString("ru-RU")} кг`;

  const nextSteps = [
    "завтра откройте КИЛО и отметьте питание и воду — кольца закроются сами;",
    "следующая тренировка уже ждёт в вашем плане;",
    "через неделю «Итоги недели» покажут, как изменился прогресс.",
  ];

  const subject = "Первая тренировка в КИЛО — как закрепить результат";

  const text = [
    greeting,
    "",
    headline,
    facts,
    "",
    "Это первый шаг — дальше всё простая система:",
    ...nextSteps.map((s) => `— ${s}`),
    "",
    "Маленькие шаги каждый день дают больше, чем редкие рывки.",
    "",
    "— КИЛО, ваш персональный фитнес-помощник",
  ].join("\n");

  const rows = nextSteps.map((s) => `<li>${s}</li>`).join("");
  const cta = data.siteUrl
    ? `<p style="margin:24px 0 0;text-align:center">
         <a href="${data.siteUrl}" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:9999px;font-size:15px;font-weight:600">Открыть КИЛО</a>
       </p>`
    : "";

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1f2937">
      <p style="font-size:16px;font-weight:600;margin:0 0 12px">${greeting}</p>
      <p style="margin:0 0 4px">${headline}</p>
      <p style="margin:0 0 16px;color:#4b5563"><b>${facts}</b></p>
      <p style="margin:0 0 8px">Это первый шаг — дальше всё простая система:</p>
      <ul style="margin:0 0 16px;padding-left:20px;color:#4b5563;font-size:15px;line-height:1.6">${rows}</ul>
      <p style="margin:0 0 24px;color:#4b5563">Маленькие шаги каждый день дают больше, чем редкие рывки.</p>
      ${cta}
      <p style="margin:28px 0 0;color:#9ca3af;font-size:13px">— КИЛО, ваш персональный фитнес-помощник</p>
    </div>
  `.trim();

  return { subject, text, html };
}
