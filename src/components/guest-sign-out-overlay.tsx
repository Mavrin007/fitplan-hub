import { useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { Link2, LogOut, ShieldAlert } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { pluralRecords } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface GuestSignOutOverlayProps {
  open: boolean;
  /** Закрыть диалог (продолжить сессию). */
  onCancel: () => void;
  /** Перейти на страницу профиля, где есть форма привязки почты. */
  onAttach: () => void;
  /** Выйти, не сохраняя данные. */
  onSignOut: () => void;
}

/**
 * Защита данных гостя: перед выходом из анонимной сессии показываем, сколько
 * записей будет потеряно, и предлагаем привязать почту. Если записей нет —
 * выходим сразу, без лишнего клика.
 */
export function GuestSignOutOverlay({
  open,
  onCancel,
  onAttach,
  onSignOut,
}: GuestSignOutOverlayProps) {
  const count = useQuery(api.guestStats.countMyData);

  // onSignOut живёт в замыкании рендера Dashboard; держим его в ref, чтобы
  // эффект автовыхода не перезапускался на каждый ре-рендер.
  const onSignOutRef = useRef(onSignOut);
  useEffect(() => {
    onSignOutRef.current = onSignOut;
  });

  // Записей нет — диалог ни к чему: выходим сразу (показываем его только если
  // счётчик ещё грузится, чтобы не было «моргания» пустого диалога).
  useEffect(() => {
    if (open && count === 0) onSignOutRef.current();
  }, [open, count]);

  const loading = count === undefined;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-amber-500/15">
            <ShieldAlert className="size-5 text-amber-600 dark:text-amber-400" />
          </div>
          <DialogTitle>Сохранить данные перед выходом?</DialogTitle>
          <DialogDescription>
            {loading
              ? "Проверяем ваши данные…"
              : count === 0
                ? "В гостевом аккаунте пока нет записей — после выхода начнёте с чистого листа."
                : `В гостевом аккаунте ${count} ${pluralRecords(count)}. Без привязки почты они будут недоступны после выхода и с других устройств.`}
          </DialogDescription>
        </DialogHeader>

        {/* Кнопки активны всегда — даже если счётчик ещё грузится (или запрос
            упал и остался undefined), пользователь может выйти или отменить. */}
        <div className="mt-2 flex flex-col gap-2">
          {count !== undefined && count > 0 ? (
            <>
              <Button onClick={onAttach}>
                <Link2 className="size-4" />
                Привязать почту
              </Button>
              <Button variant="secondary" onClick={onSignOut}>
                <LogOut className="size-4" />
                Выйти всё равно
              </Button>
            </>
          ) : (
            <Button onClick={onSignOut}>
              <LogOut className="size-4" />
              Выйти
            </Button>
          )}
          <Button variant="ghost" onClick={onCancel}>
            Отмена
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
