import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProgressRing } from "./progress-ring";
import { MacroRing } from "./macro-ring";

/** Продвигает кадры: капля появляется с задержкой, ждём больше секунды. */
async function advanceFrames(ms = 1300) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

/** Капля на кончике дуги — motion.circle с data-bead. */
function tipDot(container: HTMLElement): SVGCircleElement {
  return container.querySelector("[data-bead]") as SVGCircleElement;
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

    // Внутренняя подсветка (fill) ссылается на radialGradient, дуга (stroke) —
    // на linearGradient: url(#id) не конфликтует в jsdom.
    expect(svg.querySelector(`circle[fill="url(#${glow!.id})"]`)).not.toBeNull();
    const strokes = Array.from(svg.querySelectorAll("circle"));
    expect(
      strokes.some((c) => c.getAttribute("stroke") === `url(#${grad!.id})`),
    ).toBe(true);

    // Градиент объёма: светлее → базовый → глубже (color-mix из var(--brand)).
    const stops = [...grad!.querySelectorAll("stop")].map((s) =>
      s.getAttribute("stop-color"),
    );
    expect(stops.length).toBe(3);
    expect(stops[1]).toBe("var(--brand)");
    expect(stops[0]).toContain("color-mix");
    expect(stops[2]).toContain("color-mix");
  });

  it("два инстанса получают разные градиентные id (нет конфликта url())", () => {
    const { container } = render(
      <div>
        <ProgressRing value={30} max={100} />
        <ProgressRing value={60} max={100} />
      </div>,
    );
    // Только основные градиенты дуг (без linearGradient отражения).
    const ids = Array.from(container.querySelectorAll("linearGradient"))
      .map((g) => g.id)
      .filter((id) => id.startsWith("ring-grad-"));
    expect(ids.length).toBe(2);
    expect(ids[0]).not.toBe(ids[1]);
    // Каждая дуга ссылается на градиент своего кольца, а не чужого.
    for (const id of ids) {
      expect(
        container.querySelectorAll(`circle[stroke='url(#${id})']`).length,
      ).toBeGreaterThan(0);
    }
  });

  it("при 100% капля сидит на конце дуги (attr-позиция = конец круга)", async () => {
    const { container } = render(
      <ProgressRing value={100} max={100} size={96} stroke={8} />,
    );
    const dot = tipDot(container);
    // r = (size − stroke)/2 = 44; конец полной дуги в системе координат svg —
    // точка (cx + r, cy) = (92, 48); после -rotate-90 она визуально наверху,
    // ровно там, где дуга заканчивается (старый кончик «сидел» мимо дуги).
    expect(parseFloat(dot.getAttribute("cx")!)).toBeCloseTo(92, 5);
    expect(parseFloat(dot.getAttribute("cy")!)).toBeCloseTo(48, 5);
    expect(dot.getAttribute("fill")).toBe("var(--brand)");

    await advanceFrames();
    // Капля появилась: opacity-атрибут = 1.
    expect(dot.getAttribute("opacity")).toBe("1");
  });

  it("tipColor переопределяет цвет капли (макросы при переборе)", async () => {
    const { container } = render(
      <ProgressRing
        value={200}
        max={100}
        size={96}
        stroke={8}
        color="var(--macro-protein)"
        overColor="var(--macro-over)"
        tipColor="var(--macro-protein)"
      />,
    );
    const dot = tipDot(container);
    // Дуга-хвост при переборе зелёная, но капля остаётся в цвете макроса.
    expect(dot.getAttribute("fill")).toBe("var(--macro-protein)");

    await advanceFrames();
    expect(dot.getAttribute("opacity")).toBe("1");
  });

  it("при переборе ореол хвоста пульсирует (opacity-массив) и капля в overColor", async () => {
    const { container } = render(
      <ProgressRing value={150} max={100} size={96} stroke={8} overColor="#0f0" />,
    );
    const halos = container.querySelectorAll("[data-arc-halo]");
    // Полный круг + хвост перебора → два ореола; хвост — второй.
    expect(halos.length).toBe(2);
    const tailHalo = halos[1];

    // Капля на кончике перебора красится цветом перелива (overColor),
    // когда tipColor не задан.
    const dot = tipDot(container);
    expect(dot.getAttribute("fill")).toBe("#0f0");

    // Пульсация: ждём старта анимации хвоста (полный круг рисуется 1.4 c),
    // затем opacity меняется между замерами — ореол «дышит», а не стоит.
    await advanceFrames(1900);
    const first = parseFloat(tailHalo.getAttribute("opacity") ?? "0");
    await advanceFrames(300);
    const second = parseFloat(tailHalo.getAttribute("opacity") ?? "0");
    expect(first).not.toBeCloseTo(second, 2);
  });

  it("при 0% капля не рендерится вовсе", async () => {
    const { container } = render(
      <ProgressRing value={0} max={100} size={96} stroke={8} />,
    );
    expect(container.querySelector("[data-bead]")).toBeNull();
    expect(screen.getByRole("img", { name: "0% от цели" })).toBeInTheDocument();
  });

  /**
   * Контроль к progress-ring.reduced-motion.test.tsx: БЕЗ системного
   * prefers-reduced-motion дуга стартует с пустого состояния — сразу после
   * монтирования dashoffset равен длине окружности (анимация идёт от 0).
   */
  it("контроль: без reduced-motion дуга начинает с пустого (dashoffset = C)", () => {
    const { container } = render(
      <ProgressRing value={50} max={100} size={96} stroke={8} />,
    );
    const arc = container.querySelector("[data-arc]");
    const c = 2 * Math.PI * 44; // ≈ 276.46
    const offset = parseFloat(arc!.getAttribute("stroke-dashoffset") ?? "");
    expect(offset).toBeCloseTo(c, 0);
  });

  /**
   * Контроль капли к progress-ring.reduced-motion.test.tsx: БЕЗ системного
   * prefers-reduced-motion капля стартует уменьшенной (0.7× радиуса) и
   * «вырастает» на пружине — scale-анимация появления. При reduced-motion
   * радиус сразу полный (3.81), а здесь — 2.67.
   */
  it("контроль: без reduced-motion капля стартует с 0.7× радиуса (scale)", () => {
    const { container } = render(
      <ProgressRing value={50} max={100} size={96} stroke={8} />,
    );
    const bead = container.querySelector("[data-bead]") as SVGCircleElement | null;
    expect(bead).not.toBeNull();
    // beadRadius = max(2.5, 8/2.1) ≈ 3.81; 0.7 × 3.81 ≈ 2.67.
    expect(parseFloat(bead!.getAttribute("r") ?? "0")).toBeCloseTo(2.67, 2);
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

  it("при переборе в percent показывает «+100%» и «сверх» двумя строками (как калории)", () => {
    render(<MacroRing label="Белки" value={200} target={100} color="#f00" center="percent" />);
    expect(screen.getByText("+100%")).toBeInTheDocument();
    expect(screen.getByText("сверх")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Превышение на 100%" })).toBeInTheDocument();
    // Перебор макроса не вреден — подсветка мягким зелёным, а не красным.
    const value = screen.getByText("200");
    expect(value.style.color).toBe("var(--macro-over)");
    expect(value.className).not.toContain("text-destructive");
  });

  it("при переборе трек кольца тонируется цветом перебора (выделение тоном)", () => {
    const { container } = render(
      <ProgressRing value={150} max={100} overColor="#0f0" />,
    );
    const track = container.querySelectorAll("svg circle")[1]; // второй круг — трек
    expect(track.getAttribute("stroke")).toBe("#0f0");
    expect(track.getAttribute("stroke-opacity")).toBe("0.3");
    // Хвост второго круга (перелив) рисуется градиентом цвета перебора.
    const arcs = container.querySelectorAll("[data-arc]");
    expect(arcs.length).toBe(2); // полный круг + хвост
    expect(arcs[1].getAttribute("stroke")).toMatch(/^url\(#ring-grad-over-/);
  });

  it("без перебора трек остаётся нейтральным (единый тёмно-серый)", () => {
    const { container } = render(<ProgressRing value={50} max={100} />);
    const track = container.querySelectorAll("svg circle")[1];
    expect(track.getAttribute("stroke")).toBe("rgba(148, 153, 162, 0.42)");
    expect(track.getAttribute("stroke-opacity")).toBe("1");
  });

  it("кастомный overColor переопределяет цвет перебора", () => {
    render(
      <MacroRing label="Белки" value={200} target={100} color="#f00" overColor="#0f0" />,
    );
    expect(screen.getByRole("img", { name: "Превышение на 100%" })).toBeInTheDocument();
    expect(screen.getByText("200").style.color).toBe("rgb(0, 255, 0)");
  });

  it("в режиме target при переборе показывает перебор в граммах (+100 г)", () => {
    render(<MacroRing label="Белки" value={200} target={100} color="#f00" />);
    expect(screen.getByText("+100 г")).toBeInTheDocument();
  });
});
