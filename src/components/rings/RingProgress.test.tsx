import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { RingProgress } from "./RingProgress";
import { CALORIES_RING, TRAINING_RING, WATER_RING } from "./colors";
import type { RingDatum } from "./types";

const RINGS: RingDatum[] = [
  {
    id: "calories",
    label: "Калории",
    value: 742,
    max: 800,
    unit: "ккал",
    color: CALORIES_RING,
  },
  {
    id: "training",
    label: "Тренировки",
    value: 58,
    max: 60,
    unit: "мин",
    color: TRAINING_RING,
  },
  {
    id: "water",
    label: "Вода",
    value: 2300,
    max: 3000,
    unit: "л",
    color: WATER_RING,
    display: (v: number) => (v / 1000).toFixed(1),
  },
];

function renderRings(data: RingDatum[] = RINGS, props: Record<string, unknown> = {}) {
  return render(<RingProgress data={data} {...props} />);
}

describe("RingProgress — рендер и доступность", () => {
  it("рисует кольцо на каждую запись data с role=progressbar и aria-атрибутами", () => {
    renderRings();

    const calories = screen.getByRole("progressbar", {
      name: "Калории: 742 / 800 ккал",
    });
    expect(calories).toHaveAttribute("aria-valuenow", "742");
    expect(calories).toHaveAttribute("aria-valuemin", "0");
    expect(calories).toHaveAttribute("aria-valuemax", "800");

    const training = screen.getByRole("progressbar", {
      name: "Тренировки: 58 / 60 мин",
    });
    expect(training).toHaveAttribute("aria-valuenow", "58");
    expect(training).toHaveAttribute("aria-valuemax", "60");

    // Вода через display: «2.3 / 3.0 л».
    const water = screen.getByRole("progressbar", {
      name: "Вода: 2.3 / 3.0 л",
    });
    expect(water).toHaveAttribute("aria-valuemax", "3000");
  });

  it("центр показывает процент лидера и подпись; группа имеет aria-label", () => {
    renderRings();

    const group = screen.getByRole("group", { name: "Сегодня: 93%" });
    expect(group).toBeInTheDocument();
    expect(within(group).getByText("93%")).toBeInTheDocument();
    expect(within(group).getByText("Сегодня")).toBeInTheDocument();
  });

  it("перебор цели (value > max): центр показывает 150 % и рисуется второй круг", () => {
    renderRings([
      { ...RINGS[0], value: 150, max: 100 },
      RINGS[1],
      RINGS[2],
    ]);

    expect(screen.getByText("150%")).toBeInTheDocument();
    const group = screen.getByRole("group", { name: "Сегодня: 150%" });

    // Полный круг + хвост 0.5 → две активные дуги у кольца калорий.
    const arcGroups = group.querySelectorAll('[data-ring="calories"] [data-arc]');
    expect(arcGroups.length).toBe(2);
  });

  it("до 100 % — одна дуга без второго круга", () => {
    renderRings();
    const group = screen.getByRole("group", { name: "Сегодня: 93%" });
    const arcs = group.querySelectorAll('[data-ring="calories"] [data-arc]');
    expect(arcs.length).toBe(1);
  });

  it("деталей при наведении нет в aria, но есть в DOM (CSS-переключение)", () => {
    renderRings();
    const group = screen.getByRole("group", { name: "Сегодня: 93%" });
    const details = within(group).getByText("742 / 800 ккал");
    expect(details).toBeInTheDocument();
    expect(details.closest("[aria-hidden='true']")).not.toBeNull();
  });

  it("капля появляется только при ненулевом прогрессе", () => {
    const { unmount } = renderRings();
    const withBead = screen
      .getByRole("group", { name: "Сегодня: 93%" })
      .querySelectorAll("[data-bead]");
    expect(withBead.length).toBeGreaterThan(0);
    unmount();

    // value = 0 — капли у кольца калорий нет (у остальных колец она есть).
    renderRings([{ ...RINGS[0], value: 0, max: 800 }, RINGS[1], RINGS[2]]);
    const emptyGroup = screen.getByRole("group", { name: "Сегодня: 0%" });
    expect(emptyGroup.querySelectorAll('[data-ring="calories"] [data-bead]').length).toBe(0);
    expect(emptyGroup.querySelectorAll('[data-ring="training"] [data-bead]').length).toBe(1);
  });

  it("кастомный центр заменяет процент + подпись", () => {
    renderRings(RINGS, { center: <span>Моя цель</span> });
    expect(screen.getByText("Моя цель")).toBeInTheDocument();
    expect(screen.queryByText("Сегодня")).not.toBeInTheDocument();
  });
});

describe("RingProgress — конвенция геометрии", () => {
  it("дуга начинает рисоваться пустой (dashoffset = длина окружности)", () => {
    renderRings();
    const group = screen.getByRole("group", { name: "Сегодня: 93%" });
    const arc = group.querySelector('[data-ring="calories"] [data-arc]');
    // Радиус внешнего кольца: (200 − 17)/2 = 91.5 → C = 2π·91.5 ≈ 574.9.
    const c = 2 * Math.PI * 91.5;
    const offset = parseFloat(arc!.getAttribute("stroke-dashoffset") ?? "");
    expect(offset).toBeCloseTo(c, 0);
  });
});
