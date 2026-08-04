import { useId, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Переиспользуемое «пустое состояние»: мягкая SVG-иллюстрация (фигура с
 * гантелью), заголовок, пояснение и опциональное действие. Используется на
 * страницах вместо голых пунктирных рамок, чтобы блоки без данных не выглядели
 * пустыми. Цвета берутся из темы (var(--primary), var(--brand), var(--foreground)).
 */
interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}

/** Минималистичная иллюстрация: фигура с поднятой гантелью + декоративные
 *  кольца. Адаптируется к светлой/тёмной теме через CSS-переменные. */
function EmptyIllustration() {
  // Уникальный id градиента на экземпляр — на странице может быть несколько
  // EmptyState, и дубли DOM-id ломали бы SVG-ссылку.
  const gradientId = useId();
  return (
    <svg
      viewBox="0 0 120 90"
      className="h-24 w-32 shrink-0"
      role="presentation"
      aria-hidden
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--brand)" stopOpacity="0.1" />
        </linearGradient>
      </defs>

      {/* Декоративные кольца */}
      <circle cx="60" cy="45" r="34" fill={`url(#${gradientId})`} />
      <circle
        cx="60"
        cy="45"
        r="26"
        fill="none"
        stroke="var(--border)"
        strokeWidth="1"
        strokeDasharray="3 5"
        opacity="0.6"
      />

      {/* Фигура: голова, корпус, руки к гантели, ноги */}
      <g
        stroke="var(--foreground)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity="0.8"
      >
        <circle cx="60" cy="19" r="5.5" fill="var(--background)" />
        <path d="M60 24.5 v13" />
        <path d="M60 31 L45 27.5" />
        <path d="M60 31 L75 27.5" />
        <path d="M60 37.5 L52.5 54" />
        <path d="M60 37.5 L67.5 54" />
      </g>

      {/* Гантель над головой */}
      <g
        stroke="var(--brand)"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      >
        <line x1="40" y1="26.5" x2="80" y2="26.5" />
        <line x1="40" y1="22" x2="40" y2="31" />
        <line x1="80" y1="22" x2="80" y2="31" />
      </g>

      {/* Декоративные звёздочки */}
      <g stroke="var(--brand)" strokeWidth="2" strokeLinecap="round">
        <path d="M20 22 l3 3 M26 22 l-3 3" opacity="0.8" />
        <path d="M98 58 l2.5 2.5 M103 58 l-2.5 2.5" opacity="0.6" />
      </g>
    </svg>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  compact,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card/50 px-6 text-center",
        compact ? "py-8" : "py-12",
        className,
      )}
    >
      <div className="relative">
        <EmptyIllustration />
        {Icon && (
          <span className="absolute -right-1 bottom-1 flex size-7 items-center justify-center rounded-full border bg-background text-primary shadow-sm">
            <Icon className="size-3.5" />
          </span>
        )}
      </div>
      <p className="text-sm font-semibold">{title}</p>
      {description && (
        <div className="max-w-md text-sm leading-5 text-muted-foreground">
          {description}
        </div>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
