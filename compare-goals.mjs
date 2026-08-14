import { generateWeeklyMealPlan } from "./src/lib/mealLibrary.ts";
import { computeTargets } from "./src/lib/nutrition.ts";

const profile = {
  age: 30,
  gender: "male",
  heightCm: 178,
  weightKg: 80,
  activityLevel: "moderate",
  fitnessGoal: "maintain",
};

const targets = computeTargets(profile);
console.log("Targets (maintain profile):", JSON.stringify(targets));

const goals = ["lose_weight", "maintain", "gain_muscle", "improve_endurance", "strength"];

const plans = {};
for (const g of goals) {
  const plan = generateWeeklyMealPlan(g, targets);
  plans[g] = plan.days;
}

// Day 0 comparison: dish names per meal
console.log("\n=== DAY 0 (today) per goal ===");
for (const g of goals) {
  const day = plans[g][0];
  const names = day.meals.map((m) => `[${m.mealType}] ${m.name} (${m.calories} ккал)`);
  console.log(`\n--- ${g} (${day.calories} ккал, Б${day.protein}/У${day.carbs}/Ж${day.fat}) ---`);
  for (const n of names) console.log("  " + n);
}

// Full-week dish sets per goal
console.log("\n=== FULL WEEK dish names per goal ===");
for (const g of goals) {
  const set = new Set();
  for (const d of plans[g]) {
    for (const m of d.meals) set.add(m.name);
  }
  console.log(`\n--- ${g}: ${set.size} unique dishes ---`);
  console.log("  " + [...set].sort().join(" | "));
}

// Pairwise identical days between goals
console.log("\n=== Pairwise identical day0 menus between goals ===");
function dayKey(day) {
  return day.meals.map((m) => `${m.mealType}:${m.name}:${m.calories}`).join(";");
}
for (let i = 0; i < goals.length; i++) {
  for (let j = i + 1; j < goals.length; j++) {
    const same = plans[goals[i]][0].meals.map((m, idx) => m.name === plans[goals[j]][0].meals[idx]?.name);
    const allSame = same.every(Boolean);
    const sameCal = plans[goals[i]][0].calories === plans[goals[j]][0].calories;
    console.log(`${goals[i]} vs ${goals[j]}: dishes identical=${allSame}, calories same=${sameCal} (${plans[goals[i]][0].calories} vs ${plans[goals[j]][0].calories})`);
  }
}
