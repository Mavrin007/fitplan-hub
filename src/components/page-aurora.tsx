/** Декоративное aurora-свечение за заголовком страницы кабинета.
 *  Обязателен родитель с `relative isolate`: isolate создаёт контекст
 *  наложения, внутри которого -z-10 держит пятно позади контента, но не
 *  уводит его под фон шелла Dashboard. */
export function PageAurora() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute -top-28 left-1/2 -z-10 h-56 w-[36rem] max-w-full -translate-x-1/2 rounded-full bg-brand/10 blur-3xl"
    />
  );
}
