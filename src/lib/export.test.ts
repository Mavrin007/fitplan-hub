/**
 * Юнит-тесты CSV-экспорта (src/lib/export.ts) без реального скачивания:
 * захватываем Blob, который функция передаёт в URL.createObjectURL, и мокаем
 * клик по ссылке. Проверяем то, что видит пользователь в файле: заголовки,
 * экранирование спецсимволов (Excel-разделитель «;», десятичная запятая,
 * удвоение кавычек), разворачивание упражнений и имя файла.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  exportMeals,
  exportWeights,
  exportWorkouts,
  exportWater,
  exportFoods,
} from "./export";

let capturedBlob: Blob | null = null;
let clickedAnchor: HTMLAnchorElement | null = null;

beforeEach(() => {
  capturedBlob = null;
  clickedAnchor = null;
  vi.spyOn(URL, "createObjectURL").mockImplementation(
    (obj: Blob | MediaSource) => {
      capturedBlob = obj as Blob;
      return "blob:fake";
    },
  );
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  // Захватываем ссылку при добавлении в body — оттуда берём имя файла.
  // Оригинальный appendChild вызываем: download() затем делает removeChild(a),
  // и узел обязан реально лежать в body.
  const append = document.body.appendChild.bind(document.body);
  vi.spyOn(document.body, "appendChild").mockImplementation(function (node: Node) {
    if (node instanceof HTMLAnchorElement) clickedAnchor = node;
    return append(node);
  });
  // jsdom не навигирует по <a download> — заглушка вместо «Not implemented».
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Сырой текст файла, включая UTF-8 BOM (если он есть). */
async function rawText(): Promise<string> {
  expect(capturedBlob).not.toBeNull();
  return await capturedBlob!.text();
}

/** Текст созданного файла без UTF-8 BOM (префикс для Excel). */
async function csvText(): Promise<string> {
  return (await rawText()).replace(/^\uFEFF/, "");
}

function downloadedFilename(): string {
  expect(clickedAnchor).not.toBeNull();
  return clickedAnchor!.download;
}

