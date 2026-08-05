import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDelete } from "./confirm-delete";

describe("ConfirmDelete", () => {
  it("первый клик взводит кнопку, второй вызывает onConfirm", () => {
    const onConfirm = vi.fn();
    render(<ConfirmDelete onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: "Удалить" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Точно удалить?" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Точно удалить?" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("взведённая кнопка возвращается в исходное состояние через 2.5 секунды", () => {
    vi.useFakeTimers();
    try {
      const onConfirm = vi.fn();
      render(<ConfirmDelete onConfirm={onConfirm} />);
      fireEvent.click(screen.getByRole("button", { name: "Удалить" }));
      act(() => {
        vi.advanceTimersByTime(2500);
      });
      // Кнопка снова «Удалить», onConfirm не вызывался.
      expect(
        screen.getByRole("button", { name: "Удалить" }),
      ).toBeInTheDocument();
      expect(onConfirm).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("busy отключает кнопку и блокирует клики", () => {
    const onConfirm = vi.fn();
    render(<ConfirmDelete onConfirm={onConfirm} busy />);
    const btn = screen.getByRole("button", { name: "Удалить" });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("iconOnly показывает только иконку, но взводится так же", () => {
    const onConfirm = vi.fn();
    render(<ConfirmDelete onConfirm={onConfirm} iconOnly />);
    fireEvent.click(screen.getByRole("button", { name: "Удалить" }));
    fireEvent.click(screen.getByRole("button", { name: "Точно удалить?" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
