/**
 * Единый loading-гейт страниц дашборда: скелетон с явным ARIA-статусом,
 * чтобы скринридеры (и e2e-а11y-проверки) видели, что данные ещё грузятся.
 *
 * Раньше каждая страница рисовала свой набор `animate-pulse`-блоков без
 * каких-либо aria-атрибутов — теперь состояние загрузки одно на всех и
 * доступно из вспомогательных технологий.
 */
export function PageLoading({
  label = "Загрузка данных…",
}: {
  label?: string;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      className="mx-auto max-w-3xl space-y-4"
    >
      <div className="h-8 w-44 animate-pulse rounded bg-muted" />
      <div className="h-64 animate-pulse rounded-lg border bg-muted/40" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
