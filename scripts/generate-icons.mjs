// Генератор фирменного знака «КИЛО»: кольцо прогресса в брендовых тонах.
// Единый источник геометрии → SVG (public/logo.svg) + PNG-иконки (192/512/maskable/favicon).
// Без внешних зависимостей: растер вручную (суперсэмплинг) + PNG-энкодер на zlib.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public");

// ---------- Цвета (OKLCH из src/index.css → sRGB) ----------
function oklchToSrgb(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const b2 = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  const f = (v) => {
    v = Math.max(0, Math.min(1, v));
    return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  };
  return [f(r), f(g), f(b2)];
}
const hex = (rgb) =>
  "#" + rgb.map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("");

// Бренд: --brand oklch(0.45 0.11 185), --brand-deep oklch(0.25 0.07 185)
const DEEP = oklchToSrgb(0.25, 0.07, 185);
const BRAND = oklchToSrgb(0.45, 0.11, 185);
const BRIGHT = oklchToSrgb(0.62, 0.12, 185);
const WHITE = oklchToSrgb(0.99, 0, 0);
const HEX = { DEEP: hex(DEEP), BRAND: hex(BRAND), BRIGHT: hex(BRIGHT), WHITE: hex(WHITE) };
console.log("Палитра:", HEX);

// ---------- Геометрия (доли от размера S) ----------
const R_OUTER = 0.335; // внешний радиус кольца
const R_INNER = 0.265; // внутренний радиус кольца
const R_MID = (R_OUTER + R_INNER) / 2; // 0.30
const TH = R_OUTER - R_INNER; // толщина кольца
const ARC_START_DEG = -90; // старт сверху (12 часов)
const ARC_LEN_DEG = 252; // ~70% прогресса
const DOT_R = 0.052; // белая точка в центре
const DOT_INNER_R = 0.022; // ядро точки в цвете бренда
const RADIUS_FRAC = 0.21; // скругление подложки (0 для maskable)

// ---------- Рендер одного пикселя ----------
function shade(px, py, S, maskable) {
  const cx = S / 2;
  const cy = S / 2;
  const rRect = maskable ? 0 : RADIUS_FRAC * S;
  // Rounded-rect подложка (или полный квадрат для maskable)
  const hw = S / 2 - rRect;
  const dx = Math.abs(px - cx) - hw;
  const dy = Math.abs(py - cy) - hw;
  const qx = Math.max(dx, 0);
  const qy = Math.max(dy, 0);
  if (Math.hypot(qx, qy) > rRect) return [0, 0, 0, 0];

  // Градиент подложки: deep (верх-лево) → brand (низ-право) + светлое ядро
  const t = (px + py) / (2 * S);
  let r = DEEP[0] + (BRAND[0] - DEEP[0]) * t;
  let g = DEEP[1] + (BRAND[1] - DEEP[1]) * t;
  let b = DEEP[2] + (BRAND[2] - DEEP[2]) * t;
  // Мягкое свечение к центру
  const glowD = Math.hypot(px - cx, py - cy) / (0.62 * S);
  const glow = Math.max(0, 1 - glowD) * 0.1;
  r = r + (BRIGHT[0] - r) * glow;
  g = g + (BRIGHT[1] - g) * glow;
  b = b + (BRIGHT[2] - b) * glow;

  const d = Math.hypot(px - cx, py - cy);
  const inRing = d >= R_INNER * S && d <= R_OUTER * S;

  // Кольцо-трек
  let a = 1;
  if (inRing) {
    r = r + (WHITE[0] - r) * 0.16;
    g = g + (WHITE[1] - g) * 0.16;
    b = b + (WHITE[2] - b) * 0.16;
  }

  // Дуга прогресса с круглыми концами
  const inArc = (() => {
    if (!inRing) return false;
    const ang = (Math.atan2(py - cy, px - cx) * 180) / Math.PI;
    const norm = ((ang - ARC_START_DEG) % 360 + 360) % 360;
    if (norm <= ARC_LEN_DEG) return true;
    // Колпачки на концах дуги
    const hw2 = TH * S * 0.5;
    const sAng = (ARC_START_DEG * Math.PI) / 180;
    const eAng = ((ARC_START_DEG + ARC_LEN_DEG) * Math.PI) / 180;
    const sX = cx + R_MID * S * Math.cos(sAng);
    const sY = cy + R_MID * S * Math.sin(sAng);
    const eX = cx + R_MID * S * Math.cos(eAng);
    const eY = cy + R_MID * S * Math.sin(eAng);
    return Math.hypot(px - sX, py - sY) <= hw2 || Math.hypot(px - eX, py - eY) <= hw2;
  })();
  if (inArc) {
    r = WHITE[0];
    g = WHITE[1];
    b = WHITE[2];
  }

  // Центральная точка: белое кольцо с ядром в цвете бренда
  if (d <= DOT_R * S) {
    r = WHITE[0];
    g = WHITE[1];
    b = WHITE[2];
    if (d <= DOT_INNER_R * S) {
      r = BRAND[0];
      g = BRAND[1];
      b = BRAND[2];
    }
  }

  return [r * 255, g * 255, b * 255, a * 255];
}

