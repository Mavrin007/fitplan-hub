import { useEffect, useRef, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { todayKey } from "@/lib/dates";
import { toast } from "sonner";
import {
  ArrowUp,
  Loader2,
  LogIn,
  Sparkles,
  TriangleAlert,
  Wifi,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link, useLocation } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { AssistantScene } from "@/components/illustrations";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  logged?: { kind: string; label: string }[];
  error?: boolean;
  /** Ответ — лимит/квота, а не сбой провайдера: показываем текст как есть,
   *  без красного бейджа «Не удалось получить ответ». */
  limited?: boolean;
}

/** Базовый префикс ключа. Полный ключ включает user.id: истории разных
 *  аккаунтов на одном устройстве не смешиваются. */
const STORAGE_KEY = "kilo-assistant-history";
const OPEN_EVENT = "kilo:open-assistant";

const QUICK_ACTIONS = [
  "Сколько мне нужно калорий и макросов в день?",
  "Составь меню на сегодня по моим целям",
  "Какую тренировку мне сделать сегодня?",
];

/** Страховка: убирает из ответа любые остатки служебных JSON-блоков
 *  (даже если ответ модели был обрезан на середине блока). */
function sanitizeReply(reply: string): string {
  return reply
    .replace(/<<<LOG>>>[\s\S]*?(<<<END>>>|$)/g, "")
    .replace(/```(?:json)?[\s\S]*?(```|$)/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function loadHistory(key: string | null): ChatMessage[] {
  if (!key || typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatMessage[];
    return Array.isArray(parsed) ? parsed.slice(-40) : [];
  } catch {
    return [];
  }
}

export function AssistantChat() {
  const runChat = useAction(api.assistant.chat);
  const checkConnection = useAction(api.assistant.checkConnection);
  const limit = useQuery(api.assistantLimits.getMyLimit);
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const location = useLocation();

  // История привязана к конкретному пользователю; у анонимов ключа нет.
  const storageKey =
    user && user._id ? `${STORAGE_KEY}:${user._id}` : null;

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    storageKey ? loadHistory(storageKey) : [],
  );
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [limitHit, setLimitHit] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Открытие из любой точки приложения (сайдбар, CTA-карточки).
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, handler);
    return () => window.removeEventListener(OPEN_EVENT, handler);
  }, []);

  // При смене пользователя (вход/выход/переключение аккаунта) загружаем
  // историю именно этого пользователя; для неавторизованных — пустой чат.
  useEffect(() => {
    if (user === undefined) return; // профиль ещё грузится — ничего не трогаем
    // Осознанная синхронизация: при смене пользователя читаем его историю из
    // localStorage. set-state-in-effect здесь не применимо — это реакция на
    // внешнее событие (вход/выход), а не каскадный перерендер.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessages(loadHistory(storageKey));
  }, [user, storageKey]);

  // История переживает перезагрузку страницы и сохраняется за пользователем.
  useEffect(() => {
    if (!storageKey) return; // чат анонима никуда не пишем
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(messages));
    } catch {
      // не критично
    }
  }, [messages, storageKey]);

  // Прокрутка вниз + фокус на вводе.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    if (open) {
      const t = window.setTimeout(() => inputRef.current?.focus(), 80);
      return () => window.clearTimeout(t);
    }
  }, [messages, busy, open]);

  // Escape закрывает чат.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const handleCheck = async () => {
    if (checking) return;
    setChecking(true);
    try {
      const res = await checkConnection();
      if (res.ok) {
        toast.success("Подключение работает", { description: res.message });
      } else {
        toast.error("Проблема с подключением", { description: res.message });
      }
    } catch {
      toast.error("Не удалось проверить подключение", {
        description: "Сервис не ответил. Попробуйте ещё раз.",
      });
    } finally {
      setChecking(false);
    }
  };

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = await runChat({
        messages: next.map((m) => ({ role: m.role, content: m.content })),
        date: todayKey(),
      });
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: sanitizeReply(res.reply),
          logged: res.logged,
          error: res.error ?? false,
          limited: res.limited ?? false,
        },
      ]);
      // 429 от сервера: дневная квота исчерпана или слишком часто. Блокируем
      // ввод до конца дня (квота) или на пару секунд (интервал).
      if (res.limited) {
        setLimitHit(true);
        if (res.remaining === 0) {
          toast.error("Дневной лимит ассистента исчерпан", {
            description: "Лимит обновится завтра. До этого чат доступен только для чтения.",
          });
        } else {
          toast.error("Слишком быстро", {
            description: "Подождите пару секунд перед следующим сообщением.",
          });
          window.setTimeout(() => setLimitHit(false), 2500);
        }
      }
      if (res.logged.length > 0) {
        toast.success("Записано в дневник", {
          description: res.logged.map((l) => l.label).join(" · "),
        });
      }
    } catch (err) {
      console.error("[AssistantChat]", err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Не удалось связаться с сервисом. Нажмите «Проверить подключение» (иконка Wi-Fi в шапке чата), чтобы узнать причину и что делать.",
          error: true,
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const showIntro = messages.length === 0;
  const canChat = isAuthenticated && !authLoading;
  const remaining = limit?.remaining ?? null;
  const tokensRemaining = limit?.tokensRemaining ?? null;
  // Квота исчерпана, когда остаток 0 (данные приходят из getMyLimit — счётчик
  // живёт на сервере и переживает перезагрузку). limitHit — короткое окно
  // анти-спама: ввод разблокируется сам через пару секунд.
  const quotaExhausted =
    remaining !== null && (remaining === 0 || tokensRemaining === 0);
  const inputBlocked = quotaExhausted || limitHit;
  const returnTo = `${location.pathname}${location.search}`;

  return (
    <>
      {/* Окно чата */}
      {open && (
        <div
          role="dialog"
          aria-label="ИИ-ассистент"
          className="fixed bottom-36 right-4 z-[80] flex h-[min(34rem,calc(100dvh-9rem))] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border bg-background shadow-2xl sm:right-6 lg:bottom-24"
        >
          {/* Шапка */}
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <Sparkles className="size-3.5" />
              <span className="label-overline">ИИ-ассистент</span>
              <span className="size-1.5 rounded-full bg-emerald-500" />
            </div>
            <div className="flex items-center gap-1">
              {canChat && (
                <button
                  type="button"
                  onClick={handleCheck}
                  disabled={checking}
                  title="Проверить подключение"
                  aria-label="Проверить подключение"
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
                >
                  {checking ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Wifi className="size-4" />
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                aria-label="Закрыть чат"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>

          {/* Сообщения */}
          <div
            ref={scrollRef}
            className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
          >
            {!canChat ? (
              <div className="rounded-lg border border-dashed p-4 text-center">
                <AssistantScene className="mx-auto h-20 w-32" />
                <p className="label-overline mt-2 text-muted-foreground">Кило AI</p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Ассистент видит ваши данные — калории, макросы, тренировки и
                  вес. Войдите, чтобы начать общение и записывать всё через чат.
                </p>
                <Link
                  to={`/auth?returnTo=${encodeURIComponent(returnTo)}`}
                  onClick={() => setOpen(false)}
                  className="mt-4 inline-flex items-center gap-2 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
                >
                  <LogIn className="size-4" />
                  Войти
                </Link>
              </div>
            ) : (
              <>
                {showIntro && (
                  <div className="rounded-lg border border-dashed p-4 text-center">
                    <AssistantScene className="mx-auto h-20 w-32" />
                    <p className="label-overline mt-2 text-muted-foreground">Кило AI</p>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      Спросите про калории, макросы, план питания или тренировки.
                      <br />
                      Напишите, что съели или как потренировались — я запишу это в
                      дневник.
                    </p>
                  </div>
                )}

                {messages.map((m, i) =>
                  m.role === "user" ? (
                    <div
                      key={i}
                      className="ml-auto max-w-[85%] rounded-lg rounded-tr-sm bg-foreground px-3 py-2 text-sm whitespace-pre-wrap text-background"
                    >
                      {m.content}
                    </div>
                  ) : (
                    <div
                      key={i}
                      className={cn(
                        "mr-auto max-w-[85%] rounded-lg rounded-tl-sm border bg-background px-3 py-2 text-sm whitespace-pre-wrap",
                        m.error && "border-amber-500/50",
                      )}
                    >
                      {m.error && !m.limited && (
                        <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                          <TriangleAlert className="size-3.5" />
                          Не удалось получить ответ
                        </span>
                      )}
                      {sanitizeReply(m.content)}
                      {m.logged && m.logged.length > 0 && (
                        <div className="mt-2 flex flex-col gap-1 border-t pt-2">
                          {m.logged.map((l, j) => (
                            <span
                              key={j}
                              className="label-overline text-muted-foreground"
                            >
                              ✓ {l.label}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ),
                )}

                {busy && (
                  <div className="mr-auto flex items-center gap-1.5 rounded-lg rounded-tl-sm border bg-background px-3 py-2.5">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="size-1.5 animate-bounce rounded-full bg-muted-foreground"
                        style={{ animationDelay: `${i * 150}ms` }}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Лимит: остаток сообщений и токенов на сегодня */}
          {canChat && remaining !== null && (
            <div
              className={cn(
                "flex items-center justify-between gap-2 border-t px-4 py-2",
                (remaining === 0 || tokensRemaining === 0) && "bg-amber-500/10",
              )}
            >
              <span className="text-[11px] text-muted-foreground">
                {remaining === 0 || tokensRemaining === 0
                  ? "Дневной лимит ассистента исчерпан"
                  : `Осталось сообщений: ${remaining}`}
                {tokensRemaining !== null && tokensRemaining > 0 && (
                  <span className="num">
                    {" · "}
                    токенов:{" "}
                    {Math.round(tokensRemaining / 1000)}k
                  </span>
                )}
              </span>
              <div
                className="h-1.5 flex-1 max-w-24 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-label="Остаток сообщений ассистента"
                aria-valuenow={remaining}
                aria-valuemin={0}
                aria-valuemax={limit?.limit ?? 1}
              >
                <div
                  className={cn(
                    "h-full rounded-full",
                    remaining === 0
                      ? "bg-amber-500"
                      : remaining <= 5
                        ? "bg-amber-400"
                        : "bg-brand",
                  )}
                  style={{ width: `${((limit?.limit ?? 1) - remaining) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Быстрые действия */}
          {canChat && showIntro && !busy && (
            <div className="flex flex-col gap-1.5 border-t px-4 py-3">
              {QUICK_ACTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => void send(q)}
                  className="rounded-md border px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Ввод */}
          {canChat && (
            <form
              className="flex items-center gap-2 border-t px-3 py-3"
              onSubmit={(e) => {
                e.preventDefault();
                void send(input);
              }}
            >
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Например: съел 200 г курицы и гречку…"
                className="h-9 flex-1 rounded-md border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus-visible:border-ring"
                disabled={busy || inputBlocked}
              />
              <button
                type="submit"
                disabled={busy || inputBlocked || !input.trim()}
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-md border transition-all",
                  input.trim() && !busy && !inputBlocked
                    ? "bg-foreground text-background hover:opacity-90 active:scale-95"
                    : "text-muted-foreground opacity-50",
                )}
                aria-label="Отправить"
              >
                <ArrowUp className="size-4" />
              </button>
            </form>
          )}
        </div>
      )}

      {/* Кнопка-лаунчер: видна на всех страницах приложения, над нижней
          навигацией на мобильных (bottom-20) и у края на десктопе (lg:bottom-5) */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "fixed bottom-20 right-4 z-[80] flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium shadow-lg transition-all hover:scale-[1.03] active:scale-[0.97] sm:right-6 lg:bottom-5",
          open ? "bg-background text-foreground" : "bg-foreground text-background",
        )}
        aria-label={open ? "Закрыть ассистента" : "Открыть ассистента"}
        aria-expanded={open}
      >
        <Sparkles className="size-4" />
        {open ? "Закрыть" : "Ассистент"}
        {!open && <span className="size-1.5 rounded-full bg-emerald-400" />}
      </button>
    </>
  );
}
