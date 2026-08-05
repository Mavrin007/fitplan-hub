import { useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { Download, Link2, Loader2, LogOut, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { pluralRecords } from "@/lib/dates";
import { exportMeals, exportWeights, exportWorkouts } from "@/lib/export";
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
  // onSignOut живёт в замыкании рендера Dashboard; держим его в ref, чтобы
  // эффект автовыхода не перезапускался на каждый ре-рендер.
  const onSignOutRef = useRef(onSignOut);
  useEffect(() => {
    onSignOutRef.current = onSignOut;
  });

  // Дешёвая проверка «есть ли данные»: take(1) по таблицам. Записей нет —
  // диалог ни к чему, выходим сразу (показываем его только если проверка ещё
  // грузится, чтобы не было «моргания» пустого диалога).
  const hasData = useQuery(api.guestStats.hasMyData);
  useEffect(() => {
    if (open && hasData === false) onSignOutRef.current();
  }, [open, hasData]);

  // Точный счёт запрашиваем только когда данные есть и диалог остаётся
  // открытым: до подтверждения hasData запрос пропускается (skip), чтобы не
  // гонять collect() по всем таблицам вхолостую.
  const count = useQuery(
    api.guestStats.countMyData,
    hasData === true ? undefined : "skip",
  );

  const loading = hasData === undefined || count === undefined;

  // Полные строки для выгрузки подгружаются только по клику «Скачать свои
  // данные»: пока кнопка не нажата, все три запроса пропущены (skip), чтобы
  // оверлей оставался дешёвым — счёт уже посчитан, а тела записей нужны
  // лишь в момент экспорта. exportTick — счётчик кликов: каждый новый клик
  // сбрасывает ref-гард и перезапускает выгрузку (кнопку можно нажать снова).
  const [exportTick, setExportTick] = useState(0);
  const exportedRef = useRef(false);
  const weights = useQuery(
    api.weightEntries.listMyWeights,
    exportTick > 0 ? {} : "skip",
  );
  const meals = useQuery(
    api.mealLog.getByRange,
    exportTick > 0 ? { from: "0000-01-01", to: "9999-12-31" } : "skip",
  );
  const logs = useQuery(
    api.workouts.listLogs,
    exportTick > 0 ? {} : "skip",
  );
  const exportLoading =
    exportTick > 0 &&
    (weights === undefined || meals === undefined || logs === undefined);

  // Когда все три запроса ответили — отдаём файлы (три CSV: вес, питание,
  // тренировки). Функции экспорта сами создают Blob и запускают скачивание.
  // Гард exportedRef делает выгрузку строго разовой на один клик: повторные
  // рендеры с теми же ссылками данных не экспортируют заново.
  useEffect(() => {
    if (exportTick === 0) return;
    if (weights === undefined || meals === undefined || logs === undefined)
      return;
    if (exportedRef.current) return;
    exportedRef.current = true;
    exportWeights(weights);
    exportMeals(meals);
    exportWorkouts(logs);
    toast.success("Данные выгружены — три CSV-файла");
  }, [exportTick, weights, meals, logs]);

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
              : hasData
                ? `В гостевом аккаунте ${count} ${pluralRecords(count as number)}. Без привязки почты они будут недоступны после выхода и с других устройств.`
                : "В гостевом аккаунте пока нет записей — после выхода начнёте с чистого листа."}
          </DialogDescription>
        </DialogHeader>

        {/* Кнопки активны всегда — даже если счётчик ещё грузится (или запрос
            упал и остался undefined), пользователь может выйти или отменить. */}
        <div className="mt-2 flex flex-col gap-2">
          {hasData === true ? (
            <>
              <Button onClick={onAttach}>
                <Link2 className="size-4" />
                Привязать почту
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  exportedRef.current = false;
                  setExportTick((t) => t + 1);
                }}
                disabled={exportLoading}
              >
                {exportLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
                {exportLoading ? "Готовим файлы…" : "Скачать свои данные"}
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
