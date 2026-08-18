"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import { geminiGenerateContent } from "../lib/geminiClient";
import {
  MAX_OUTPUT_TOKENS,
  describeError,
  extractLogBlock,
  stripLogBlock,
} from "../lib/assistantCore";
import { RATE_LIMITS } from "./rateLimit";
import {
  FORBIDDEN_NUTRITION_FIELDS,
  LIMITS,
  parseCommandJson,
} from "./assistant/commands";

/** Модель с поддержкой Vision (фото тарелки). */
const PHOTO_MODEL = process.env.GEMINI_PHOTO_MODEL ?? "gemini-flash-latest";

/** Максимальный размер base64-изображения (~2.5 МБ): большие фото жгут
 *  бюджет токенов и долго едут — обрезаем до разумного. */
const MAX_IMAGE_BASE64 = 2_500_000;

/**
 * Системный промпт распознавания: команда logMeal БЕЗ КБЖУ — питательная
 * ценность вычисляется приложением (assistant/nutrition.ts) и помечается
 * как ai_estimate. Модель не должна передавать калории/БЖУ: валидатор
 * отклонит такие поля.
 */
const VISION_SYSTEM = `Ты — «Кило», помощник по трекингу питания. Посмотри на фото тарелки с едой и определи, что на ней.

Верни ТОЛЬКО JSON-блок (без лишнего текста):

<<<LOG>>>
{"action":"logMeal","mealType":"breakfast","items":[{"name":"Овсянка","quantity":250}]}
<<<END>>>

Правила:
- items — одно или несколько блюд/продуктов, которые реально видно на фото.
- quantity — количество в граммах (или штуках для целых продуктов: яйцо = 1 шт, банан = 1 шт).
- НЕ добавляй поля calories/protein/carbs/fat в items — КБЖУ вычислит приложение.
- Не выдумывай ингредиенты, которых не видно. Если еды на фото не видно или неясно — верни пустой блок: {"action":"logMeal","items":[]}.
- mealType — одно из: breakfast, lunch, dinner, snack (догадайся по составу).`;

export interface RecognizedItem {
  name: string;
  quantity: number;
  /** Всегда ai_estimate для фото-распознавания — показывается UI как оценка. */
  source: "ai_estimate";
}

/** Разбирает «data:image/png;base64,....» на mime и base64. */
function parseDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  const m = dataUrl.match(/^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i);
  if (!m) return null;
  const mimeType = m[1];
  const data = m[2];
  if (!/^image\/(jpeg|png|webp)$/i.test(mimeType)) return null;
  if (data.length > MAX_IMAGE_BASE64) return null;
  return { mimeType, data };
}

/**
 * Распознавание еды по фото (Gemini Vision). Лимит: RATE_LIMITS.photo —
 * дорогой внешний вызов, не должен дёргаться без ограничений.
 *
 * Результат — ВСЕГДА оценка (ai_estimate): КБЖУ пересчитываются приложением
 * по названию продукта (assistant/nutrition.ts) и помечаются как
 * приблизительные. UI не добавляет распознанное в дневник автоматически
 * без подтверждения пользователя.
 */
export const analyzeMealPhoto = action({
  args: { imageDataUrl: v.string() },
  handler: async (
    ctx,
    { imageDataUrl },
  ): Promise<{
    items: RecognizedItem[];
    raw: string;
  }> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Не авторизован");

    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      // Честно: фото-распознавание идёт только через Gemini Vision (VLY-шлюз
      // не поддерживает картинки), поэтому VLY_INTEGRATION_KEY здесь не поможет.
      throw new Error("Для распознавания фото нужен GEMINI_API_KEY.");
    }

    const image = parseDataUrl(imageDataUrl);
    if (!image) {
      throw new Error(
        "Не удалось прочитать фото: нужен JPEG/PNG/WebP не больше 2.5 МБ.",
      );
    }

    // Лимит через internal-мутацию (у action нет ctx.db). Ошибка ConvexError
    // с retryAfterSec прилетит наружу — UI покажет «Слишком часто».
    await ctx.runMutation(internal.rateLimit.consumeRateLimitAction, {
      key: `${userId}:photo`,
      limit: RATE_LIMITS.photo.limit,
      windowMs: RATE_LIMITS.photo.windowMs,
    });

    const result = await geminiGenerateContent(
      key,
      PHOTO_MODEL,
      VISION_SYSTEM,
      [
        {
          role: "user",
          parts: [
            { text: "Что на этом фото?" },
            { inlineData: { mimeType: image.mimeType, data: image.data } },
          ],
        },
      ],
      MAX_OUTPUT_TOKENS,
    );

    if (!result.ok || result.text === undefined) {
      throw new Error(describeError(result.error ?? "unknown error"));
    }

    const raw = stripLogBlock(result.text);
    const block = extractLogBlock(result.text);
    const items: RecognizedItem[] = [];
    if (block) {
      const parsed = parseCommandJson(block);
      if (parsed.ok && parsed.command.action === "logMeal") {
        for (const item of parsed.command.items) {
          // Санитарные пределы уже применены валидатором; здесь только
          // собираем результат (КБЖУ не передаём — их вычислит приложение).
          items.push({
            name: item.name.slice(0, LIMITS.maxNameLen),
            quantity: item.quantity,
            source: "ai_estimate",
          });
        }
      } else if (!parsed.ok && parsed.code === "forbidden_field") {
        // Модель попыталась передать КБЖУ — это нарушение границы.
        throw new Error(
          "Распознавание вернуло запрещённые поля — попробуйте ещё раз.",
        );
      }
      // Пустой блок {"action":"logMeal","items":[]} валиден — items остаётся [].
    }

    return { items, raw };
  },
});

/** Экспорт для тестов: какие поля модель не может передавать. */
export { FORBIDDEN_NUTRITION_FIELDS };
