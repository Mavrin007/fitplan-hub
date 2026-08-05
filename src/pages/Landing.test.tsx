import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithRouter } from "@/test/utils";
import Landing from "./Landing";

describe("Landing", () => {
  it("рендерит навигацию с ссылками на вход", () => {
    renderWithRouter(<Landing />);

    const nav = screen.getByRole("banner");
    expect(within(nav).getByRole("link", { name: /Войти/ })).toHaveAttribute(
      "href",
      "/auth",
    );
    expect(within(nav).getByRole("link", { name: /Создать профиль/ })).toHaveAttribute(
      "href",
      "/auth",
    );
  });

  it("рендерит hero с заголовком и CTA-кнопками", () => {
    renderWithRouter(<Landing />);

    expect(
      screen.getByRole("heading", { name: /Знайте свои цифры/ }),
    ).toBeInTheDocument();
    // Две CTA-ссылки в hero.
    expect(screen.getByRole("link", { name: /Начать вести дневник/ })).toHaveAttribute(
      "href",
      "/auth",
    );
    expect(screen.getByRole("link", { name: /Рассчитать цели/ })).toHaveAttribute(
      "href",
      "/auth",
    );
  });

  it("показывает фичи, шаги, превью и футер", () => {
    renderWithRouter(<Landing />);

    for (const title of ["Точные цели", "План питания", "Структурные тренировки", "Видимый прогресс"]) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
    for (const step of ["Расскажите о себе", "Получите свои цифры", "Ешьте, тренируйтесь, повторяйте"]) {
      expect(screen.getByText(step)).toBeInTheDocument();
    }
    // Превью-макеты.
    expect(screen.getByText("Дневник · сегодня")).toBeInTheDocument();
    expect(screen.getByText("Тренировки · цикл 4 недели")).toBeInTheDocument();
    expect(screen.getByText("Прогресс · 90 дней")).toBeInTheDocument();

    expect(screen.getByText(/Фитнес и питание. Ваши данные остаются вашими/)).toBeInTheDocument();
  });

  it("CTA внизу страницы ведёт на /auth", () => {
    renderWithRouter(<Landing />);

    // «Создать профиль» есть в навбаре и в нижней CTA — все ведут на /auth.
    const ctas = screen.getAllByRole("link", { name: "Создать профиль" });
    expect(ctas.length).toBeGreaterThanOrEqual(2);
    for (const cta of ctas) {
      expect(cta).toHaveAttribute("href", "/auth");
    }
  });
});
