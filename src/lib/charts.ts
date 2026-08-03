/* ------------------------------------------------------------------ */
/* Общие настройки recharts — единый стиль графиков по всему приложению */
/* ------------------------------------------------------------------ */

/**
 * Высота графиков (в пикселях) внутри карточек `ChartCard`.
 *
 * Передаётся как проп `height` компонента `ResponsiveContainer`,
 * поэтому график занимает всю ширину карточки при фиксированной высоте:
 *
 * ```tsx
 * <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
 *   <AreaChart data={data}>…</AreaChart>
 * </ResponsiveContainer>
 * ```
 *
 * Используется на странице «Прогресс». На «Профиле» график веса намеренно
 * ниже (200 px) — там свои inline-значения.
 */
export const CHART_HEIGHT = 220;

/**
 * Общие настройки осей `XAxis` / `YAxis` — единый вид у всех графиков.
 *
 * Распространяется через спред-оператор:
 *
 * ```tsx
 * <XAxis dataKey="date" interval={labelInterval} {...axisProps} />
 * <YAxis width={34} {...axisProps} />
 * ```
 *
 * Свойства:
 * - `tick` — стиль подписей: размер 11px, цвет из токена
 *   `--muted-foreground` (автоматически переключается между темами);
 * - `axisLine` / `tickLine` — отключены: минимализм без рамок и засечек.
 */
export const axisProps = {
  tick: { fontSize: 11, fill: "var(--muted-foreground)" },
  axisLine: false,
  tickLine: false,
} as const;

/**
 * Общие настройки сетки `CartesianGrid`.
 *
 * ```tsx
 * <CartesianGrid {...gridProps} />
 * ```
 *
 * Свойства:
 * - `strokeDasharray: "3 3"` — пунктирные линии, чтобы сетка не спорила
 *   с данными;
 * - `stroke: "var(--border)"` — цвет из токена рамок (адаптируется к теме);
 * - `vertical: false` — только горизонтальные линии, без вертикальных.
 */
export const gridProps = {
  strokeDasharray: "3 3",
  stroke: "var(--border)",
  vertical: false,
} as const;

/**
 * Общие настройки тултипа `Tooltip`.
 *
 * ```tsx
 * <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--muted)" }} />
 * ```
 *
 * Свойства:
 * - `background: "var(--popover)"` — фон всплывающей подсказки;
 * - `border` — тонкая рамка из токена `--border`;
 * - `borderRadius: 8` — скругление;
 * - `fontSize: 12` — компактный текст;
 * - `color: "var(--foreground)"` — основной цвет текста.
 */
export const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--foreground)",
} as const;

/**
 * Анимация плавной «прорисовки» линий и областей (`Area`, `Line`).
 *
 * ```tsx
 * <Area dataKey="weight" {...lineAnim} />
 * ```
 *
 * - `animationBegin: 120` — задержка перед стартом (мс), чтобы графика
 *   появилась после карточки;
 * - `animationDuration: 900` — длительность прорисовки (мс);
 * - `animationEasing: "ease-out"` — замедление к концу, линия «доезжает».
 *
 * Чтобы анимация проигрывалась заново при смене данных (например, периода
 * 7/30/90 дней), задайте `ResponsiveContainer` проп `key`, зависящий от
 * данных: `<ResponsiveContainer key={`weight-${period}`} …>`.
 */
export const lineAnim = {
  animationBegin: 120,
  animationDuration: 900,
  animationEasing: "ease-out",
} as const;

/**
 * Анимация роста столбцов (`Bar`) — бары «вырастают» снизу вверх.
 *
 * ```tsx
 * <Bar dataKey="calories" {...barAnim} />
 * ```
 *
 * - `animationBegin: 120` — задержка перед стартом (мс);
 * - `animationDuration: 700` — длительность роста (мс);
 * - `animationEasing: "ease-out"` — замедление к концу.
 *
 * Как и у `lineAnim`, для повторного проигрывания при смене данных
 * используйте `key` на `ResponsiveContainer`.
 */
export const barAnim = {
  animationBegin: 120,
  animationDuration: 700,
  animationEasing: "ease-out",
} as const;

/**
 * Подпись цели для пунктирной линии `ReferenceLine`.
 *
 * Возвращает объект, который передаётся в проп `label`:
 *
 * ```tsx
 * <ReferenceLine
 *   y={targetWeight}
 *   stroke="var(--muted-foreground)"
 *   strokeDasharray="4 4"
 *   label={goalLabel(`Цель ${targetWeight.toFixed(1)}`)}
 * />
 * ```
 *
 * @param text Текст подписи, например «Цель 72.0» или «Цель».
 * @returns Настройки recharts для подписи: текст, позиция
 *   `insideTopRight` (внутри графика у верхнего правого края линии),
 *   цвет `--muted-foreground` и размер шрифта 10px.
 */
export function goalLabel(text: string) {
  return {
    value: text,
    position: "insideTopRight" as const,
    fill: "var(--muted-foreground)",
    fontSize: 10,
  };
}
