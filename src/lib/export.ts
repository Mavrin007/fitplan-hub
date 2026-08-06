/** Экспорт данных пользователя в CSV. Все функции возвращают готовый файл
 *  (Blob) и запускают скачивание — на странице достаточно повесить кнопку.
 */

/** Экранирует значение для CSV: кавычки удваиваются, разделитель — «;»
 *  (Excel в русской локали), дробная часть — запятая. Десятичная запятая
 *  применяется ТОЛЬКО к числам: точки в текстах (названия продуктов, даты)
 *  не трогаем — иначе «Чай. Липтон» превратится в «Чай, Липтон». */
function csvCell(value: string | number): string {
  const s =
    typeof value === "number"
      ? String(value).replace(/\./g, ",")
      : String(value);
  if (/[;"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Собирает CSV из строк объектов. Заголовки передаются явно и пишутся
 *  всегда — даже при нуле записей пользователь видит пустой файл с
 *  колонками, а не «пустоту» из одного BOM. Колонки детерминированы:
 *  порядок не зависит от порядка ключей в объекте. */
function toCsv(
  headers: string[],
  rows: Record<string, string | number>[],
): string {
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
    toCsv(
      ["Дата", "Вес (кг)"],
      rows.map((w) => ({ Дата: w.date, "Вес (кг)": w.weightKg })),
    ),
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
      ["Дата", "Приём", "Продукт", "Порций", "ккал", "Белки (г)", "Углеводы (г)", "Жиры (г)"],
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
    toCsv(
      ["Дата", "Тренировка", "Упражнение", "Подходы", "Повторы", "Вес (кг)"],
      flat,
    ),
  );
}

/** Вода: дата, итог за день (мл). Одна строка на дату — как в таблице. */
export function exportWater(rows: { date: string; amountMl: number }[]): void {
  download(
    `kilo-вода-${new Date().toISOString().slice(0, 10)}.csv`,
    toCsv(
      ["Дата", "Вода (мл)"],
      rows.map((w) => ({ Дата: w.date, "Вода (мл)": w.amountMl })),
    ),
  );
}

/** Свои продукты: название, порция и единица, ккал, БЖУ. */
export function exportFoods(
  rows: {
    name: string;
    amount: number;
    unit: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  }[],
): void {
  download(
    `kilo-продукты-${new Date().toISOString().slice(0, 10)}.csv`,
    toCsv(
      ["Название", "Порция", "Ед.", "ккал", "Белки (г)", "Углеводы (г)", "Жиры (г)"],
      rows.map((f) => ({
        Название: f.name,
        "Порция": f.amount,
        "Ед.": f.unit,
        "ккал": f.calories,
        "Белки (г)": f.protein,
        "Углеводы (г)": f.carbs,
        "Жиры (г)": f.fat,
      })),
    ),
  );
}
