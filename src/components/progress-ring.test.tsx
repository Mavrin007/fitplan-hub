import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProgressRing } from "./progress-ring";
import { MacroRing } from "./macro-ring";

describe("ProgressRing", () => {
  it("показывает процент от цели в aria-label", () => {
    render(<ProgressRing value={50} max={100} />);
    expect(screen.getByRole("img", { name: "50% от цели" })).toBeInTheDocument();
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

  it("при переборе показывает перебор (+100%) и красную подсветку", () => {
    render(<MacroRing label="Белки" value={200} target={100} color="#f00" center="percent" />);
    expect(screen.getByText("+100%")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Превышение на 100%" })).toBeInTheDocument();
    // Значение в центре подсвечивается красным (деструктивный цвет).
    expect(screen.getByText("200").className).toContain("text-destructive");
  });

  it("в режиме target при переборе показывает перебор в граммах (+100 г)", () => {
    render(<MacroRing label="Белки" value={200} target={100} color="#f00" />);
    expect(screen.getByText("+100 г")).toBeInTheDocument();
  });
});
