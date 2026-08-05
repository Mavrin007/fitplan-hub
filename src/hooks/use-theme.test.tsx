import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getInitialTheme, useTheme } from "./use-theme";

/** Минимальная обвязка, чтобы хук жил в React-рантайме. */
function Harness() {
  const { theme, toggle } = useTheme();
  return (
    <button type="button" onClick={toggle}>
      theme:{theme}
    </button>
  );
}

describe("useTheme", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("по умолчанию светлая тема, класс dark не вешается", () => {
    render(<Harness />);
    expect(screen.getByRole("button")).toHaveTextContent("theme:light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("toggle переключает на тёмную: класс на <html> и сохранение в localStorage", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button"));
    expect(screen.getByRole("button")).toHaveTextContent("theme:dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(window.localStorage.getItem("kilo-theme")).toBe("dark");
  });

  it("обратный toggle возвращает светлую", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button"));
    await user.click(screen.getByRole("button"));
    expect(screen.getByRole("button")).toHaveTextContent("theme:light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("читает сохранённую тёмную тему из localStorage", () => {
    window.localStorage.setItem("kilo-theme", "dark");
    render(<Harness />);
    expect(screen.getByRole("button")).toHaveTextContent("theme:dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("мусорное значение в localStorage → светлая тема", () => {
    window.localStorage.setItem("kilo-theme", "blue");
    render(<Harness />);
    expect(screen.getByRole("button")).toHaveTextContent("theme:light");
  });

  it("не падает, если localStorage недоступен (геттер и сеттер бросают)", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const user = userEvent.setup();
    render(<Harness />);
    // Геттер бросил → светлая тема, без исключений.
    expect(screen.getByRole("button")).toHaveTextContent("theme:light");
    // Сеттер тоже бросает в эффекте — toggle не роняет приложение.
    await user.click(screen.getByRole("button"));
    expect(screen.getByRole("button")).toHaveTextContent("theme:dark");
    vi.restoreAllMocks();
  });

  it("SSR-ветка: без window (undefined) — светлая тема", () => {
    vi.stubGlobal("window", undefined);
    try {
      expect(getInitialTheme()).toBe("light");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
