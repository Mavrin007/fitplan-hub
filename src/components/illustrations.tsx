/** Набор лёгких SVG-иллюстраций в стиле приложения: тема-aware (цвета через
 *  CSS-переменные), без внешних картинок — не ломают офлайн и адаптируются к
 *  светлой/тёмной теме. Используются там, где визуал реально помогает:
 *  лендинг, пустые состояния, меню питания, тренировки. */

import { useId } from "react";

function useGradient(id: string, from: string, to: string, fromOpacity = 0.18, toOpacity = 0) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={from} stopOpacity={fromOpacity} />
      <stop offset="100%" stopColor={to} stopOpacity={toOpacity} />
    </linearGradient>
  );
}

/** Тарелка/миска с паром и листиком — «аппетитная» сцена для раздела питания. */
export function DishScene({ className }: { className?: string }) {
  const uid = useId();
  const gradId = `dish-${uid}`;
  return (
    <svg viewBox="0 0 160 120" className={className} role="presentation" aria-hidden>
      <defs>{useGradient(gradId, "var(--primary)", "var(--brand)", 0.2, 0.04)}</defs>

      {/* мягкий фон-пятно */}
      <circle cx="80" cy="62" r="52" fill={`url(#${gradId})`} />

      {/* тарелка: чаша + ободок */}
      <g fill="none" stroke="var(--foreground)" strokeWidth="2.5" strokeLinecap="round">
        <path d="M34 66 q46 34 92 0" opacity="0.85" />
        <path d="M30 64 q50 44 100 0 l-4 -6 q-46 36 -92 0 z" fill="var(--background)" strokeWidth="2" opacity="0.9" />
        <ellipse cx="80" cy="64" rx="50" ry="9" stroke="var(--brand)" strokeWidth="2" opacity="0.7" />
      </g>

      {/* пар */}
      <g stroke="var(--brand)" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.65">
        <path d="M64 36 q-5 -8 0 -14 q5 -8 0 -16" />
        <path d="M80 32 q-5 -8 0 -14 q5 -8 0 -16" />
        <path d="M96 36 q-5 -8 0 -14 q5 -8 0 -16" />
      </g>

      {/* листик-акцент */}
      <g stroke="var(--foreground)" strokeWidth="2" strokeLinecap="round" opacity="0.7">
        <path d="M122 34 q10 -16 26 -12 q-4 14 -18 14 z" fill="var(--background)" />
        <path d="M124 36 q8 -8 18 -10" />
      </g>

      {/* звёздочки */}
      <g stroke="var(--brand)" strokeWidth="2" strokeLinecap="round" opacity="0.8">
        <path d="M28 28 l3 3 M34 28 l-3 3" />
        <path d="M132 86 l3 3 M138 86 l-3 3" />
      </g>
    </svg>
  );
}

/** Фитнес-сцена: гантели, гиря, дуги движения и кольца — для лендинга
 *  и раздела тренировок. */
export function FitnessHero({ className }: { className?: string }) {
  const uid = useId();
  const gradId = `fit-${uid}`;
  return (
    <svg viewBox="0 0 240 200" className={className} role="presentation" aria-hidden>
      <defs>{useGradient(gradId, "var(--primary)", "var(--brand)", 0.16, 0.04)}</defs>

      {/* кольца */}
      <circle cx="120" cy="100" r="82" fill={`url(#${gradId})`} />
      <circle
        cx="120"
        cy="100"
        r="68"
        fill="none"
        stroke="var(--border)"
        strokeWidth="1.2"
        strokeDasharray="3 6"
        opacity="0.7"
      />

      {/* дуги движения */}
      <g stroke="var(--brand)" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.55">
        <path d="M36 74 q-18 26 0 52" />
        <path d="M204 74 q18 26 0 52" />
      </g>

      {/* гантель (наклонённая) */}
      <g
        stroke="var(--foreground)"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
        opacity="0.9"
        transform="rotate(-24 96 118)"
      >
        <line x1="96" y1="118" x2="146" y2="118" strokeWidth="5" />
        <line x1="96" y1="110" x2="96" y2="126" />
        <line x1="146" y1="110" x2="146" y2="126" />
      </g>

      {/* гиря */}
      <g
        stroke="var(--brand)"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
        opacity="0.9"
      >
        <path d="M162 74 h16 v10 a13 13 0 0 1 -26 0 z" fill="var(--background)" strokeWidth="2.5" />
        <path d="M164 84 a11 11 0 0 0 12 0" />
      </g>

      {/* звёздочки */}
      <g stroke="var(--brand)" strokeWidth="2.2" strokeLinecap="round" opacity="0.8">
        <path d="M52 40 l3.5 3.5 M59 40 l-3.5 3.5" />
        <path d="M196 150 l3.5 3.5 M203 150 l-3.5 3.5" />
      </g>
    </svg>
  );
}

