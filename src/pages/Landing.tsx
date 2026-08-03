import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  Dumbbell,
  Flame,
  Scale,
  Sparkles,
  TrendingUp,
  UtensilsCrossed,
  Droplets,
} from "lucide-react";
import { Link } from "react-router";
import { ThemeToggle } from "@/components/theme-toggle";

const EASE = [0.22, 1, 0.36, 1] as const;

const fade = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: EASE },
};

/* ---------------------------------------------------------------- */
/* Анимированные счётчики                                            */
/* ---------------------------------------------------------------- */

function CountUp({
  to,
  decimals = 0,
  prefix = "",
  suffix = "",
}: {
  to: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const [val, setVal] = useState(0);

  useEffect(() => {
    if (!inView) return;
    let raf = 0;
    const start = performance.now();
    const duration = 1100;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(to * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, to]);

  return (
    <span ref={ref} className="num">
      {prefix}
      {val.toFixed(decimals)}
      {suffix}
    </span>
  );
}

/* ---------------------------------------------------------------- */
/* Мини-макеты интерфейса (чистый CSS/SVG, без данных)               */
/* ---------------------------------------------------------------- */

const MOCK_MACROS = [
  { label: "Белки", value: 150, total: 150, unit: "г" },
  { label: "Углеводы", value: 238, total: 300, unit: "г" },
  { label: "Жиры", value: 61, total: 80, unit: "г" },
];

function MockDashboard() {
  const ringR = 34;
  const ringC = 2 * Math.PI * ringR;
  const done = 2180;
  const total = 2400;

  return (
    <div className="relative">
      {/* Декоративный фон за карточкой */}
      <div
        aria-hidden
        className="bg-grid mask-fade-radial absolute -inset-8 -z-10 opacity-70"
      />
      <div
        aria-hidden
        className="absolute -top-10 left-1/2 -z-10 h-40 w-72 -translate-x-1/2 rounded-full bg-foreground/5 blur-3xl"
      />

      {/* Карточка-превью дашборда */}
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, delay: 0.3, ease: EASE }}
        className="glow overflow-hidden rounded-xl border bg-card"
      >
        {/* Полоса окна */}
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-muted-foreground/25" />
            <span className="size-2 rounded-full bg-muted-foreground/25" />
            <span className="size-2 rounded-full bg-muted-foreground/25" />
          </div>
          <p className="label-overline text-muted-foreground">Кило · Обзор</p>
          <span className="text-[10px] text-muted-foreground/60">сегодня</span>
        </div>

        <div className="grid grid-cols-[auto_1fr] items-center gap-5 p-5">
          {/* Кольцо калорий */}
          <div className="flex flex-col items-center gap-2">
            <div className="relative">
              <svg viewBox="0 0 96 96" className="size-24 -rotate-90">
                <circle
                  cx="48"
                  cy="48"
                  r={ringR}
                  fill="none"
                  strokeWidth="8"
                  className="stroke-muted"
                />
                <motion.circle
                  cx="48"
                  cy="48"
                  r={ringR}
                  fill="none"
                  strokeWidth="8"
                  strokeLinecap="round"
                  className="stroke-foreground"
                  strokeDasharray={ringC}
                  initial={{ strokeDashoffset: ringC }}
                  whileInView={{ strokeDashoffset: ringC * (1 - done / total) }}
                  viewport={{ once: true }}
                  transition={{ duration: 1.3, ease: EASE }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-base font-semibold num">
                  {Math.round((done / total) * 100)}%
                </span>
              </div>
            </div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {done.toLocaleString("ru-RU")} / {total.toLocaleString("ru-RU")} ккал
            </p>
          </div>

          {/* Макросы */}
          <div className="space-y-3">
            {MOCK_MACROS.map((m) => (
              <div key={m.label}>
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    {m.label}
                  </span>
                  <span className="text-xs num text-muted-foreground">
                    {m.value}
                    <span className="text-[10px]">/{m.total} {m.unit}</span>
                  </span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                  <motion.div
                    className="h-full rounded-full bg-foreground"
                    initial={{ width: 0 }}
                    whileInView={{ width: `${(m.value / m.total) * 100}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 1, delay: 0.4, ease: EASE }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Мини-график веса с линией цели */}
        <div className="border-t px-5 py-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Вес · тренд 30 дней
            </p>
            <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
              <TrendingUp className="size-3" /> −2.8 кг
            </span>
          </div>
          <svg viewBox="0 0 280 84" className="mt-2 w-full">
            <motion.path
              d="M0,16 L34,26 L64,20 L96,34 L128,27 L160,40 L192,34 L224,46 L254,41 L280,36"
              fill="none"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="stroke-foreground"
              initial={{ pathLength: 0 }}
              whileInView={{ pathLength: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1.5, ease: "easeOut" }}
            />
            <line
              x1="0"
              y1="58"
              x2="280"
              y2="58"
              strokeWidth="1"
              strokeDasharray="4 5"
              className="stroke-muted-foreground/50"
            />
            <text
              x="2"
              y="76"
              className="fill-muted-foreground font-mono text-[9px]"
            >
              цель 75 кг · пунктир
            </text>
          </svg>
        </div>

        {/* Чипы серии / воды */}
        <div className="flex flex-wrap items-center gap-2 border-t px-5 py-3.5">
          <span className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium">
            <Flame className="size-3 text-orange-500" />
            <span className="num">12</span> дней подряд
          </span>
          <span className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium">
            <Droplets className="size-3 text-sky-500" />
            <span className="num">1 750</span> мл воды
          </span>
          <span className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium">
            <Dumbbell className="size-3" />
            Неделя 3 · Пик
          </span>
        </div>
      </motion.div>

      {/* Плавающий бейдж ассистента */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 1.1, ease: EASE }}
        className="absolute -right-4 -top-5 hidden sm:block"
      >
        <motion.div
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
          className="flex items-center gap-2 rounded-full border bg-card py-2 pl-2.5 pr-4"
        >
          <span className="flex size-6 items-center justify-center rounded-full bg-foreground text-background">
            <Sparkles className="size-3" />
          </span>
          <span className="text-xs">
            Ассистент записал: <span className="font-medium">шашлык — 950 ккал</span>
          </span>
        </motion.div>
      </motion.div>
    </div>
  );
}

/* Мини-макет дневника питания */
function MockMeals() {
  const rows = [
    { name: "Овсянка", qty: "50 г", kcal: 195, time: "08:10" },
    { name: "Куриная грудка", qty: "200 г", kcal: 330, time: "13:25" },
    { name: "Гречка", qty: "150 г", kcal: 198, time: "13:30" },
    { name: "Шашлык из шеи", qty: "500 г", kcal: 950, time: "19:05" },
  ];
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <p className="label-overline text-muted-foreground">Дневник · сегодня</p>
        <span className="text-[10px] num text-muted-foreground">1 673 / 2 400 ккал</span>
      </div>
      <div className="divide-y">
        {rows.map((r, i) => (
          <motion.div
            key={r.name}
            initial={{ opacity: 0, x: -10 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: i * 0.08, ease: EASE }}
            className="flex items-center justify-between gap-3 px-4 py-2.5"
          >
            <div className="min-w-0">
              <p className="truncate text-sm">{r.name}</p>
              <p className="text-[10px] text-muted-foreground num">
                {r.qty} · {r.time}
              </p>
            </div>
            <span className="rounded-sm bg-secondary px-2 py-0.5 text-xs num">
              {r.kcal} ккал
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* Мини-макет плана тренировок с прогрессией */
function MockWorkout() {
  const exercises = [
    { name: "Жим лёжа", detail: "4 × 6–8", note: "+2.5 кг", priority: false },
    { name: "Тяга верхнего блока", detail: "4 × 6–8", note: "те же веса, +1 повтор", priority: false },
    { name: "Румынская тяга", detail: "3 × 8–10", note: "приоритет", priority: true },
    { name: "Планка", detail: "4 × 40–55с", note: "+5 секунд", priority: false },
  ];
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <p className="label-overline text-muted-foreground">Тренировки · цикл 4 недели</p>
        <div className="flex gap-0.5">
          {["1", "2", "3", "4"].map((w, i) => (
            <span
              key={w}
              className={
                i === 2
                  ? "rounded-md bg-foreground px-2 py-0.5 text-[10px] font-medium text-background num"
                  : "rounded-md px-2 py-0.5 text-[10px] text-muted-foreground num"
              }
            >
              Н{w}
            </span>
          ))}
        </div>
      </div>
      <div className="divide-y">
        {exercises.map((ex, i) => (
          <motion.div
            key={ex.name}
            initial={{ opacity: 0, x: 10 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: i * 0.08, ease: EASE }}
            className="flex items-center justify-between gap-3 px-4 py-2.5"
          >
            <div className="min-w-0">
              <p className="truncate text-sm">{ex.name}</p>
              <p className="text-[10px] text-muted-foreground num">{ex.detail}</p>
            </div>
            <span
              className={
                ex.priority
                  ? "rounded-sm bg-foreground/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
                  : "rounded-sm bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400"
              }
            >
              {ex.note}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* Мини-макет графика прогресса */
function MockProgress() {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <p className="label-overline text-muted-foreground">Прогресс · 90 дней</p>
        <div className="flex gap-0.5">
          {["7", "30", "90"].map((d, i) => (
            <span
              key={d}
              className={
                i === 2
                  ? "rounded-md bg-foreground px-2 py-0.5 text-[10px] font-medium text-background num"
                  : "rounded-md px-2 py-0.5 text-[10px] text-muted-foreground num"
              }
            >
              {d}
            </span>
          ))}
        </div>
      </div>
      <div className="p-4">
        <svg viewBox="0 0 300 120" className="w-full">
          {/* сетка */}
          {[20, 45, 70, 95].map((y) => (
            <line
              key={y}
              x1="0"
              y1={y}
              x2="300"
              y2={y}
              strokeWidth="1"
              className="stroke-muted-foreground/10"
            />
          ))}
          <motion.path
            d="M0,22 L40,30 L80,26 L120,40 L160,34 L200,48 L240,44 L280,56 L300,52"
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="stroke-foreground"
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.4, ease: "easeOut" }}
          />
          {/* пунктирная цель */}
          <line
            x1="0"
            y1="82"
            x2="300"
            y2="82"
            strokeWidth="1.5"
            strokeDasharray="5 5"
            className="stroke-muted-foreground/60"
          />
          <text x="2" y="102" className="fill-muted-foreground font-mono text-[9px]">
            цель 75 кг
          </text>
          <text x="2" y="116" className="fill-muted-foreground font-mono text-[9px]">
            сейчас 78.6 кг · осталось 3.6 кг
          </text>
        </svg>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Данные секций                                                    */
/* ---------------------------------------------------------------- */

const FEATURES = [
  {
    index: "01",
    icon: Scale,
    title: "Точные цели",
    body: "Калории и макросы рассчитываются по вашим данным — формула Миффлина–Сан Жеора, активность и корректировка под цель.",
  },
  {
    index: "02",
    icon: UtensilsCrossed,
    title: "План питания",
    body: "Дневной план, который соответствует вашим целям. Записывайте еду или генерируйте целый день в один клик.",
  },
  {
    index: "03",
    icon: Dumbbell,
    title: "Структурные тренировки",
    body: "4-недельный цикл с прогрессией нагрузки: база, +1 повтор, +2.5 кг и разгрузка — под ваш рост и уровень.",
  },
  {
    index: "04",
    icon: BarChart3,
    title: "Видимый прогресс",
    body: "Вес, калории и тренировки в графиках с линией цели. Маленькие шаги складываются в заметные тренды.",
  },
];

const STATS = [
  { value: 2, decimals: 0, suffix: "±", label: "точность плана питания" },
  { value: 4, decimals: 0, suffix: " нед.", label: "цикл прогрессии тренировок" },
  { value: 33, decimals: 0, suffix: " мл/кг", label: "умная норма воды" },
  { value: 24, decimals: 0, suffix: "/7", label: "ИИ-ассистент рядом" },
];

const PREVIEWS = [
  {
    icon: UtensilsCrossed,
    index: "01",
    title: "Дневник питания в один экран",
    body: "Каждый приём пищи — строка с калориями и макросами. Или просто скажите ассистенту «съел 500 г шашлыка» — он сам разберёт и запишет.",
    mock: <MockMeals />,
  },
  {
    icon: Dumbbell,
    index: "02",
    title: "Тренировки, которые растут вместе с вами",
    body: "План учитывает рост и телосложение: неподходящие упражнения заменяются с объяснением. А нагрузка прогрессирует сама — неделя за неделей.",
    mock: <MockWorkout />,
  },
  {
    icon: BarChart3,
    index: "03",
    title: "Прогресс с целью перед глазами",
    body: "Пунктирная линия целевого веса на графике — вы всегда видите, сколько осталось и в правильную ли сторону движетесь.",
    mock: <MockProgress />,
  },
];

const STEPS = [
  { n: "1", title: "Расскажите о себе", body: "Возраст, рост, вес, активность и цель." },
  { n: "2", title: "Получите свои цифры", body: "Дневные калории и макросы, рассчитанные точно." },
  { n: "3", title: "Ешьте, тренируйтесь, повторяйте", body: "Ведите дневник, следуйте плану, следите за трендом." },
];

export default function Landing() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background text-foreground">
      {/* Nav */}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <Link to="/" className="group flex items-baseline gap-1.5">
          <span className="text-sm font-semibold tracking-[0.28em] uppercase transition-opacity group-hover:opacity-70">
            Кило
          </span>
          <span className="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
            ®
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link
            to="/auth"
            className="rounded-full border px-4 py-1.5 text-xs font-medium transition-colors hover:bg-secondary"
          >
            Войти
          </Link>
          <Link
            to="/auth"
            className="rounded-full bg-foreground px-4 py-1.5 text-xs font-medium text-background transition-opacity hover:opacity-90"
          >
            Создать профиль
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative mx-auto w-full max-w-6xl px-6 pb-16 pt-12 sm:pt-20">
        {/* фоновый декор: aurora-меш + сетка + шум */}
        <div
          aria-hidden
          className="bg-grid mask-fade-b pointer-events-none absolute inset-0 -z-10 opacity-60"
        />
        <div
          aria-hidden
          className="bg-aurora animate-aurora pointer-events-none absolute -inset-16 -z-10"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/2 -z-10 h-72 w-[42rem] max-w-full -translate-x-1/2 rounded-full bg-foreground/[0.04] blur-3xl"
        />
        {/* плавающий декоративный орб */}
        <div
          aria-hidden
          className="animate-float pointer-events-none absolute right-[8%] top-10 -z-10 hidden size-24 rounded-full border border-dashed lg:block"
        />

        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8">
          <div>
            <motion.div {...fade}>
              <p className="label-overline flex items-center gap-2 text-muted-foreground">
                <span className="inline-block size-1.5 rounded-full bg-foreground" />
                Фитнес и питание — каждый день в цифрах
              </p>
            </motion.div>
            <motion.h1
              {...fade}
              transition={{ ...fade.transition, delay: 0.08 }}
              className="mt-6 m3-display-large"
            >
              Знайте свои цифры.
              <br />
              <span className="text-muted-foreground">Улучшайте их.</span>
            </motion.h1>
            <motion.p
              {...fade}
              transition={{ ...fade.transition, delay: 0.16 }}
              className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg"
            >
              Кило превращает ваши цели в точные дневные ориентиры — калории,
              макросы, приёмы пищи и тренировки, — а затем показывает тренд,
              который создаёт ваша последовательность.
            </motion.p>
            <motion.div
              {...fade}
              transition={{ ...fade.transition, delay: 0.24 }}
              className="mt-10 flex flex-wrap items-center gap-4"
            >
              <Link
                to="/auth"
                className="animate-shine group inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-brand to-brand-deep px-6 py-3 text-sm font-medium text-primary-foreground shadow-elev-1 transition-all hover:shadow-elev-3 hover:brightness-110 active:scale-[0.97]"
              >
                Начать вести дневник
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                to="/auth"
                className="inline-flex items-center gap-2 rounded-full border px-6 py-3 text-sm font-medium transition-colors hover:bg-secondary"
              >
                Рассчитать цели
              </Link>
            </motion.div>

            {/* Пример целей с анимированными счётчиками */}
            <motion.div
              {...fade}
              transition={{ ...fade.transition, delay: 0.34 }}
              className="mt-12 grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-4"
            >
              {[
                { label: "Калории в день", value: 2180, unit: "ккал" },
                { label: "Белки", value: 150, unit: "г" },
                { label: "Углеводы", value: 238, unit: "г" },
                { label: "Жиры", value: 61, unit: "г" },
              ].map((t) => (
                <div key={t.label} className="bg-background p-4 sm:p-5">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    {t.label}
                  </p>
                  <p className="mt-2 text-xl font-semibold sm:text-2xl">
                    <CountUp to={t.value} />
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      {t.unit}
                    </span>
                  </p>
                </div>
              ))}
            </motion.div>
          </div>

          <MockDashboard />
        </div>
      </section>

      {/* Stats band */}
      <section className="border-y">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-px overflow-hidden border-x bg-border sm:grid-cols-4">
          {STATS.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.5, delay: i * 0.06, ease: EASE }}
              className="bg-background px-5 py-7"
            >
              <p className="m3-display-small">
                <CountUp to={s.value} decimals={s.decimals} suffix={s.suffix} />
              </p>
              <p className="mt-1.5 text-xs text-muted-foreground">{s.label}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section>
        <div className="mx-auto w-full max-w-6xl px-6 py-20">
          <motion.p {...fade} className="label-overline text-muted-foreground">
            Что умеет Кило
          </motion.p>
          <div className="mt-10 grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.index}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: i * 0.06, ease: EASE }}
                className="card-lift group relative bg-background p-6 hover:bg-secondary/40"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs num text-muted-foreground transition-colors group-hover:text-foreground">
                    {f.index}
                  </span>
                  <f.icon className="size-4 text-muted-foreground transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:text-foreground" />
                </div>
                <h3 className="mt-8 m3-title-medium">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {f.body}
                </p>
                <span className="absolute bottom-0 left-0 h-px w-0 bg-foreground transition-all duration-300 group-hover:w-full" />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Product preview */}
      <section className="border-t">
        <div className="mx-auto w-full max-w-6xl px-6 py-20">
          <motion.p {...fade} className="label-overline text-muted-foreground">
            Внутри Кило
          </motion.p>
          <motion.h2
            {...fade}
            transition={{ ...fade.transition, delay: 0.06 }}
            className="mt-4 max-w-xl m3-headline-large"
          >
            Не концепт — рабочий дневник, который уже считает.
          </motion.h2>

          <div className="mt-14 space-y-20">
            {PREVIEWS.map((p, i) => (
              <div
                key={p.index}
                className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16"
              >
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-80px" }}
                  transition={{ duration: 0.6, ease: EASE }}
                  className={i % 2 === 1 ? "lg:order-2" : ""}
                >
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-lg border">
                      <p.icon className="size-4" />
                    </span>
                    <span className="label-overline text-muted-foreground">
                      {p.index}
                    </span>
                  </div>
                  <h3 className="mt-5 m3-headline-small">
                    {p.title}
                  </h3>
                  <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
                    {p.body}
                  </p>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 24, scale: 0.98 }}
                  whileInView={{ opacity: 1, y: 0, scale: 1 }}
                  viewport={{ once: true, margin: "-80px" }}
                  transition={{ duration: 0.7, delay: 0.1, ease: EASE }}
                  className={i % 2 === 1 ? "lg:order-1" : ""}
                >
                  {p.mock}
                </motion.div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t">
        <div className="mx-auto w-full max-w-6xl px-6 py-20">
          <motion.p {...fade} className="label-overline text-muted-foreground">
            Как это работает
          </motion.p>
          <div className="mt-10 grid gap-10 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <motion.div
                key={s.n}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: i * 0.08, ease: EASE }}
                className="border-t pt-5"
              >
                <span className="text-3xl font-semibold num text-muted-foreground/40">
                  {s.n}
                </span>
                <h3 className="mt-3 m3-title-medium">{s.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{s.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t">
        <div className="relative mx-auto w-full max-w-6xl px-6 py-24 text-center">
          <div
            aria-hidden
            className="bg-grid mask-fade-radial pointer-events-none absolute inset-0 -z-10 opacity-50"
          />
          <div
            aria-hidden
            className="bg-aurora animate-aurora pointer-events-none absolute -inset-10 -z-10"
          />
          <div
            aria-hidden
            className="animate-float pointer-events-none absolute left-[14%] top-12 -z-10 hidden size-14 rounded-full border border-dashed sm:block"
          />
          <div
            aria-hidden
            className="animate-float pointer-events-none absolute right-[16%] bottom-10 -z-10 hidden size-10 rounded-full border border-dashed sm:block"
            style={{ animationDelay: "1.4s" }}
          />
          <motion.div {...fade}>
            <p className="label-overline text-muted-foreground">
              Всё начинается с профиля
            </p>
            <h2 className="mx-auto mt-4 max-w-2xl m3-display-medium">
              Последовательность — единственный секрет.
            </h2>
            <p className="mx-auto mt-4 max-w-md text-sm text-muted-foreground sm:text-base">
              Задайте цели сегодня. Всё остальное — просто записи в дневнике.
            </p>
            <Link
              to="/auth"
              className="animate-shine group mt-8 inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-brand to-brand-deep px-7 py-3 text-sm font-medium text-primary-foreground shadow-elev-1 transition-all hover:shadow-elev-3 hover:brightness-110 active:scale-[0.97]"
            >
              Создать профиль
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 sm:flex-row">
          <p className="flex items-baseline gap-1.5">
            <span className="text-xs font-semibold tracking-[0.28em] uppercase">Кило</span>
            <span className="text-[9px] text-muted-foreground uppercase">®</span>
          </p>
          <p className="text-xs text-muted-foreground">
            Фитнес и питание. Ваши данные остаются вашими.
          </p>
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()}</p>
        </div>
      </footer>
    </div>
  );
}
