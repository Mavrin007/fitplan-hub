/**
 * Фото-распознавание еды: клиентская обвязка вокруг photo.analyzeMealPhoto.
 *
 * Принцип: результат распознавания — ВСЕГДА ОЦЕНКА (ai_estimate), а не точное
 * измерение. Макросы пересчитываются здесь же через тот же pure-модуль, что
 * и на сервере (convex/assistant/nutrition.ts), чтобы предпросмотр совпадал
 * с записью. В дневник распознанное попадает ТОЛЬКО после подтверждения
 * пользователем (флоу ревью: изменить продукт/количество, удалить лишнее).
 */

import { resolveOrEstimate } from "@/convex/assistant/nutrition";
import { scalePortion, quantityToStore } from "@/convex/assistant/nutrition";
import type { MacroValues } from "@/convex/assistant/nutrition";
import { LIMITS } from "@/convex/assistant/commands";

/** Один распознанный пункт, готовый к ревью. */
export interface PhotoReviewItem {
  key: string;
  name: string;
  quantity: number;
  macros: MacroValues;
  isEstimate: boolean;
  source: "ai_estimate";
}

/** Форма ответа photo.analyzeMealPhoto (после серверной валидации). */
export interface RecognizedPhotoItem {
  name: string;
  quantity: number;
  source: "ai_estimate";
}

/** Читает файл как data URL (превью + отправка на распознавание). */
export function readPhotoFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Не удалось прочитать файл."));
    reader.readAsDataURL(file);
  });
}

/** Лимит размера на клиенте: не тащим в память фото, которое сервер всё
 *  равно отклонит (>2.5 МБ base64 ≈ 1.9 МБ бинарных). */
export const MAX_PHOTO_BYTES = 1_900_000;

export function photoFileError(file: File): string | null {
  if (!file.type.startsWith("image/")) {
    return "Выберите файл изображения (JPEG/PNG/WebP).";
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return "Фото слишком большое — выберите файл до 2 МБ.";
  }
  return null;
}

/**
 * Собирает пункты для ревью из ответа распознавания: макросы считаются
 * приложением по названию (verified-источник если найден, иначе оценка).
 * Сам факт распознавания по фото помечает пункт как ai_estimate.
 */
export function buildPhotoReviewItems(
  recognized: RecognizedPhotoItem[],
): PhotoReviewItem[] {
  return recognized.map((item, i) => {
    const nutrition = resolveOrEstimate(item.name, []);
    const macros = scalePortion(nutrition, item.quantity, undefined);
    const quantity = quantityToStore(nutrition, item.quantity, undefined);
    return {
      key: `${i}-${item.name}`,
      name: nutrition.name.slice(0, LIMITS.maxNameLen),
      quantity,
      macros,
      isEstimate: true,
      source: "ai_estimate",
    };
  });
}