/** Мини-график: линия с градиентной заливкой, столбцы и пунктирная цель —
 *  для разделов «Прогресс» и пустых состояний. */
export function ChartScene({ className }: { className?: string }) {
  const uid = useId();
  const gradId = `chart-${uid}`;
  return (
    <svg viewBox="0 0 200 120" className={className} role="presentation" aria-hidden>
      <defs>{useGradient(gradId, "var(--primary)", "var(--brand)", 0.22, 0.03)}</defs>

      {/* пунктирная цель */}
      <line
        x1="18"
        y1="34"
        x2="182"
        y2="34"
        stroke="var(--muted-foreground)"
        strokeWidth="1.4"
        strokeDasharray="4 5"
        opacity="0.7"
      />

      {/* столбцы */}
      <g fill="var(--muted-foreground)" opacity="0.45">
        <rect x="22" y="64" width="10" height="34" rx="3" />
        <rect x="44" y="52" width="10" height="46" rx="3" />
        <rect x="88" y="44" width="10" height="54" rx="3" />
        <rect x="132" y="58" width="10" height="40" rx="3" />
        <rect x="154" y="70" width="10" height="28" rx="3" />
      </g>

      {/* линия + градиент */}
      <path
        d="M22 70 L46 56 L70 64 L94 42 L118 48 L142 36 L166 44 L182 40 L182 92 L22 92 Z"
        fill={`url(#${gradId})`}
        stroke="none"
      />
      <path
        d="M22 70 L46 56 L70 64 L94 42 L118 48 L142 36 L166 44 L182 40"
        fill="none"
        stroke="var(--foreground)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.9"
      />

      {/* точки на линии */}
      <g fill="var(--brand)">
        <circle cx="22" cy="70" r="3" />
        <circle cx="94" cy="42" r="3.5" />
        <circle cx="142" cy="36" r="3.5" />
        <circle cx="182" cy="40" r="3" />
      </g>
    </svg>
  );
}

/** Сцена ИИ-ассистента: диалоговое окно с пузырём сообщения и искрой —
 *  для пустого чата и подсказок ассистента. */
export function AssistantScene({ className }: { className?: string }) {
  const uid = useId();
  const gradId = `asst-${uid}`;
  return (
    <svg viewBox="0 0 200 120" className={className} role="presentation" aria-hidden>
      <defs>{useGradient(gradId, "var(--primary)", "var(--brand)", 0.2, 0.04)}</defs>

      {/* мягкий фон-пятно */}
      <circle cx="100" cy="60" r="50" fill={`url(#${gradId})`} />

      {/* окно чата: карточка + пузырь сообщения с хвостиком */}
      <g
        stroke="var(--foreground)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity="0.9"
      >
        <rect x="52" y="34" width="96" height="46" rx="10" fill="var(--background)" />
        {/* три точки-сообщения */}
        <circle cx="68" cy="57" r="3" fill="var(--muted-foreground)" />
        <circle cx="80" cy="57" r="3" fill="var(--muted-foreground)" />
        <circle cx="92" cy="57" r="3" fill="var(--muted-foreground)" />
        {/* пузырь ответа */}
        <path d="M104 57 h24 a6 6 0 0 1 6 6 v8 q-4 -4 -8 -4 h-22 a6 6 0 0 1 -6 -6 v-4 a6 6 0 0 1 6 -6 z" fill="var(--brand)" stroke="var(--brand)" opacity="0.85" />
      </g>

      {/* искра-акцент */}
      <g stroke="var(--brand)" strokeWidth="2.2" strokeLinecap="round" opacity="0.9">
        <path d="M144 40 l3.5 3.5 M151 40 l-3.5 3.5" />
        <path d="M56 84 l2.5 2.5 M61 84 l-2.5 2.5" opacity="0.7" />
      </g>
    </svg>
  );
}

