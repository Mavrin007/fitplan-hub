import { useEffect, useRef, useState } from "react";
import { Trash2, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Двухшаговая кнопка удаления: первый клик «взводит» кнопку — она становится
 * красной с подписью «Точно удалить?», второй клик вызывает `onConfirm`.
 *
 * Защищает от случайного удаления данных одним кликом: без подтверждения
 * кнопка через 2.5 секунды возвращается в исходное состояние. Ошибки и
 * успех обрабатывает вызывающий код (обычно тост).
 *
 * ```tsx
 * <ConfirmDelete onConfirm={() => void handleDelete(id)} iconOnly />
 * ```
 *
 * @param onConfirm Выполняется только после подтверждения (второй клик).
 * @param label Подпись в обычном состоянии.
 * @param confirmLabel Подпись во «взведённом» состоянии.
 * @param busy Отключает кнопку во время удаления.
 * @param iconOnly Компактный вид для строк списка: только иконка корзины.
 */
export function ConfirmDelete({
  onConfirm,
  label = "Удалить",
  confirmLabel = "Точно удалить?",
  busy = false,
  iconOnly = false,
  className,
}: {
  onConfirm: () => void;
  label?: string;
  confirmLabel?: string;
  busy?: boolean;
  iconOnly?: boolean;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const handleClick = () => {
    if (busy) return;
    if (!armed) {
      setArmed(true);
      timer.current = window.setTimeout(() => setArmed(false), 2500);
      return;
    }
    if (timer.current) window.clearTimeout(timer.current);
    setArmed(false);
    onConfirm();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      aria-label={armed ? confirmLabel : label}
      title={armed ? confirmLabel : label}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
        armed
          ? "bg-destructive/10 text-destructive"
          : "text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
        className,
      )}
    >
      {armed ? (
        <>
          <TriangleAlert className={iconOnly ? "size-3.5" : "size-4"} />
          <span className={iconOnly ? "text-[10px] font-semibold uppercase tracking-wide" : ""}>
            {confirmLabel}
          </span>
        </>
      ) : iconOnly ? (
        <Trash2 className="size-4" />
      ) : (
        <>
          <Trash2 className="size-4" />
          {label}
        </>
      )}
    </button>
  );
}
