import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Мок VLY-шлюза: подменяем модуль ДО импорта emailOtp.ts, чтобы тот получил
// управляемый vly.email.send вместо реального клиента с ключом из окружения.
// vi.hoisted — фабрики vi.mock поднимаются над объявлениями, поэтому моки
// создаются до них, иначе был бы ReferenceError: Cannot access before init.
const { sendMock, devOtpInsert, rateLimitCheck } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  // Сентинел-реф внутренней мутации: даём возможность доказать, что колбэк
  // передал в runMutation ИМЕННО internal.devOtp.insert, а не другой ref.
  devOtpInsert: vi.fn(),
  // Сентинел-реф rate-limit мутации — по умолчанию разрешает отправку.
  rateLimitCheck: vi.fn(),
}));

vi.mock("../../lib/vly-integrations", () => ({
  vly: {
    email: {
      send: sendMock,
    },
  },
}));

// emailOtp.ts импортирует только internal из _generated/api — мок безопасен
// и скоупирован на этот файл (vi.mock работает per-test-file).
vi.mock("../_generated/api", () => ({
  internal: {
    devOtp: { insert: devOtpInsert },
    otpRateLimit: { checkAndRecord: rateLimitCheck },
  },
}));

// internal из _generated/api — это anyApi, он не тянет convex-рантайм; в тестах
// достаточно убедиться, что runMutation получил ref внутренней функции и args.
import { emailOtp, generateVerificationToken } from "./emailOtp";

// sendVerificationRequest типизирован как EmailConfig["sendVerificationRequest"]
// (сигнатура Auth.js), но наша реализация — (params, ctx). Приводим к тестовой
// форме, чтобы вызвать с мок-контекстом.
type SendFn = (
  params: { identifier: string; token: string },
  ctx: { runMutation: (fn: unknown, args: unknown) => Promise<unknown> },
) => Promise<void>;

const send = emailOtp.sendVerificationRequest as unknown as SendFn;

// runMutation: делегирует реальному мок-рефу (rateLimitCheck/devOtpInsert),
// чтобы per-test значения (например, { allowed: false }) работали.
const runMutation = vi.fn((fn: unknown, args: unknown) => {
  if (fn === rateLimitCheck) return rateLimitCheck(args);
  if (fn === devOtpInsert) return devOtpInsert(args);
  return Promise.resolve(undefined);
});

describe("generateVerificationToken — 6-значный цифровой OTP", () => {
  it("по умолчанию возвращает 6-значный код", () => {
    const token = generateVerificationToken();
    expect(token).toMatch(/^\d{6}$/);
    expect(token).toHaveLength(6);
  });

  it("код состоит только из цифр (без букв и спецсимволов)", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateVerificationToken()).toMatch(/^\d+$/);
    }
  });

  it("уважает переданную длину кода", () => {
    expect(generateVerificationToken(4)).toMatch(/^\d{4}$/);
    expect(generateVerificationToken(8)).toMatch(/^\d{8}$/);
    expect(generateVerificationToken(1)).toMatch(/^\d{1}$/);
  });

  it("не вырождается: два кода подряд не совпадают (P(коллизии) ≈ 1e-6)", () => {
    expect(generateVerificationToken()).not.toBe(generateVerificationToken());
  });

  it("конфиг провайдера делегирует модульной функции (покрытие строки метода)", async () => {
    // Email() кладёт оригинальный конфиг в `options` — это тот самый метод,
    // который библиотека вызывает при генерации кода (строки 38–41 emailOtp.ts).
    const cfg = emailOtp.options as unknown as {
      generateVerificationToken: () => Promise<string> | string;
    };
    expect(cfg.generateVerificationToken).toBeDefined();
    const token = await cfg.generateVerificationToken();
    expect(token).toMatch(/^\d{6}$/);
  });
});

