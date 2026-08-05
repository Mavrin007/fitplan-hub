import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChartCard, LegendChip } from "./chart-card";

describe("ChartCard", () => {
  it("рендерит заголовок, подзаголовок и контент", () => {
    render(
      <ChartCard title="Вес" subtitle="90 дней">
        <div>График</div>
      </ChartCard>,
    );
    expect(screen.getByRole("heading", { name: "Вес" })).toBeInTheDocument();
    expect(screen.getByText("90 дней")).toBeInTheDocument();
    expect(screen.getByText("График")).toBeInTheDocument();
  });

  it("рендерит легенду, когда передана", () => {
    render(
      <ChartCard title="Вес" subtitle="90 дней" legend={<LegendChip color="#000" label="Цель" />}>
        <div>График</div>
      </ChartCard>,
    );
    expect(screen.getByText("Цель")).toBeInTheDocument();
  });

  it("не рендерит блок легенды без неё", () => {
    render(
      <ChartCard title="Вес" subtitle="90 дней">
        <div>График</div>
      </ChartCard>,
    );
    expect(screen.queryByText("Цель")).not.toBeInTheDocument();
  });
});

describe("LegendChip", () => {
  it("рендерит сплошной квадрат по умолчанию", () => {
    render(<LegendChip color="#ff0000" label="Вес" />);
    expect(screen.getByText("Вес")).toBeInTheDocument();
  });

  it("рендерит пунктирную линию при dashed", () => {
    render(<LegendChip color="#00ff00" dashed label="Цель" />);
    expect(screen.getByText("Цель")).toBeInTheDocument();
  });
});
