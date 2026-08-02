/** Экспорт данных пользователя в CSV. Все функции возвращают готовый файл
 *  (Blob) и запускают скачивание — на странице достаточно повесить кнопку.
 */

/** Экранирует значение для CSV: кавычки удваиваются, разделитель — «;»
 *  (Excel в русской локали), дробная часть — запятая. */
function csvCell(value: string | number): string {
  const s = String(value).replace(/\./g, ",");
  if (/[;"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Собирает CSV из строк объектов. Ключи — заголовки, значения — ячейки. */
function toCsv(rows: Record<string, string | number>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(";"),
    ...rows.map((r) => headers.map((h) => csvCell(r[h] ?? "")).join(";")),
  ];
  return lines.join("\n");
}

/** Скачивает текст как файл (UTF-8 с BOM — Excel читает без «кракозябр»). */
function download(filename: string, content: string) {
  const blob = new Blob(["\uFEFF" + content], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Замеры веса: дата, вес. */
export function exportWeights(
  rows: { date: string; weightKg: number }[],
): void {
  download(
    `kilo-вес-${new Date().toISOString().slice(0, 10)}.csv`,
    toCsv(rows.map((w) => ({ Дата: w.date, "Вес (кг)": w.weightKg }))),
  );
}

/** Дневник питания: дата, приём, продукт, порции, ккал, БЖУ. */
export function exportMeals(
  rows: {
    date: string;
    mealType: string;
    name: string;
    quantity: number;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  }[],
): void {
  download(
    `kilo-питание-${new Date().toISOString().slice(0, 10)}.csv`,
    toCsv(
      rows.map((e) => ({
        Дата: e.date,
        "Приём": e.mealType,
        Продукт: e.name,
        "Порций": e.quantity,
        "ккал": e.calories,
        "Белки (г)": e.protein,
        "Углеводы (г)": e.carbs,
        "Жиры (г)": e.fat,
      })),
    ),
  );
}

/** Тренировки: дата, название, упражнение, подходы, повторы, вес. */
export function exportWorkouts(
  rows: {
    date: string;
    workoutName: string;
    exercises: { name: string; sets: number; reps: number; weightKg: number }[];
  }[],
): void {
  const flat: Record<string, string | number>[] = [];
  for (const w of rows) {
    for (const ex of w.exercises) {
      flat.push({
        Дата: w.date,
        Тренировка: w.workoutName,
        Упражнение: ex.name,
        Подходы: ex.sets,
        Повторы: ex.reps,
        "Вес (кг)": ex.weightKg,
      });
    }
  }
  download(
    `kilo-тренировки-${new Date().toISOString().slice(0, 10)}.csv`,
    toCsv(flat),
  );
}