describe("emailOtp.sendVerificationRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimitCheck.mockResolvedValue({ allowed: true, retryAfterSec: 0 });
    delete process.env.VLY_EMAIL_DEV_CAPTURE;
    delete process.env.VLY_INTEGRATION_KEY;
    delete process.env.VLY_APP_NAME;
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.VLY_EMAIL_DEV_CAPTURE;
    delete process.env.VLY_INTEGRATION_KEY;
    delete process.env.VLY_APP_NAME;
  });

  it("dev-перехват: пишет код в devOtpCodes и не ходит в VLY", async () => {
    process.env.VLY_EMAIL_DEV_CAPTURE = "1";

    await send({ identifier: "dev@example.com", token: "123456" }, { runMutation });

    expect(sendMock).not.toHaveBeenCalled();
    // Сначала rate-limit, затем dev-перехват.
    expect(runMutation).toHaveBeenCalledTimes(2);
    expect(runMutation).toHaveBeenNthCalledWith(1, rateLimitCheck, {
      email: "dev@example.com",
    });
    expect(runMutation).toHaveBeenNthCalledWith(2, devOtpInsert, {
      email: "dev@example.com",
      code: "123456",
      createdAt: expect.any(Number),
    });
  });

  it("прод: зовёт vly.email.send с адресом и кодом, без dev-записи", async () => {
    process.env.VLY_INTEGRATION_KEY = "test-key";
    process.env.VLY_APP_NAME = "КИЛО";
    sendMock.mockResolvedValue({ success: true, data: { status: "queued" } });

    await send({ identifier: "user@example.com", token: "654321" }, { runMutation });

    expect(runMutation).toHaveBeenCalledTimes(1);
    expect(runMutation).toHaveBeenCalledWith(rateLimitCheck, {
      email: "user@example.com",
    });
    expect(sendMock).toHaveBeenCalledTimes(1);
    const mail = sendMock.mock.calls[0]![0] as {
      to: string;
      subject: string;
      text: string;
      html: string;
    };
    expect(mail.to).toBe("user@example.com");
    expect(mail.subject).toContain("КИЛО");
    expect(mail.text).toContain("654321");
    expect(mail.html).toContain("654321");
  });

  it("повторная отправка раньше 60с отклонена, VLY не вызывается", async () => {
    process.env.VLY_INTEGRATION_KEY = "test-key";
    rateLimitCheck.mockResolvedValue({ allowed: false, retryAfterSec: 42 });

    await expect(
      send({ identifier: "user@example.com", token: "123456" }, { runMutation }),
    ).rejects.toThrow("Повторите через 42 сек");

    expect(sendMock).not.toHaveBeenCalled();
    expect(runMutation).toHaveBeenCalledTimes(1);
    expect(runMutation).toHaveBeenCalledWith(rateLimitCheck, {
      email: "user@example.com",
    });
  });

  it("прод: имя приложения из VLY_APP_NAME попадает в письмо", async () => {
    process.env.VLY_INTEGRATION_KEY = "test-key";
    process.env.VLY_APP_NAME = "Фитнес-Хаб";
    sendMock.mockResolvedValue({ success: true, data: { status: "queued" } });

    await send({ identifier: "a@b.c", token: "000000" }, { runMutation });

    const mail = sendMock.mock.calls[0]![0] as { subject: string; html: string };
    expect(mail.subject).toContain("Фитнес-Хаб");
    expect(mail.html).toContain("Фитнес-Хаб");
  });

  it("прод: без VLY_APP_NAME подставляется дефолт «КИЛО»", async () => {
    process.env.VLY_INTEGRATION_KEY = "test-key";
    sendMock.mockResolvedValue({ success: true, data: { status: "queued" } });

    await send({ identifier: "a@b.c", token: "000000" }, { runMutation });

    const mail = sendMock.mock.calls[0]![0] as { subject: string };
    expect(mail.subject).toContain("КИЛО");
  });

  it("без VLY_INTEGRATION_KEY бросает понятную ошибку и не зовёт шлюз", async () => {
    await expect(
      send({ identifier: "user@example.com", token: "123456" }, { runMutation }),
    ).rejects.toThrow("задайте VLY_INTEGRATION_KEY");

    expect(sendMock).not.toHaveBeenCalled();
    // Rate-limit проверка отработала, до отправки не дошло.
    expect(runMutation).toHaveBeenCalledTimes(1);
    expect(runMutation).toHaveBeenCalledWith(rateLimitCheck, {
      email: "user@example.com",
    });
  });

  it("повторная отправка пишет новый код, старый не переиспользуется", async () => {
    process.env.VLY_EMAIL_DEV_CAPTURE = "1";

    // Две отправки на один адрес (вторая — в новом окне rate-limit 60с,
    // поэтому rateLimitCheck оба раза разрешает).
    await send({ identifier: "a@b.c", token: "111111" }, { runMutation });
    await send({ identifier: "a@b.c", token: "222222" }, { runMutation });

    const inserts = runMutation.mock.calls
      .filter(([fn]) => fn === devOtpInsert)
      .map(([, args]) => args as { email: string; code: string; createdAt: number });
    expect(inserts).toHaveLength(2);
    expect(inserts.map((a) => a.code)).toEqual(["111111", "222222"]);
    // Оба раза — один и тот же адрес, но разные коды: старый не отправляется
    // заново и не переиспользуется при повторной отправке.
    expect(inserts[0]!.email).toBe(inserts[1]!.email);
    expect(inserts[0]!.code).not.toBe(inserts[1]!.code);
  });

  it("неуспешный ответ шлюза (success:false) бросает ошибку шлюза", async () => {
    process.env.VLY_INTEGRATION_KEY = "test-key";
    sendMock.mockResolvedValue({ success: false, error: "domain not verified" });

    await expect(
      send({ identifier: "user@example.com", token: "123456" }, { runMutation }),
    ).rejects.toThrow("domain not verified");
  });

  it("ответ со статусом failed бросает ошибку по умолчанию", async () => {
    process.env.VLY_INTEGRATION_KEY = "test-key";
    sendMock.mockResolvedValue({ success: true, data: { status: "failed" } });

    await expect(
      send({ identifier: "user@example.com", token: "123456" }, { runMutation }),
    ).rejects.toThrow("Не удалось отправить письмо");
  });
});
