import { describe, expect, it } from "vitest";
import { verifyTelegramAuth } from "./verify";

/**
 * Хелперы теста: считают подпись ТАК ЖЕ, как это делает Telegram
 * (документация «Validating data received via the Login Widget» и
 * «Validating data received via the Mini App»). Секрет в тесте известен —
 * это позволяет собрать валидные фикстуры для проверки позитивных сценариев.
 */

const BOT_TOKEN = "123456789:TEST_BOT_TOKEN";

const encoder = new TextEncoder();

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256(data: string): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", encoder.encode(data)),
  );
}

/** Сырые байты HMAC-SHA256 (как возвращает WebCrypto). */
async function hmacRaw(key: Uint8Array, data: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength) as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    encoder.encode(data),
  );
  return new Uint8Array(signature);
}

async function hmacHex(key: Uint8Array, data: string): Promise<string> {
  return toHex(await hmacRaw(key, data));
}

async function widgetFixture(
  overrides: Record<string, unknown> = {},
): Promise<{ fields: Record<string, unknown>; authDate: number }> {
  const authDate = Math.floor(Date.now() / 1000);
  const base: Record<string, unknown> = {
    id: 12345,
    first_name: "Иван",
    last_name: "Петров",
    username: "ivan_test",
    auth_date: authDate,
    ...overrides,
  };
  const dataCheckString = Object.keys(base)
    .filter((key) => key !== "hash")
    .sort()
    .map((key) => `${key}=${base[key]}`)
    .join("\n");
  const hash = await hmacHex(await sha256(BOT_TOKEN), dataCheckString);
  return { fields: { ...base, hash }, authDate };
}

async function webappFixture(
  overrides: Record<string, unknown> = {},
): Promise<{ initData: string; authDate: number }> {
  const authDate = Math.floor(Date.now() / 1000);
  const user = JSON.stringify({
    id: 999,
    first_name: "Аня",
    username: "anya_test",
    ...overrides,
  });
  // Порядок параметров важен: initData без hash — это ровно data_check_string.
  const params = new URLSearchParams();
  params.set("auth_date", String(authDate));
  params.set("query_id", "AAHdF6IQAAAAAN3rph8vVc8k");
  params.set("user", user);
  const dataCheckString = params.toString();
  // Секрет Mini App — HMAC(key="WebAppData", message=bot_token),
  // по official Telegram Bot API docs. НЕ перепутать порядок аргументов!
  const secretKey = await hmacRaw(encoder.encode("WebAppData"), BOT_TOKEN);
  const hash = await hmacHex(secretKey, dataCheckString);
  return { initData: `${dataCheckString}&hash=${hash}`, authDate };
}

describe("verifyTelegramAuth — Login Widget (oauth.telegram.org)", () => {
  it("принимает валидную подпись и возвращает данные пользователя", async () => {
    const { fields, authDate } = await widgetFixture();
    const user = await verifyTelegramAuth({
      source: "widget",
      botToken: BOT_TOKEN,
      fields,
    });

    expect(user).toEqual({
      id: 12345,
      firstName: "Иван",
      lastName: "Петров",
      username: "ivan_test",
      authDate,
    });
  });

  it("отклоняет подпись при изменении любого поля (tampering)", async () => {
    const { fields } = await widgetFixture();
    const tampered = { ...fields, first_name: "Хакер" };

    await expect(
      verifyTelegramAuth({ source: "widget", botToken: BOT_TOKEN, fields: tampered }),
    ).rejects.toThrow(/TG_AUTH_INVALID_SIGNATURE/);
  });

  it("отклоняет устаревшую подпись (auth_date старше 5 минут)", async () => {
    const { fields } = await widgetFixture({
      auth_date: Math.floor(Date.now() / 1000) - 6 * 60,
    });

    await expect(
      verifyTelegramAuth({
        source: "widget",
        botToken: BOT_TOKEN,
        fields,
        now: Date.now(),
      }),
    ).rejects.toThrow(/TG_AUTH_EXPIRED/);
  });

  it("отклоняет payload без hash или auth_date", async () => {
    const { fields } = await widgetFixture();
    const withoutHash: Record<string, unknown> = { ...fields };
    delete withoutHash.hash;

    await expect(
      verifyTelegramAuth({
        source: "widget",
        botToken: BOT_TOKEN,
        fields: withoutHash,
      }),
    ).rejects.toThrow(/TG_AUTH_NO_SIGNATURE/);
  });
});

describe("verifyTelegramAuth — Mini App initData", () => {
  it("принимает валидный initData и достаёт пользователя из user-параметра", async () => {
    const { initData, authDate } = await webappFixture();
    const user = await verifyTelegramAuth({
      source: "webapp",
      botToken: BOT_TOKEN,
      initData,
    });

    expect(user).toEqual({
      id: 999,
      firstName: "Аня",
      username: "anya_test",
      authDate,
    });
  });

  it("отклоняет initData с подменённым user", async () => {
    const { initData } = await webappFixture();
    // Подмена user в СЫРОЙ строке ломает data_check_string → подпись не сходится.
    const forged = initData.replace("anya_test", "hacker");

    await expect(
      verifyTelegramAuth({ source: "webapp", botToken: BOT_TOKEN, initData: forged }),
    ).rejects.toThrow(/TG_AUTH_INVALID_SIGNATURE/);
  });

  it("отклоняет initData без hash", async () => {
    const { initData } = await webappFixture();
    const withoutHash = initData.replace(/&hash=[a-f0-9]+$/, "");

    await expect(
      verifyTelegramAuth({ source: "webapp", botToken: BOT_TOKEN, initData: withoutHash }),
    ).rejects.toThrow(/TG_AUTH_NO_SIGNATURE/);
  });

  it("отклоняет подпись, посчитанную с чужим токеном", async () => {
    const { initData } = await webappFixture();

    await expect(
      verifyTelegramAuth({
        source: "webapp",
        botToken: "999999999:OTHER_BOT_TOKEN",
        initData,
      }),
    ).rejects.toThrow(/TG_AUTH_INVALID_SIGNATURE/);
  });
});

describe("verifyTelegramAuth — общие проверки", () => {
  it("сообщает, когда бот не настроен (нет токена)", async () => {
    const { fields } = await widgetFixture();
    await expect(
      verifyTelegramAuth({ source: "widget", botToken: "", fields }),
    ).rejects.toThrow(/TG_AUTH_NO_BOT_TOKEN/);
  });

  it("отклоняет нечисловой id пользователя", async () => {
    const { fields } = await widgetFixture({ id: "not-a-number" });
    await expect(
      verifyTelegramAuth({ source: "widget", botToken: BOT_TOKEN, fields }),
    ).rejects.toThrow(/TG_AUTH_INVALID_USER/);
  });

  it("не использует initData, когда source = widget (и наоборот)", async () => {
    const { initData } = await webappFixture();
    // Виджет-путь игнорирует initData → нет полей → ошибка.
    await expect(
      verifyTelegramAuth({ source: "widget", botToken: BOT_TOKEN, initData }),
    ).rejects.toThrow(/TG_AUTH_NO_SIGNATURE/);
  });
});
