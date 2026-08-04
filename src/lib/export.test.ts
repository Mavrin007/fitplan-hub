import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  exportWeights,
  exportMeals,
  exportWorkouts,
} from "./export";

// Перехватываем скачивание: download() создаёт <a download href=blob:...> и кликает.
function captureDownload(): { filename: string; content: string }[] {
  const captured: { filename: string; content: string }[] = [];
  const blobs = new Map<string, Blob>();
  vi.stubGlobal(
    "URL",
    class {
      static createObjectURL(b: Blob) {
        const url = `blob:captured-${captured.length}`;
        blobs.set(url, b);
        return url;
      }
      static revokeObjectURL() {}
    },
  );
  const origClick = HTMLAnchorElement.prototype.click;
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    const blob = blobs.get(this.href);
    if (blob) {
      blob.arrayBuffer().then((buf) => {
        captured.push({
          filename: this.download,
          content: new TextDecoder("utf-8", { ignoreBOM: true }).decode(buf),
        });
      });
    }
    return origClick.call(this);
  });
  return captured;
}

async function flush() {
  await Promise.resolve();
  await new Promise((r) => setTimeout(r, 10));
}

describe("экспорт CSV (smoke)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("вес: заголовки, дробная запятая, BOM", async () => {
    const captured = captureDownload();
    exportWeights([
      { date: "2026-08-01", weightKg: 80.5 },
      { date: "2026-08-04", weightKg: 79.25 },
    ]);
    await flush();
    expect(captured).toHaveLength(1);
    expect(captured[0].filename).toMatch(/^kilo-вес-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(captured[0].content.startsWith("\uFEFF")).toBe(true);
    expect(captured[0].content).toBe(
      "\uFEFFДата;Вес (кг)\n2026-08-01;80,5\n2026-08-04;79,25",
    );
  });

  it("питание: кавычки и разделители экранируются", async () => {
    const captured = captureDownload();
    exportMeals([
      {
        date: "2026-08-04",
        mealType: "Завтрак",
        name: 'Овсянка "с ягодами"; 100г',
        quantity: 1,
        calories: 350,
        protein: 12.5,
        carbs: 60,
        fat: 8,
      },
    ]);
    await flush();
    expect(captured).toHaveLength(1);
    const body = captured[0].content.replace(/^\uFEFF/, "");
    expect(body).toContain("Дата;Приём;Продукт;Порций;ккал;Белки (г);Углеводы (г);Жиры (г)");
    expect(captured[0].content.startsWith("\uFEFF")).toBe(true);
    // Кавычки удваиваются, содержимое в кавычках из-за «;»
    expect(body).toContain('"Овсянка ""с ягодами""; 100г"');
    expect(body).toContain("12,5");
  });

  it("тренировки: строки по упражнениям", async () => {
    const captured = captureDownload();
    exportWorkouts([
      {
        date: "2026-08-03",
        workoutName: "День ног",
        exercises: [
          { name: "Приседания", sets: 3, reps: 8, weightKg: 60 },
          { name: "Выпады", sets: 3, reps: 12, weightKg: 0 },
        ],
      },
    ]);
    await flush();
    expect(captured).toHaveLength(1);
    const body = captured[0].content.replace(/^\uFEFF/, "");
    expect(captured[0].content.startsWith("\uFEFF")).toBe(true);
    const lines = body.split("\n");
    expect(lines[0]).toBe("Дата;Тренировка;Упражнение;Подходы;Повторы;Вес (кг)");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe("2026-08-03;День ног;Приседания;3;8;60");
    expect(lines[2]).toBe("2026-08-03;День ног;Выпады;3;12;0");
  });

  it("пустые данные: файл без ошибок, только BOM", async () => {
    const captured = captureDownload();
    exportWeights([]);
    await flush();
    expect(captured).toHaveLength(1);
    expect(captured[0].content.startsWith("\uFEFF")).toBe(true);
  });
});
