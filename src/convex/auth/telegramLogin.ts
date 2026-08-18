/**
 * Провайдер входа через Telegram (ConvexCredentials).
 *
 * Клиент шлёт signIn("telegram", { ... }) с результатом авторизации Telegram:
 *   - из обычного браузера — данные Login Widget (поля id/first_name/.../hash);
 *   - из Telegram Mini App — сырую initData (window.Telegram.WebApp.initData).
 *
 * Подпись всегда проверяется здесь (сервер), по секрету TELEGRAM_BOT_TOKEN —
 * токен бота никогда не попадает на клиент. При успехе:
 *   - Telegram уже привязан к аккаунту КИЛО (telegramAccounts) → вход в него;
 *   - не привязан и create !== false → создаём новый аккаунт и привязываем
 *     Telegram (полноценный «вход через Telegram» для новых пользователей);
 *   - не привязан и create === false (автовход Mini App) → ошибка с понятным
 *     текстом, аккаунт не создаётся молча.
 */

import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import type { GenericActionCtxWithAuthConfig } from "@convex-dev/auth/server";
import { ConvexError, type GenericId } from "convex/values";
import type { GenericDataModel } from "convex/server";
import { internal } from "../_generated/api";
import { verifyTelegramAuth } from "../../lib/telegram/verify";

/** Приводит произвольное значение к строке (или null). */
function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** Только поля, которые подписал Telegram (без служебных source/create):
 *  data_check_string строится ровно по полям виджета, лишний ключ ломает
 *  подпись. */
function widgetFields(credentials: unknown): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    ...(credentials as Record<string, unknown>),
  };
  delete fields.source;
  delete fields.create;
  return fields;
}

export const telegramLogin = ConvexCredentials({
  id: "telegram",
  authorize: async (
    credentials,
    ctx: GenericActionCtxWithAuthConfig<GenericDataModel>,
  ): Promise<{ userId: GenericId<"users"> } | null> => {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      throw new ConvexError({
        message:
          "Вход через Telegram не настроен на сервере. Попробуйте email или гостевой вход.",
      });
    }

    let source: "widget" | "webapp";
    if (credentials.source === "widget") source = "widget";
    else if (credentials.source === "webapp") source = "webapp";
    else {
      throw new ConvexError({
        message: "Некорректные данные входа через Telegram.",
      });
    }

    let verified;
    try {
      verified = await verifyTelegramAuth({
        source,
        botToken,
        fields: source === "widget" ? widgetFields(credentials) : undefined,
        initData:
          source === "webapp" ? asString(credentials.initData) ?? "" : undefined,
      });
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message
          : "Не удалось подтвердить вход через Telegram.";
      throw new ConvexError({ message });
    }

    // Уже привязан — входим в существующий аккаунт (все данные на месте).
    const existing = (await ctx.runQuery(internal.telegram.findByTelegram, {
      telegramUserId: verified.id,
    })) as { userId: string } | null;
    if (existing) {
      // «Последняя активность» сессии — обновляем (без отдельного запроса).
      await ctx.runMutation(internal.telegram.touchLastActive, {
        telegramUserId: verified.id,
      });
      return { userId: existing.userId as GenericId<"users"> };
    }

    // Автовход Mini App без явного действия: аккаунт не создаём, иначе любое
    // открытие приложения молча заводило бы нового пользователя.
    const create = credentials.create !== false;
    if (!create) {
      throw new ConvexError({
        message:
          "Этот Telegram ещё не привязан к аккаунту КИЛО. Войдите по email или как гость и привяжите Telegram в профиле.",
      });
    }

    const userId = (await ctx.runMutation(
      internal.telegram.createAccountFromTelegram,
      {
        telegramUserId: verified.id,
        firstName: verified.firstName,
        username: verified.username,
      },
    )) as string;
    return { userId: userId as GenericId<"users"> };
  },
});
