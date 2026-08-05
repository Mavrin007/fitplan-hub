import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";
import { formatConvexError } from "./errors";

describe("formatConvexError", () => {
  it("берёт message из data ConvexError (объект)", () => {
    const err = new ConvexError({ message: "Некорректная дата" });
    expect(formatConvexError(err)).toBe("Некорректная дата");
  });

  it("берёт строку из data ConvexError", () => {
    const err = new ConvexError("Всё сломалось");
    expect(formatConvexError(err)).toBe("Всё сломалось");
  });

  it("берёт detail из data, если message пуст", () => {
    const err = new ConvexError({ detail: "Подробность" });
    expect(formatConvexError(err)).toBe("Подробность");
  });

  it("сериализует data-объект без message/detail", () => {
    const err = new ConvexError({ foo: 1 });
    expect(formatConvexError(err)).toBe('{"foo":1}');
  });

  it("data={} без полей: messageFromData отдаёт null, наружу уходит message", () => {
    // data = {} не сериализуется (s === "{}") → null; дальше берётся
    // err.message, который у ConvexError равен JSON от data = "{}".
    expect(formatConvexError(new ConvexError({}))).toBe("{}");
  });

  it("вырезает обёртку [CONVEX M(fn)] из обычного Error", () => {
    const err = new Error("[CONVEX M(foods.addFood)] Сервер сломался");
    expect(formatConvexError(err)).toBe("Сервер сломался");
  });

  it("вырезает обёртку с Request ID и стеком", () => {
    const err = new Error(
      "[CONVEX A(auth:signIn)] [Request ID: xyz] Server Error\nUncaught Error: Код уже отправлен. Повторите через 45 сек.\n\n  Called by client",
    );
    expect(formatConvexError(err)).toBe(
      "Код уже отправлен. Повторите через 45 сек.",
    );
  });

  it("переводит известные служебные сообщения", () => {
    expect(formatConvexError(new Error("Not authenticated"))).toBe(
      "Сессия истекла. Войдите заново.",
    );
    expect(formatConvexError(new Error("not found"))).toBe(
      "Запись не найдена или уже удалена.",
    );
  });

  it("для Server Error без причины отдаёт fallback", () => {
    expect(formatConvexError(new Error("Server Error"))).toBe(
      "Сервер временно недоступен. Попробуйте ещё раз.",
    );
    expect(formatConvexError(new Error("Server Error"), "Кастомный фолбэк")).toBe(
      "Кастомный фолбэк",
    );
  });

  it("обрабатывает строки, числа и null", () => {
    expect(formatConvexError("Просто текст")).toBe("Просто текст");
    expect(formatConvexError(null)).toBe(
      "Сервер временно недоступен. Попробуйте ещё раз.",
    );
    expect(formatConvexError(42)).toBe("42");
  });
});