// ---------- OG-карточка 1200×630 (для соцсетей) ----------
// Тот же рисунок, что и в иконках: брендовый градиент + кольцо прогресса.
// Центр кольца — геометрический центр карточки, масштаб — по меньшей
// стороне (S = min(W, H)), чтобы рисунок не тянулся.
const OG_W = 1200;
const OG_H = 630;

function ogPixel(px, py) {
  const cx = OG_W / 2;
  const cy = OG_H / 2;
  const S = Math.min(OG_W, OG_H);

  // Фон: диагональный градиент deep → brand на весь канвас + мягкое свечение к центру
  const t = (px + py) / (OG_W + OG_H);
  let r = DEEP[0] + (BRAND[0] - DEEP[0]) * t;
  let g = DEEP[1] + (BRAND[1] - DEEP[1]) * t;
  let b = DEEP[2] + (BRAND[2] - DEEP[2]) * t;
  const glowD = Math.hypot(px - cx, py - cy) / (0.7 * S);
  const glow = Math.max(0, 1 - glowD) * 0.12;
  r = r + (BRIGHT[0] - r) * glow;
  g = g + (BRIGHT[1] - g) * glow;
  b = b + (BRIGHT[2] - b) * glow;

  const d = Math.hypot(px - cx, py - cy);
  const inRing = d >= R_INNER * S && d <= R_OUTER * S;

  // Трек кольца — лёгкое осветление фона
  if (inRing) {
    r = r + (WHITE[0] - r) * 0.16;
    g = g + (WHITE[1] - g) * 0.16;
    b = b + (WHITE[2] - b) * 0.16;
  }

  // Дуга прогресса с круглыми концами (та же геометрия, что в иконках)
  const inArc = (() => {
    if (!inRing) return false;
    const ang = (Math.atan2(py - cy, px - cx) * 180) / Math.PI;
    const norm = ((ang - ARC_START_DEG) % 360 + 360) % 360;
    if (norm <= ARC_LEN_DEG) return true;
    const hw2 = TH * S * 0.5;
    const sAng = (ARC_START_DEG * Math.PI) / 180;
    const eAng = ((ARC_START_DEG + ARC_LEN_DEG) * Math.PI) / 180;
    const sX = cx + R_MID * S * Math.cos(sAng);
    const sY = cy + R_MID * S * Math.sin(sAng);
    const eX = cx + R_MID * S * Math.cos(eAng);
    const eY = cy + R_MID * S * Math.sin(eAng);
    return Math.hypot(px - sX, py - sY) <= hw2 || Math.hypot(px - eX, py - eY) <= hw2;
  })();
  if (inArc) {
    r = WHITE[0];
    g = WHITE[1];
    b = WHITE[2];
  }

  // Центральная точка: белое кольцо с ядром в цвете бренда
  if (d <= DOT_R * S) {
    r = WHITE[0];
    g = WHITE[1];
    b = WHITE[2];
    if (d <= DOT_INNER_R * S) {
      r = BRAND[0];
      g = BRAND[1];
      b = BRAND[2];
    }
  }

  return [r * 255, g * 255, b * 255, 255];
}

