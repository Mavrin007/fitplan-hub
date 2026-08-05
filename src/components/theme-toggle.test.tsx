import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { ThemeToggle } from "./theme-toggle";

describe("ThemeToggle", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("в светлой теме предлагает включить тёмную", () => {
    render(<ThemeToggle />);
    expect(
      screen.getByRole("button", { name: "Включить тёмную тему" }),
    ).toBeInTheDocument();
  });

  it("клик переключает тему и подпись кнопки", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    await user.click(screen.getByRole("button"));
    expect(
      screen.getByRole("button", { name: "Включить светлую тему" }),
    ).toBeInTheDocument();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
