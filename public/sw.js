/* КИЛО — сервис-воркер «app shell» (без внешних зависимостей, без Workbox).
 *
 * Стратегия кэширования:
 *  - install:   прекэш оболочки (index.html, манифест, иконки, логотип).
 *  - /assets/   — cache-first: файлы сборки хешированы и иммутабельны.
 *  - Google Fonts — stale-while-revalidate: отвечаем кэшем мгновенно,
 *                свежая версия догружается в фоне.
 *  - навигация  — network-first с фолбэком на кэшированный /index.html:
 *                онлайн отдаёт свежий shell и обновляет кэш, офлайн —
 *                последнюю сохранённую оболочку.
 *  - всё остальное (включая API Convex) — только сеть: данные не кэшируем.
 *
 * Честное ограничение: данные живут в Convex и требуют сети. Офлайн даёт
 * мгновенную загрузку оболочки, шрифтов и иконок (быстрый повторный вход),
 * а не полный офлайн-доступ к записям.
 */
const CACHE_NAME = "kilo-shell-v2";
const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/logo.svg",
  "/favicon.png",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Google Fonts: cache-first, фоновая дозагрузка свежей версии.
  if (
    url.origin === "https://fonts.googleapis.com" ||
    url.origin === "https://fonts.gstatic.com"
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        // fetch стартует сразу (пока выбираем между кэшем и сетью):
        // если есть кэш — отвечаем мгновенно, сеть дозаписывает свежую
        // версию в фоне; если кэша нет — ждём сеть.
        const network = fetch(request)
          .then((res) => {
            if (res && res.ok) {
              const copy = res.clone();
              caches
                .open(CACHE_NAME)
                .then((cache) => cache.put(request, copy));
            }
            return res;
          })
          .catch(() => undefined);
        return cached || network;
      }),
    );
    return;
  }

  // Хешированные ассеты сборки (иммутабельны между деплоями): cache-first.
  if (
    url.origin === self.location.origin &&
    url.pathname.startsWith("/assets/")
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          // Кэшируем только успешные ответы: ошибка/404 не должна
          // «протухать» в кэше как валидный ассет.
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return res;
        });
      }),
    );
    return;
  }

  // Навигация: network-first, фолбэк на кэшированный shell.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          // Кэшируем под /index.html только успешные ответы: офлайн-шелл
          // никогда не должен быть страницей ошибки/404.
          if (res.ok) {
            const copy = res.clone();
            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put("/index.html", copy));
          }
          return res;
        })
        .catch(() => caches.match("/index.html")),
    );
  }
});
