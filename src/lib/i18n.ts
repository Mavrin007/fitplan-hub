/**
 * Единый словарь UI-строк: метки приёмов пищи, дни недели, инвентарь и юниты.
 * Точечно, без полного i18n-фреймворка: это «единая точка правды» для строк,
 * которые повторяются в интерфейсе, чтобы хардкод не расходился между страницами.
 *
 * Логика и данные не зависят от этого модуля — он пере-экспортирует label-карты
 * из доменных модулей (nutrition, workoutData) и добавляет общие юниты.
 */

import type { Equipment } from "./workoutData";
import type { MealType } from "./mealData";
import {
  ACTIVITY_LABELS,
  EXPERIENCE_LABELS,
  GENDER_LABELS,
  GOAL_LABELS,
  LIMITATION_LABELS,
  TRAINING_STYLE_LABELS,
} from "./nutrition";

export {
  ACTIVITY_LABELS,
  EXPERIENCE_LABELS,
  GENDER_LABELS,
  GOAL_LABELS,
  LIMITATION_LABELS,
  TRAINING_STYLE_LABELS,
};

/** Метки приёмов пищи для интерфейса меню. */
export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: "Завтрак",
  lunch: "Обед",
  dinner: "Ужин",
  snack: "Перекус",
};

/** Короткие названия дней недели для недельного меню (0 = понедельник). */
export const WEEKDAY_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] as const;

/** Алиас для дней недели в тренировках (0 = понедельник) — тот же массив,
 *  чтобы не было двух независимых списков «Пн…Вс». */
export const WEEKDAYS: readonly string[] = WEEKDAY_SHORT;

/** Человекочитаемые названия инвентаря. */
export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  barbell: "Штанга",
  dumbbell: "Гантели",
  machine: "Тренажёры",
  cable: "Блоки",
  kettlebell: "Гиря",
  bodyweight: "Собственный вес",
};

/** Общие юниты для форматирования чисел в UI. */
export const UNITS = {
  kcal: "ккал",
  g: "г",
  kg: "кг",
  ml: "мл",
  l: "л",
  min: "мин",
  sec: "с",
  times: "раз",
} as const;