describe("Excel-совместимость", () => {
  it("файл начинается с UTF-8 BOM — Excel читает кириллицу без «кракозябр»", async () => {
    exportWeights([{ date: "2026-08-01", weightKg: 80 }]);
    expect(capturedBlob).not.toBeNull();
    const bytes = new Uint8Array(await capturedBlob!.arrayBuffer());
    // EF BB BF — байты UTF-8 BOM. Через blob.text() его не увидеть:
    // алгоритм UTF-8 decode по спецификации снимает ведущий BOM.
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it("точки в текстовых полях (названия продуктов) не превращаются в запятые", async () => {
    exportMeals([
      {
        date: "2026-08-04",
        mealType: "lunch",
        name: "Чай. Липтон",
        quantity: 1,
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
      },
    ]);
    expect(await csvText()).toContain("Чай. Липтон");
  });

  it("десятичная запятая — только у чисел (даты и целые не меняются)", async () => {
    exportWeights([
      { date: "2026-08-01", weightKg: 80.5 },
      { date: "2026-08-04", weightKg: 79 },
    ]);
    expect(await csvText()).toBe(
      "Дата;Вес (кг)\n2026-08-01;80,5\n2026-08-04;79",
    );
  });
});

describe("exportWeights", () => {
  it("пишет заголовки и веса с десятичной запятой, имя файла — kilo-вес-дата.csv", async () => {
    exportWeights([
      { date: "2026-08-01", weightKg: 80.5 },
      { date: "2026-08-04", weightKg: 79 },
    ]);
    expect(await csvText()).toBe(
      "Дата;Вес (кг)\n2026-08-01;80,5\n2026-08-04;79",
    );
    expect(downloadedFilename()).toMatch(/^kilo-вес-\d{4}-\d{2}-\d{2}\.csv$/);
    // Blob создан и URL освобождён после скачивания.
    expect(capturedBlob!.type).toContain("text/csv");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fake");
  });

  it("пустой список — файл без строк CSV (только BOM)", async () => {
    exportWeights([]);
    expect(await csvText()).toBe("");
  });
});

describe("exportMeals", () => {
  it("пишет дневник питания: дата, приём, продукт, порции, ккал, БЖУ", async () => {
    exportMeals([
      {
        date: "2026-08-04",
        mealType: "lunch",
        name: "Куриная грудка",
        quantity: 1.5,
        calories: 247.5,
        protein: 40,
        carbs: 0,
        fat: 10,
      },
    ]);
    expect(await csvText()).toBe(
      "Дата;Приём;Продукт;Порций;ккал;Белки (г);Углеводы (г);Жиры (г)\n" +
        "2026-08-04;lunch;Куриная грудка;1,5;247,5;40;0;10",
    );
  });

  it("экранирует кавычки (удвоение), точку с запятой и перевод строки", async () => {
    exportMeals([
      {
        date: "2026-08-04",
        mealType: "snack",
        name: 'Обед "VIP"; большой\nвторой',
        quantity: 1,
        calories: 100,
        protein: 5,
        carbs: 10,
        fat: 2,
      },
    ]);
    expect(await csvText()).toContain('"Обед ""VIP""; большой\nвторой"');
  });
});

describe("exportWorkouts", () => {
  it("разворачивает упражнения в строки и пропускает тренировки без упражнений", async () => {
    exportWorkouts([
      {
        date: "2026-08-01",
        workoutName: "Жимовая",
        exercises: [
          { name: "Жим лёжа", sets: 4, reps: 8, weightKg: 40 },
          { name: "Махи в стороны", sets: 3, reps: 15, weightKg: 5 },
        ],
      },
      { date: "2026-08-03", workoutName: "Тяговая", exercises: [] },
    ]);
    const csv = await csvText();
    const lines = csv.split("\n");
    expect(lines).toHaveLength(3); // заголовок + 2 упражнения
    expect(lines[0]).toBe(
      "Дата;Тренировка;Упражнение;Подходы;Повторы;Вес (кг)",
    );
    expect(lines[1]).toBe("2026-08-01;Жимовая;Жим лёжа;4;8;40");
    expect(csv).not.toContain("Тяговая");
  });

  it("интеграция: вес 42,5 кг и название тренировки с точкой с запятой в одном файле", async () => {
    // Один прогон закрывает обе Excel-совместимости сразу: дробный вес
    // превращается в «42,5» (десятичная запятая), а название с «;» —
    // уходит в кавычки с удвоением. Если бы запятая применялась к текстам
    // (баг «Чай. Липтон → Чай, Липтон») или экранирование сломалось —
    // строка не совпала бы целиком.
    exportWorkouts([
      {
        date: "2026-08-02",
        workoutName: "Тяга; круговая",
        exercises: [
          { name: "Тяга в наклоне", sets: 4, reps: 8, weightKg: 42.5 },
        ],
      },
    ]);
    expect(await csvText()).toBe(
      "Дата;Тренировка;Упражнение;Подходы;Повторы;Вес (кг)\n" +
        '2026-08-02;"Тяга; круговая";Тяга в наклоне;4;8;42,5',
    );
  });
});

describe("exportWater", () => {
  it("пишет дату и дневной итог воды, имя файла — kilo-вода-дата.csv", async () => {
    exportWater([
      { date: "2026-08-05", amountMl: 1750 },
      { date: "2026-08-06", amountMl: 2000 },
    ]);
    expect(await csvText()).toBe(
      "Дата;Вода (мл)\n2026-08-05;1750\n2026-08-06;2000",
    );
    expect(downloadedFilename()).toMatch(/^kilo-вода-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});

describe("exportFoods", () => {
  it("пишет название, порцию с единицей и БЖУ своих продуктов", async () => {
    exportFoods([
      {
        name: "Творог 5%; жирный",
        amount: 150,
        unit: "г",
        calories: 165,
        protein: 20,
        carbs: 4,
        fat: 7,
      },
    ]);
    expect(await csvText()).toBe(
      "Название;Порция;Ед.;ккал;Белки (г);Углеводы (г);Жиры (г)\n" +
        '"Творог 5%; жирный";150;г;165;20;4;7',
    );
    expect(downloadedFilename()).toMatch(
      /^kilo-продукты-\d{4}-\d{2}-\d{2}\.csv$/,
    );
  });
});