function rasterizeOg(ss = 3) {
  const buf = Buffer.alloc(OG_W * OG_H * 4);
  for (let y = 0; y < OG_H; y++) {
    for (let x = 0; x < OG_W; x++) {
      let ar = 0;
      let ag = 0;
      let ab = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const px = x + (sx + 0.5) / ss;
          const py = y + (sy + 0.5) / ss;
          const [cr, cg, cb] = ogPixel(px, py);
          ar += cr;
          ag += cg;
          ab += cb;
        }
      }
      const n = ss * ss;
      const o = (y * OG_W + x) * 4;
      buf[o] = Math.round(ar / n);
      buf[o + 1] = Math.round(ag / n);
      buf[o + 2] = Math.round(ab / n);
      buf[o + 3] = 255;
    }
  }
  return buf;
}

// ---------- Растр с суперсэмплингом ----------
function rasterize(S, maskable = false, ss = 3) {
  const buf = Buffer.alloc(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let ar = 0;
      let ag = 0;
      let ab = 0;
      let aa = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const px = x + (sx + 0.5) / ss;
          const py = y + (sy + 0.5) / ss;
          const [cr, cg, cb, ca] = shade(px, py, S, maskable);
          ar += cr;
          ag += cg;
          ab += cb;
          aa += ca;
        }
      }
      const n = ss * ss;
      const o = (y * S + x) * 4;
      buf[o] = Math.round(ar / n);
      buf[o + 1] = Math.round(ag / n);
      buf[o + 2] = Math.round(ab / n);
      buf[o + 3] = Math.round(aa / n);
    }
  }
  return buf;
}

// ---------- PNG-энкодер ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(W, H, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// ---------- SVG (тот же рисунок, векторно) ----------
function svgLogo() {
  const S = 512;
  const cx = S / 2;
  const cy = S / 2;
  const R = R_MID * S;
  const w = TH * S;
  const sAng = (ARC_START_DEG * Math.PI) / 180;
  const eAng = ((ARC_START_DEG + ARC_LEN_DEG) * Math.PI) / 180;
  const sX = (cx + R * Math.cos(sAng)).toFixed(2);
  const sY = (cy + R * Math.sin(sAng)).toFixed(2);
  const eX = (cx + R * Math.cos(eAng)).toFixed(2);
  const eY = (cy + R * Math.sin(eAng)).toFixed(2);
  const largeArc = ARC_LEN_DEG > 180 ? 1 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${HEX.DEEP}"/>
      <stop offset="1" stop-color="${HEX.BRAND}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.62">
      <stop offset="0" stop-color="${HEX.BRIGHT}" stop-opacity="0.35"/>
      <stop offset="1" stop-color="${HEX.BRIGHT}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="107" fill="url(#bg)"/>
  <rect width="512" height="512" rx="107" fill="url(#glow)"/>
  <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${HEX.WHITE}" stroke-opacity="0.16" stroke-width="${w.toFixed(1)}"/>
  <path d="M ${sX} ${sY} A ${R.toFixed(1)} ${R.toFixed(1)} 0 ${largeArc} 1 ${eX} ${eY}"
        fill="none" stroke="${HEX.WHITE}" stroke-width="${w.toFixed(1)}" stroke-linecap="round"/>
  <circle cx="${cx}" cy="${cy}" r="${(DOT_R * S).toFixed(1)}" fill="${HEX.WHITE}"/>
  <circle cx="${cx}" cy="${cy}" r="${(DOT_INNER_R * S).toFixed(1)}" fill="${HEX.BRAND}"/>
</svg>
`;
}

// ---------- Вывод ----------
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "logo.svg"), svgLogo(), "utf8");
console.log("✓ public/logo.svg");

const jobs = [
  { file: "icon-192.png", size: 192, maskable: false },
  { file: "icon-512.png", size: 512, maskable: false },
  { file: "icon-maskable-512.png", size: 512, maskable: true },
  { file: "favicon.png", size: 64, maskable: false },
];
for (const j of jobs) {
  const rgba = rasterize(j.size, j.maskable);
  writeFileSync(join(OUT, j.file), encodePng(j.size, j.size, rgba));
  console.log(`✓ public/${j.file} (${j.size}×${j.size})`);
}

// OG-карточка 1200×630 (соцсети: Telegram, VK, Slack, Facebook).
const ogRgba = rasterizeOg();
writeFileSync(join(OUT, "og-image.png"), encodePng(OG_W, OG_H, ogRgba));
console.log(`✓ public/og-image.png (${OG_W}×${OG_H})`);
console.log("Готово.");
