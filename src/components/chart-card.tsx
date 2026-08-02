import type { ReactNode } from "react";

/** Общая карточка графика: заголовок + подзаголовок + необязательная легенда.
 *  Единый стиль карточек приложения (rounded-xl + elevation 1) — совпадает
 *  с карточками на Обзоре, Питании, Тренировках и Профиле. */
export function ChartCard({
  title,
  subtitle,
  legend,
  children,
}: {
  title: string;
  subtitle: string;
  legend?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card p-6 shadow-elev-1 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="m3-title-small">{title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        </div>
        {legend && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {legend}
          </div>
        )}
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

/** Элемент легенды: цветной квадрат или пунктирная линия + подпись. */
export function LegendChip({
  color,
  dashed,
  label,
}: {
  color: string;
  dashed?: boolean;
  label: string;
}) {
  return (
    <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
      {dashed ? (
        <span
          className="inline-block w-4 border-t-2 border-dashed"
          style={{ borderColor: color }}
        />
      ) : (
        <span
          className="inline-block size-2 rounded-[2px]"
          style={{ background: color }}
        />
      )}
      {label}
    </span>
  );
}
