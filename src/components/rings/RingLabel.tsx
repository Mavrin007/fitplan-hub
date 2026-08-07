import { memo } from "react";
import type { RingDetail } from "./types";

interface RingLabelProps {
  /** Большое число в центре (может быть >100 при переборе). */
  percent: number;
  /** Подпись под числом: «Сегодня», «Выполнено». */
  caption: string;
  /** true, когда суммарный прогресс превысил цель. */
  over: boolean;
  /** Цвет числа при переборе (цвет кольца-лидера). */
  color: string;
  /** Строки деталей, показываемые при наведении. */
  details: RingDetail[];
}

/**
 * Центр композита колец. По умолчанию — большое число (процент) с подписью;
 * при наведении на композит (класс `group` на родителе) плавно подменяется
 * списком деталей колец («Калории 742 / 800»). Переключение чисто CSS —
 * без состояний и лишних ре-рендеров. Детали скрыты от скринридеров
 * (aria-hidden): данные доступны через role="progressbar" у каждого кольца.
 */
export const RingLabel = memo(function RingLabel({
  percent,
  caption,
  over,
  color,
  details,
}: RingLabelProps) {
  return (
    <div className="pointer-events-none relative flex h-full w-full items-center justify-center">
      {/* Основной слой: процент + подпись */}
      <div className="flex flex-col items-center gap-1 transition-opacity duration-200 group-hover:opacity-0">
        <span
          className="num text-[1.7em] font-semibold leading-none tracking-tight"
          style={{ color: over ? color : "inherit" }}
        >
          {percent}%
        </span>
        <span className="text-[0.56em] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {caption}
        </span>
      </div>

      {/* Hover-слой: детали колец */}
      <div
        aria-hidden="true"
        className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
      >
        {details.map((d) => (
          <div key={d.label} className="flex items-center gap-1.5 text-[0.6em] leading-tight">
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ background: d.color }}
            />
            <span className="text-muted-foreground">{d.label}</span>
            <span className="num font-medium tabular-nums">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
});
