// Генератор SEO-файлов: public/robots.txt + public/sitemap.xml.
// Публичных страниц у SPA всего три (лендинг, вход, политика) — приложение
// за авторизацией, индексировать его не нужно. Домен берётся из SITE_URL
// (та же переменная, что у canonical/og:url), иначе — дефолт.
//
// Запуск: node scripts/generate-seo.mjs   (npm-скрипт `seo:gen`)
// В CI вызывается перед `npm run build` — там SITE_URL уже задан.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public");

const SITE_URL = (
  process.env.SITE_URL ||
  process.env.VITE_SITE_URL ||
  "https://fitplan-hub.vercel.app"
).replace(/\/+$/, "");

// Только публичные маршруты (защищённые страницы за auth не индексируем).
const PUBLIC_PATHS = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/auth", changefreq: "monthly", priority: "0.5" },
  { path: "/privacy", changefreq: "yearly", priority: "0.2" },
];

mkdirSync(OUT, { recursive: true });

// ---------- robots.txt ----------
const robots = [
  "User-agent: *",
  "Allow: /",
  // Приложение за авторизацией — краулерам там делать нечего.
  "Disallow: /dashboard",
  "Disallow: /overview",
  "Disallow: /meals",
  "Disallow: /workouts",
  "Disallow: /progress",
  "Disallow: /profile",
  "",
  `Sitemap: ${SITE_URL}/sitemap.xml`,
  "",
].join("\n");
writeFileSync(join(OUT, "robots.txt"), robots, "utf8");
console.log(`✓ public/robots.txt (SITE_URL: ${SITE_URL})`);

// ---------- sitemap.xml ----------
const lastmod = new Date().toISOString().slice(0, 10);
const urls = PUBLIC_PATHS.map(
  (p) => `  <url>
    <loc>${SITE_URL}${p.path}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`,
).join("\n");
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
writeFileSync(join(OUT, "sitemap.xml"), sitemap, "utf8");
console.log("✓ public/sitemap.xml");
