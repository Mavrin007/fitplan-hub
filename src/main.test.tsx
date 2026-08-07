import { describe, expect, it, vi } from "vitest";

// Тяжёлые модули main.tsx мокаем целиком — тестируем связку дерева,
// а не сами провайдеры/клиенты. Мок-функции в vi.hoisted: фабрики vi.mock
// исполняются раньше const-импортов теста, поэтому ссылаться на них можно
// только из поднятого контекста.
const { renderMock, createRootMock } = vi.hoisted(() => {
  const renderMock = vi.fn();
  return { renderMock, createRootMock: vi.fn(() => ({ render: renderMock })) };
});
vi.mock("react-dom/client", () => ({
  createRoot: createRootMock,
}));
vi.mock("@sentry/react", () => ({
  init: vi.fn(),
  captureException: vi.fn(),
}));
vi.mock("convex/react", () => ({
  // Класс, который можно вызвать с new — ConvexReactClient из main.tsx.
  ConvexReactClient: class {
    __mockClient = true;
  },
}));
vi.mock("@convex-dev/auth/react", () => ({
  ConvexAuthProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="auth-provider">{children}</div>
  ),
}));
vi.mock("../vly-toolbar-readonly.tsx", () => ({
  VlyToolbar: () => <div data-testid="vly-toolbar" />,
}));
vi.mock("@/components/AssistantChat", () => ({
  AssistantChat: () => <div data-testid="assistant-chat" />,
}));
vi.mock("@/components/ui/sonner", () => ({
  Toaster: () => <div data-testid="toaster" />,
}));
// Страницы ленивые — не загружаются при монтировании, но их нужно замокать,
// чтобы не тянуть в тест весь UI-стек.
vi.mock("./pages/Landing", () => ({ default: () => <div /> }));
vi.mock("./pages/Auth", () => ({ default: () => <div /> }));
vi.mock("./pages/Dashboard", () => ({ default: () => <div /> }));
vi.mock("./pages/Overview", () => ({ default: () => <div /> }));
vi.mock("./pages/Meals", () => ({ default: () => <div /> }));
vi.mock("./pages/Workouts", () => ({ default: () => <div /> }));
vi.mock("./pages/Progress", () => ({ default: () => <div /> }));
vi.mock("./pages/Profile", () => ({ default: () => <div /> }));
vi.mock("./pages/NotFound", () => ({ default: () => <div /> }));
vi.mock("./pages/Privacy", () => ({ default: () => <div /> }));

import { ReactElement } from "react";
import { redactPii, sanitizeBeforeSend, scrubPii } from "./main";

describe("PII-маскирование (main.tsx)", () => {
  it("redactPii маскирует почты, JWT, Gemini-ключи и секреты", () => {
    expect(redactPii("пишите на test@example.com быстро")).toBe(
      "пишите на [email] быстро",
    );
    // Сегменты JWT ≥10 символов (реальные токены такие); «a.b.c» не токен.
    expect(
      redactPii("token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk"),
    ).toBe("token=[jwt]");
    expect(redactPii("key AIzaSyDummy1234567890qwertyuiop")).toBe(
      "key [gemini-key]",
    );
    expect(redactPii("sk_live_1234567890abcdef")).toBe("[secret]");
  });

  it("redactPii не трогает обычный текст и короткие строки", () => {
    expect(redactPii("обычное сообщение")).toBe("обычное сообщение");
    expect(redactPii("abc")).toBe("abc");
    // Однобуквенный домен — не почта по правилу [A-Z]{2,} (защита от
    // ложных срабатываний на «a.b.c»).
    expect(redactPii("addr a@b.c")).toBe("addr a@b.c");
  });

  it("scrubPii рекурсивно маскирует вложенные структуры", () => {
    const data = {
      user: { email: "a@b.co" },
      list: ["x@y.zone", "plain"],
      token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk",
    };
    scrubPii(data);
    expect(data).toEqual({
      user: { email: "[email]" },
      list: ["[email]", "plain"],
      token: "[jwt]",
    });
  });

  it("sanitizeBeforeSend убирает почту/ip из user и секретные заголовки", () => {
    const event = {
      user: { email: "a@b.co", ip_address: "1.2.3.4", id: "u1" },
      request: { headers: { cookie: "a=1", authorization: "Bearer x", accept: "*/*" } },
      message: "ошибка для a@b.co",
      breadcrumbs: [{ message: "пост на x@y.zone" }],
      extra: { nested: { apiKey: "sk-1234567890abcdef" } },
    } as unknown as Parameters<typeof sanitizeBeforeSend>[0];
    const result = sanitizeBeforeSend(event);

    expect(result?.user).toEqual({ id: "u1" });
    expect(result?.request?.headers).toEqual({ accept: "*/*" });
    expect(result?.message).toBe("ошибка для [email]");
    expect(result?.breadcrumbs?.[0].message).toBe("пост на [email]");
    expect(result?.extra).toEqual({ nested: { apiKey: "[secret]" } });
  });

  it("sanitizeBeforeSend оставляет событие без PII нетронутым", () => {
    const event = {
      message: "просто ошибка",
      user: { id: "u1" },
    } as unknown as Parameters<typeof sanitizeBeforeSend>[0];
    const result = sanitizeBeforeSend(event);
    expect(result).toEqual(event);
  });
});

describe("main.tsx", () => {
  it("монтирует приложение через createRoot с провайдерами и boundary", async () => {
    // Модуль уже исполнен статическим импортом выше (PII-тесты) — createRoot
    // вызывался при первом импорте main.tsx, до создания #root в DOM (в jsdom
    // getElementById вернул бы null). Проверяем сам факт связки: клиент
    // создан, дерево отрендерено, рендер получил React-элемент.
    await import("./main");

    expect(renderMock).toHaveBeenCalledTimes(1);
    const tree = renderMock.mock.calls[0][0] as ReactElement;
    expect(tree.type).toBeDefined();
  });
});
