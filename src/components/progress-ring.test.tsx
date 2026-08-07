import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProgressRing } from "./progress-ring";
import { MacroRing } from "./macro-ring";

/** Продвигает кадры (rAF-стаб = setTimeout 0): точка на кончике появляется
 *  с delay + 0.8 с, поэтому ждём больше секунды реального времени. */
async function advanceFrames(ms = 1300) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

/** Последний <circle> в SVG — это точка на кончике дуги. */
function tipDot(container: HTMLElement): SVGCircleElement {
  const circles = container.querySelectorAll("svg circle");
  return circles[circles.length - 1] as SVGCircleElement;
}

describe("ProgressRing", () => {
  it("показывает процент от цели в aria-label", () => {
    render(<ProgressRing value={50} max={100} />);
    expect(screen.getByRole("img", { name: "50% от цели" })).toBeInTheDocument();
  });

  it("рендерит градиентные id (linearGradient + radialGradient) и ссылается на них", () => {
    const { container } = render(<ProgressRing value={50} max={100} />);
    const svg = container.querySelector("svg")!;

    const grad = svg.querySelector("linearGradient");
    const glow = svg.querySelector("radialGradient");
    expect(grad).not.toBeNull();
    expect(glow).not.toBeNull();
    expect(grad!.id).toMatch(/^ring-grad-/);
    expect(glow!.id).toMatch(/^ring-glow-/);

    // Внутренняя подсветка (fill) ссылается на radialGradient, дуга и ореол
    // (stroke) — на linearGradient: url(#id) не конфликтует в jsdom.
    expect(svg.querySelector(`circle[fill="url(#${glow!.id})"]`)).not.toBeNull();
    const strokes = Array.from(svg.querySelectorAll("circle"));
    expect(strokes.some((c) => c.getAttribute("stroke") === `url(#${grad!.id})`)).toBe(true);
  });

  it("два инстанса получают разные градиентные id (нет конфликта url())", () => {
    const { container } = render(
      <div>
        <ProgressRing value={30} max={100} />
        <ProgressRing value={60} max={100} />
      </div>,
    );
    const ids = Array.from(container.querySelectorAll("linearGradient")).map(
      (g) => g.id,
    );
    expect(ids.length).toBe(2);
    expect(ids[0]).not.toBe(ids[1]);
    // Каждая дуга ссылается на градиент своего кольца, а не чужого.
    for (const id of ids) {
      expect(container.querySelectorAll(`circle[stroke='url(#${id})']`).length).toBeGreaterThan(0);
    }
  });

  it("при 100% точка на кончике видима и сидит на верхней точке дуги", async () => {
    const { container } = render(
      <ProgressRing value={100} max={100} size={96} stroke={8} />,
    );
    const dot = tipDot(container);
    // r = (size - stroke) / 2; при полной дуге кончик возвращается в верхнюю точку.
    expect(parseFloat(dot.getAttribute("cx")!)).toBeCloseTo(48, 5); // float-погрешность
    expect(parseFloat(dot.getAttribute("cy")!)).toBeCloseTo(4, 5); // 48 - 44
    expect(dot.getAttribute("fill")).toBe("var(--brand)");

    await advanceFrames();
    // Точка появилась: opacity-атрибут (не inline-style) = 1.
    expect(dot.getAttribute("opacity")).toBe("1");
  });

  it("при 0% точка на кончике отсутствует (opacity 0)", async () => {
    const { container } = render(
      <ProgressRing value={0} max={100} size={96} stroke={8} />,
    );
    const dot = tipDot(container);

    await advanceFrames();
    // Дуга не рисуется — точка скрыта даже после продвижения кадров.
    expect(dot.getAttribute("opacity")).toBe("0");
    // И по scale остаётся в 0, а не в "none" (как у видимой точки при 100%).
    expect(dot.style.transform).toContain("scale(0)");
  });

  it("при max = 0 показывает 0%", () => {
    render(<ProgressRing value={5} max={0} />);
    expect(screen.getByRole("img", { name: "0% от цели" })).toBeInTheDocument();
  });

  it("при переборе (150/100) сигналит превышение в aria-label", () => {
    render(<ProgressRing value={150} max={100} />);
    expect(screen.getByRole("img", { name: "Превышение на 50%" })).toBeInTheDocument();
  });

  it("при переборе не клампит дугу в aria-label (100% ровно — от цели)", () => {
    render(<ProgressRing value={100} max={100} />);
    expect(screen.getByRole("img", { name: "100% от цели" })).toBeInTheDocument();
  });

  it("при max = 0 показывает 0%", () => {
    render(<ProgressRing value={5} max={0} />);
    expect(screen.getByRole("img", { name: "0% от цели" })).toBeInTheDocument();
  });

  it("рендерит содержимое центра", () => {
    render(
      <ProgressRing value={10} max={100}>
        <span>центр</span>
      </ProgressRing>,
    );
    expect(screen.getByText("центр")).toBeInTheDocument();
  });
});

describe("MacroRing", () => {
  it("показывает значение и целевую дозу в граммах по умолчанию", () => {
    render(<MacroRing label="Белки" value={50} target={100} color="#f00" />);
    expect(screen.getByText("Белки")).toBeInTheDocument();
    expect(screen.getByText("100 г")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "50% от цели" })).toBeInTheDocument();
  });

  it("в режиме percent показывает процент вместо граммов", () => {
    render(
      <MacroRing label="Белки" value={25} target={100} color="#f00" center="percent" />,
    );
    expect(screen.getByText("25%")).toBeInTheDocument();
  });

  it("при target = 0 не делит на ноль (0%)", () => {
    render(<MacroRing label="Белки" value={10} target={0} color="#f00" />);
    expect(screen.getByRole("img", { name: "0% от цели" })).toBeInTheDocument();
  });

  it("при переборе показывает перебор (+100%) и мягкую зелёную подсветку", () => {
    render(<MacroRing label="Белки" value={200} target={100} color="#f00" center="percent" />);
    expect(screen.getByText("+100%")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Превышение на 100%" })).toBeInTheDocument();
    // Перебор макроса не вреден — подсветка мягким зелёным, а не красным.
    const value = screen.getByText("200");
    expect(value.style.color).toBe("var(--macro-over)");
    expect(value.className).not.toContain("text-destructive");
  });

  it("кастомный overColor переопределяет цвет перебора", () => {
    render(
      <MacroRing label="Белки" value={200} target={100} color="#f00" overColor="#0f0" />,
    );
    expect(screen.getByRole("img", { name: "Превышение на 100%" })).toBeInTheDocument();
    // jsdom нормализует hex в rgb() — сравниваем через computed-эквивалент.
    expect(screen.getByText("200").style.color).toBe("rgb(0, 255, 0)");
  });

  it("в режиме target при переборе показывает перебор в граммах (+100 г)", () => {
    render(<MacroRing label="Белки" value={200} target={100} color="#f00" />);
    expect(screen.getByText("+100 г")).toBeInTheDocument();
  });
});
