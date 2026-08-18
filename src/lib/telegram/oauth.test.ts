import { describe, expect, it } from "vitest";
import {
  parseTelegramAuthResult,
  telegramAuthUrl,
  type TelegramWidgetUser,
} from "./oauth";
import { TELEGRAM_BOT_ID } from "./api";

const widgetUser: TelegramWidgetUser = {
  id: 12345,
  first_name: "Иван",
  username: "ivan_test",
  auth_date: 1700000000,
  hash: "abc123",
};
const tgAuthHash = `#tgAuthResult=${encodeURIComponent(
  JSON.stringify(widgetUser),
)}`;

describe("parseTelegramAuthResult", () => {
  it("парсит валидный хэш", () => {
    expect(parseTelegramAuthResult(tgAuthHash)).toEqual(widgetUser);
  });

  it("возвращает null для пустого, чужого или битого хэша", () => {
    expect(parseTelegramAuthResult("")).toBeNull();
    expect(parseTelegramAuthResult("#other=1")).toBeNull();
    expect(
      parseTelegramAuthResult(
        `#tgAuthResult=${encodeURIComponent("{broken json")}`,
      ),
    ).toBeNull();
    // Без id/hash — не результат авторизации.
    expect(
      parseTelegramAuthResult(
        `#tgAuthResult=${encodeURIComponent(JSON.stringify({ id: "x" }))}`,
      ),
    ).toBeNull();
  });
});

describe("telegramAuthUrl", () => {
  it("собирает URL с bot_id, origin, embed и return_to", () => {
    const url = new URL(
      telegramAuthUrl("https://app.example.com", "https://app.example.com/auth"),
    );
    expect(url.origin + url.pathname).toBe("https://oauth.telegram.org/auth");
    expect(url.searchParams.get("bot_id")).toBe(String(TELEGRAM_BOT_ID));
    expect(url.searchParams.get("origin")).toBe("https://app.example.com");
    expect(url.searchParams.get("embed")).toBe("1");
    expect(url.searchParams.get("return_to")).toBe(
      "https://app.example.com/auth",
    );
  });
});
