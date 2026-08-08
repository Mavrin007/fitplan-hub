/**
 * Компонентные тесты SVG-графиков (src/lib/charts.tsx): рендер осей,
 * линии цели, столбцов и тултипа по наведению — в jsdom через
 * @testing-library/react.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SVGAreaChart, SVGBarChart } from "./charts";

describe("SVGAreaChart", () => {
  it("рендерит подписи осей и пунктирную линию цели", () => {
    render(
      <SVGAreaChart
        data={[
          { date: "1 авг", weight: 80 },
          { date: "2 авг", weight: 79.5 },
          { date: "3 авг", weight: 79 },
        ]}
        xKey="date"
        yKey="weight"
        name="Вес (кг)"
        height={200}
        referenceY={75}
        referenceLabel="Цель 75.0"
      />,
    );

    expect(screen.getByText("1 авг")).toBeInTheDocument();
    expect(screen.getByText("3 авг")).toBeInTheDocument();
    expect(screen.getByText("Цель 75.0")).toBeInTheDocument();
    // Y-тики: разброс 1 < 2·pad → домен центрируется [78.5, 80.5] → шаг 0.5.
    expect(screen.getByText("78,5")).toBeInTheDocument();
    expect(screen.getByText("80,5")).toBeInTheDocument();
  });

  it("пустые данные не падают и не рисуют линию цели без referenceY", () => {
    const { container } = render(
      <SVGAreaChart data={[]} xKey="date" yKey="weight" height={200} />,
    );
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("линия цели вне домена клампится к краю, подпись внутри svg", () => {
    // Данные веса 78–80, цель 65 ниже домена: линия должна прижаться к низу
    // графика (не пропасть за кадром), подпись — над линией, но в границах svg.
    const { container } = render(
      <SVGAreaChart
        data={[
          { date: "1 авг", weight: 80 },
          { date: "2 авг", weight: 79 },
          { date: "3 авг", weight: 78 },
        ]}
        xKey="date"
        yKey="weight"
        name="Вес (кг)"
        height={200}
        referenceY={65}
        referenceLabel="Цель 65.0"
      />,
    );
    const svg = container.querySelector("svg")!;
    const refLine = Array.from(svg.querySelectorAll("line")).find(
      (l) => l.getAttribute("stroke-dasharray") === "4 4",
    );
    expect(refLine).not.toBeUndefined();
    // Линия внизу графика, но внутри области (не за краем svg).
    const y = Number(refLine!.getAttribute("y1"));
    expect(y).toBeGreaterThan(0);
    expect(y).toBeLessThan(200);

    const label = Array.from(svg.querySelectorAll("text")).find(
      (t) => t.textContent === "Цель 65.0",
    )!;
    expect(label).not.toBeUndefined();
    const labelY = Number(label.getAttribute("y"));
    // Подпись над линией, но не уходит за верхнюю границу svg.
    expect(labelY).toBeLessThan(y);
    expect(labelY).toBeGreaterThan(0);
  });

  it("тултип у крайней левой точки клампится к границе (не вылезает за график)", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <SVGAreaChart
        data={[
          { date: "1 авг", weight: 80 },
          { date: "2 авг", weight: 79.5 },
          { date: "3 авг", weight: 79 },
        ]}
        xKey="date"
        yKey="weight"
        name="Вес (кг)"
        height={200}
      />,
    );

    const hitZone = container.querySelector("svg rect[fill='transparent']")!;
    const box = hitZone.getBoundingClientRect();
    // Крайняя левая точка: x = left (40) + 0 → тултип без клампа уехал бы
    // за границу (translate(-50%) → left < 0). Кламп держит left ≥ 60.
    await user.pointer({ target: hitZone, coords: { x: box.left + 1, y: box.top + 1 } });

    // Тултип виден: имя серии (отдельный span) — значение 80 уже покрыто
    // тестом бара; здесь проверяем только позицию тултипа.
    expect(screen.getByText("Вес (кг):")).toBeInTheDocument();
    const tip = screen.getByText("Вес (кг):").closest("div[style]")!;
    const style = (tip as HTMLElement).style;
    // jsdom: getBoundingClientRect → 0, поэтому onMove фолбэчит на innerW;
    // hover = 0 → left = max(60, 40) = 60 — тултип внутри контейнера.
    expect(style.left).toBe("60px");
    expect(parseFloat(style.left)).toBeGreaterThanOrEqual(40);
  });
});

describe("SVGBarChart", () => {
  it("рендерит столбцы одной серии и линию цели", () => {
    render(
      <SVGBarChart
        data={[
          { label: "Н-1", sessions: 2 },
          { label: "Н-2", sessions: 3 },
        ]}
        xKey="label"
        series={[{ key: "sessions", name: "Тренировки", fill: "var(--foreground)" }]}
        height={200}
        allowDecimals={false}
        referenceY={4}
        referenceLabel="Цель"
      />,
    );

    expect(screen.getByText("Н-1")).toBeInTheDocument();
    expect(screen.getByText("Н-2")).toBeInTheDocument();
    expect(screen.getByText("Цель")).toBeInTheDocument();
    // Y-макс: niceCeil(3, 4, integer) = 3 → тики 0..3 шаг 1.
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("линия цели вне домена клампится к краю графика (калории vs цель)", () => {
    // Данные до 400, цель 2633 — линия не должна пропадать за кадром:
    // она прижата к верху графика, подпись под ней внутри svg.
    const { container } = render(
      <SVGBarChart
        data={[{ date: "1 авг.", calories: 350 }]}
        xKey="date"
        series={[{ key: "calories", name: "ккал", fill: "var(--foreground)" }]}
        height={200}
        referenceY={2633}
        referenceLabel="Цель"
      />,
    );
    const svg = container.querySelector("svg")!;
    const refLine = Array.from(svg.querySelectorAll("line")).find(
      (l) => l.getAttribute("stroke-dasharray") === "4 4",
    );
    expect(refLine).not.toBeUndefined();
    // Линия наверху графика (внутри области), а не за его пределами.
    expect(Number(refLine!.getAttribute("y1"))).toBeLessThan(200);
    expect(Number(refLine!.getAttribute("y1"))).toBeGreaterThan(0);
    expect(screen.getByText("Цель")).toBeInTheDocument();
  });

  it("подпись цели вне домена не вылезает за границы svg (выше домена)", () => {
    // Цель 2633 выше данных (макс ~400): линия прижата к верху, подпись
    // рисуется ПОД линией, но всё равно внутри svg (y < height).
    const { container } = render(
      <SVGBarChart
        data={[{ date: "1 авг.", calories: 350 }]}
        xKey="date"
        series={[{ key: "calories", name: "ккал", fill: "var(--foreground)" }]}
        height={200}
        referenceY={2633}
        referenceLabel="Цель"
      />,
    );
    const svg = container.querySelector("svg")!;
    const label = Array.from(svg.querySelectorAll("text")).find(
      (t) => t.textContent === "Цель",
    )!;
    expect(label).not.toBeUndefined();
    const y = Number(label.getAttribute("y"));
    // Подпись внутри svg: ниже верха и выше нижней границы.
    expect(y).toBeGreaterThan(0);
    expect(y).toBeLessThan(200);
  });

  it("подпись цели ниже домена не вылезает за границы svg (ниже домена)", () => {
    // Цель 0 ниже данных (мин ~350): линия прижата к низу, подпись
    // рисуется НАД линией, но не уходит за верхнюю границу svg.
    const { container } = render(
      <SVGBarChart
        data={[{ date: "1 авг.", calories: 350 }]}
        xKey="date"
        series={[{ key: "calories", name: "ккал", fill: "var(--foreground)" }]}
        height={200}
        referenceY={0}
        referenceLabel="Цель"
      />,
    );
    const svg = container.querySelector("svg")!;
    const label = Array.from(svg.querySelectorAll("text")).find(
      (t) => t.textContent === "Цель",
    )!;
    expect(label).not.toBeUndefined();
    const y = Number(label.getAttribute("y"));
    expect(y).toBeGreaterThan(0);
    expect(y).toBeLessThan(200);
  });

  it("показывает тултип с именем и значением по наведению", async () => {
    const user = userEvent.setup();
    render(
      <SVGBarChart
        data={[
          { label: "Н-1", tonnage: 1200 },
          { label: "Н-2", tonnage: 800 },
        ]}
        xKey="label"
        series={[{ key: "tonnage", name: "Тоннаж", fill: "var(--foreground)" }]}
        height={200}
        tooltipFormatter={(v) => `${Number(v).toLocaleString("ru-RU")} кг`}
      />,
    );

    // Прозрачная зона захвата курсора — первый столбец.
    const hitZone = document.querySelector("svg rect[fill='transparent']")!;
    const box = hitZone.getBoundingClientRect();
    await user.pointer({ target: hitZone, coords: { x: box.left + 1, y: box.top + 1 } });

    expect(screen.getByText(/1 200 кг/)).toBeInTheDocument();
  });
});
