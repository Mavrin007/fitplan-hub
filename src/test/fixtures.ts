/**
 * Общие фикстуры для компонентных тестов страниц.
 *
 * Типы привязаны к реальной схеме (src/convex/schema.ts): поля валидируются
 * через Infer<typeof …Validator>, поэтому изменение схемы (новое поле,
 * смена типа) немедленно ломает компиляцию тестов, использующих фикстуры.
 * Тип-импорты (`import type`) стираются — рантайм schema.ts в тесты не
 * попадает (за исключением чистого lib/dates, который нужен фабрике waterEntry).
 */
import type {
  FoodFields,
  MealLogEntryFields,
  ProfileFields,
  WaterEntryFields,
  WeightEntryFields,
} from "@/convex/schema";
import type { ActivityDay } from "@/convex/activity";
import { todayKey } from "@/lib/dates";

/** Аргументы мутации water.addWater: дата + объём (без служебных полей). */
export type WaterAddArgs = Pick<WaterEntryFields, "date" | "amountMl">;

/** Поля записи дневника, передаваемые в мутации mealLog (addEntry,
 *  addEntries, updateEntry) — без служебных полей документа. */
export type MealLogArgs = Omit<MealLogEntryFields, "userId" | "createdAt">;

/** Аргументы updateEntry: те же поля + id обновляемой записи (не из схемы). */
export type MealLogUpdateArgs = MealLogArgs & { id: string };

/** Поля продукта для foods.addFood — без служебных полей документа. */
export type FoodArgs = Omit<FoodFields, "userId" | "createdAt">;

// ActivityDay — из convex/activity.ts (реальный тип возврата getActivityDays),
// чтобы изменение агрегации (новое поле и т.п.) ловилось на компиляции.
export type { ActivityDay };

/** Профиль: рост 180, вес 80, цель — похудение. Цель по калориям ~2345 ккал.
 *  userId — брендированный Id<"users">, фикстура использует поддельный. */
export const profile: ProfileFields = {
  userId: "u1" as unknown as ProfileFields["userId"],
  age: 30,
  gender: "male",
  heightCm: 180,
  weightKg: 80,
  targetWeightKg: 75,
  activityLevel: "moderate",
  fitnessGoal: "lose_weight",
  experienceLevel: "intermediate",
  updatedAt: 0,
};

/** В фикстурах userId — обычная строка: реальный тип Id<"users"> в тестовых
 *  литералах только шумел бы, а страницы поле не читают. Остальные поля —
 *  строго из схемы. */
export type FixtureUserId = string;

/** Запись дневника питания (mealLog) — поля схемы + _id документа. */
export type MealEntry = Omit<MealLogEntryFields, "userId"> & {
  _id: string;
  userId: FixtureUserId;
};

/** Запись взвешивания (weightEntries) — поля схемы + _id документа. */
export type WeightEntry = Omit<WeightEntryFields, "userId"> & {
  _id: string;
  userId: FixtureUserId;
};

/** Пользовательский продукт (foods) — поля схемы + _id документа. */
export type FoodEntry = Omit<FoodFields, "userId"> & {
  _id: string;
  userId: FixtureUserId;
};

/** Дневная запись воды (waterEntries) — поля схемы + _id документа. */
export type WaterEntry = Omit<WaterEntryFields, "userId"> & {
  _id: string;
  userId: FixtureUserId;
};

/** Запись воды за дату (по умолчанию — сегодня): amountMl = дневной итог.
 *  `id` можно переопределить, если в одном тесте нужно несколько записей. */
export function waterEntry(
  amountMl: number,
  date: string = todayKey(),
  id: string = "water-1",
): WaterEntry {
  return { _id: id, userId: "u1", date, amountMl, createdAt: 0 };
}
