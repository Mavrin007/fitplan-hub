/**
 * Чистые форматирующие хелперы страницы «Питание» (вынесены из Meals.tsx).
 * Никакого React/UI — только строки и простые вычисления, покрыты тестами.
 */

import type { Targets } from "@/lib/nutrition";

/** Форматирует примерную цену блюда/дня в BYN: «≈ 5,40 byn». */
export function formatPrice(byn: number): string {
  return `≈ ${byn.toFixed(2).replace(".", ",")} byn`;
}

/** Тон «соответствия цели»: зелёный в пределах 10%, янтарный до 20%, иначе красный. */
export function fitTone(drift: number): string {
  if (drift <= 0.1) return "text-emerald-600 dark:text-emerald-400";
  if (drift <= 0.2) return "text-amber-600 dark:text-amber-400";
  return "text-destructive";
}

/** Допустимые в числовом поле символы: цифры, запятая, точка. */
export const DECIMAL_INPUT = (v: string): string => v.replace(/[^\d.,]/g, "");

/**
 * «Что осталось после добавления» — короткая строка для тоста: калории и
 * белок против целей дня. Отвечает на вопрос «сколько осталось» в момент
 * записи, не заставляя возвращаться к сводке.
 */
export function remainingHint(
  totals: { calories: number; protein: number },
  targets: Targets,
  added: { calories: number; protein: number },
): string {
  const calLeft = Math.round(targets.calories - totals.calories - added.calories);
  const proteinLeft = Math.round(
    targets.protein - totals.protein - added.protein,
  );
  const cal =
    calLeft > 0
      ? `осталось ${calLeft.toLocaleString("ru-RU")} ккал`
      : calLeft === 0
        ? "дневная норма ккал закрыта"
        : `перебор ${Math.abs(calLeft).toLocaleString("ru-RU")} ккал`;
  const prot =
    proteinLeft > 0
      ? `белка ещё ${proteinLeft} г`
      : proteinLeft === 0
        ? "белок набран"
        : "";
  return prot ? `${cal} · ${prot}` : cal;
}
