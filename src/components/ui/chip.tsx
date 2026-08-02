import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** M3 filter chip — компактный выбор/фильтр. Выбранный: secondary-container
 *  с on-secondary-container текстом; обычный: outline + on-surface-variant. */
export function Chip({
  selected,
  onClick,
  icon,
  children,
  className,
  ariaLabel,
}: {
  selected?: boolean;
  onClick?: () => void;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={ariaLabel}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium transition-all active:scale-[0.97]",
        selected
          ? "border-transparent bg-secondary-container text-on-secondary-container"
          : "border-outline-variant bg-transparent text-on-surface-variant hover:border-outline hover:bg-secondary-container/50 hover:text-on-secondary-container",
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}
