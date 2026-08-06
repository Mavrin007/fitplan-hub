#!/usr/bin/env node
/**
 * Аудитор мёртвых CSS-классов.
 *
 * Ищет классы, объявленные в src/index.css (вне @theme/:root-блоков), и
 * проверяет, что каждый встречается хотя бы раз в разметке проекта
 * (src/**\/*.tsx/*.ts, index.html). Классы без единого упоминания в
 * разметке печатаются как «мёртвые», скрипт выходит с кодом 1.
 *
 * Запуск: npm run css:audit
 *
 * Что учитывается:
 * - `.dark` — корневой класс тёмной темы (вешается на <html> рантаймом),
 *   всегда считается живым;
 * - классы, упомянутые в других CSS-селекторах (напр. `.dark .bg-noise`),
 *   не «оживляют» класс сами по себе — решает только использование в разметке;
 * - @keyframes, @apply и @theme-токены пропускаются (это не классы).
 *
 * Ограничения: слово-поиск по `className`-строкам; динамические классы,
 * собранные из частей (напр. `"m3-" + level`), дадут ложное срабатывание —
 * в этом случае добавьте имя в ALWAYS_ALIVE ниже с пояснением.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CSS_FILE = path.join(ROOT, "src", "index.css");
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "coverage",
  ".git",
  ".freebuff",
  "_generated", // сгенерированный convex-код классы не использует
]);

/** Классы, «живые» по построению, хотя в разметке их нет. */
const ALWAYS_ALIVE = new Set([
  // Корневой класс тёмной темы — useTheme() вешает его на <html>.
  "dark",
]);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(p, out);
    } else if (/\.(ts|tsx|html)$/.test(entry.name)) {
      out.push(p);
    }
  }
  return out;
}

/** Убирает блочные конструкции, где `.имя` — не CSS-класс. */
function stripNonClasses(src) {
  let s = src;
  // Блоки @theme (токены --var), :root и .dark { --var: ... } (переменные).
  s = s.replace(/@theme\s*(inline)?\s*\{[^}]*\}/gs, "");
  s = s.replace(/:root\s*\{[^}]*\}/gs, "");
  s = s.replace(/\.dark\s*\{[^}]*\}/gs, "");
  // @keyframes <имя> { ... } — имена анимаций, не классы.
  s = s.replace(/@keyframes\s+[^{]+\{[^}]*\}/gs, "");
  // @apply ...; — Tailwind-утилиты, не наши классы.
  s = s.replace(/@apply\s+[^;]+;/g, "");
  // url(...) — содержимое (напр. SVG data-URL с «www.w3.org» и вложенными
  // одинарными кавычками) даёт ложные классы (.org) и не является селектором.
  s = s.replace(/url\(\s*"[^"]*"\s*\)/g, "");
  s = s.replace(/url\(\s*'[^']*'\s*\)/g, "");
  s = s.replace(/url\([^)]*\)/g, "");
  // @import / @custom-variant / @layer-директивы без селекторов.
  return s;
}

/** Все классы, объявленные в CSS (включая `.dark .bg-noise`). */
function parseClasses(css) {
  const classes = new Set();
  for (const m of css.matchAll(/\.([a-zA-Z][\w-]*)/g)) {
    classes.add(m[1]);
  }
  return classes;
}

function main() {
  const css = fs.readFileSync(CSS_FILE, "utf8");
  const declared = parseClasses(stripNonClasses(css));

  const markupFiles = walk(path.join(ROOT, "src"));
  const rootHtml = path.join(ROOT, "index.html");
  if (fs.existsSync(rootHtml)) markupFiles.push(rootHtml);
  const markup = markupFiles
    .map((f) => fs.readFileSync(f, "utf8"))
    .join("\n");

  const dead = [];
  for (const cls of [...declared].sort()) {
    if (ALWAYS_ALIVE.has(cls)) continue;
    const re = new RegExp(`\\b${cls}\\b`, "g");
    if (!re.test(markup)) dead.push(cls);
  }

  if (dead.length === 0) {
    console.log(
      `css:audit: все ${declared.size} классов из index.css используются в разметке ✅`,
    );
    process.exit(0);
  }

  console.error(`css:audit: ${dead.length} мёртвых классов в src/index.css:`);
  for (const cls of dead) console.error(`  .${cls}`);
  console.error("Удалите их или добавьте в ALWAYS_ALIVE в scripts/find-dead-css.mjs.");
  process.exit(1);
}

main();
