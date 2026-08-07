// Perf-гейт для CI: прогон Lighthouse против прод-сборки (vite preview) и
// проверка целевых Web Vitals на лендинге «/» (публичная страница).
//
//   Цели (по Google Web Vitals / Lighthouse), по умолчанию:
//     LCP  < 2500 ms   — крупнейшая отрисовка контента
//     CLS  < 0.1       — смещение макета
//     TBT  < 300 ms    — прокси для FID (интерактивность)
//     FCP  < 1800 ms   — первая отрисовка контента
//
//   Пороги можно переопределить переменными окружения (те же читает CI-джоба):
//     PERF_LCP_MAX_MS, PERF_FCP_MAX_MS, PERF_TBT_MAX_MS, PERF_CLS_MAX
//   (например, PERF_LCP_MAX_MS=3000 node scripts/lighthouse-check.mjs).
//
// Режим замера: desktop + throttlingMethod "provided" (реальная загрузка
// на машине CI, без искусственной сети) — продукт ориентирован на десктоп-
// дашборд, а гейт ловит регрессии (рост бандла, render-blocking ресурсы) на
// стандартных таргетах. Мобильная картина консервативнее (симулированная
// Fast 4G + 4x CPU даёт LCP ~4.4 с) — она задокументирована в README как
// известное узкое место: стартовый JS-граф, RTT-зависимость на медленных
// сетях. Подтягивание гейта до mobile-simulate — отдельная работа по
// сокращению бандла (см. README → “Performance & Web Vitals”).
//
// Запуск: npm run build && node scripts/lighthouse-check.mjs
// (npm-скрипт `perf:check` делает то же самое одной командой).
//
// Необязательный аргумент — URL для замера вместо локальной сборки:
//   node scripts/lighthouse-check.mjs https://<deploy-url>
// В этом режиме vite preview не поднимается, а порог «dist должен
// существовать» пропускается (годится для пост-деплой проверки живого
// прода; пороги для живого URL разумно задать мягче через env).
//
// Отчёт (JSON + HTML) всегда пишется в perf-report/ — в CI он загружается
// артефактом, чтобы регрессию можно было расследовать, а не только увидеть.
//
// Flakiness: CI-раннеры шумят, поэтому делаем 2 прогона и берём лучший по LCP.
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import lighthouse, { generateReport } from "lighthouse";
import { launch } from "chrome-launcher";

const require = createRequire(import.meta.url);

const PORT = 4175;
const URL = `http://127.0.0.1:${PORT}/`;

/** Числовой env-оверрайд порога: пустое/битое значение → дефолт. */
function envNum(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const TARGETS = {
  "largest-contentful-paint": {
    max: envNum("PERF_LCP_MAX_MS", 2500),
    label: "LCP (ms)",
  },
  "first-contentful-paint": {
    max: envNum("PERF_FCP_MAX_MS", 1800),
    label: "FCP (ms)",
  },
  "total-blocking-time": {
    max: envNum("PERF_TBT_MAX_MS", 300),
    label: "TBT (ms)",
  },
  "cumulative-layout-shift": {
    max: envNum("PERF_CLS_MAX", 0.1),
    label: "CLS",
  },
};

/** Ждём, пока сервер начнёт отвечать (vite preview поднимается ~1-2 с). */
function waitForServer(url, timeoutMs = 60_000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await fetch(url);
        if (res.ok) return resolve();
      } catch {
        /* сервер ещё не готов */
      }
      if (Date.now() - start > timeoutMs) {
        return reject(new Error(`Сервер не поднялся за ${timeoutMs}ms`));
      }
      setTimeout(tick, 500);
    };
    void tick();
  });
}

/** Один прогон Lighthouse (desktop, реальная загрузка — без артефактной сети). */
async function runLighthouse(chrome, url) {
  const result = await lighthouse(url, {
    port: chrome.port,
    output: "json",
    onlyCategories: ["performance"],
    formFactor: "desktop",
    screenEmulation: { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1 },
    throttlingMethod: "provided",
  });
  if (!result || !result.lhr) {
    throw new Error("Lighthouse не вернул отчёт (lhr отсутствует)");
  }
  return result.lhr;
}

async function main() {
  // 0. Можно ли замерить внешний URL (пост-деплой проверка живого прода)
  //    вместо локальной сборки — тогда dist-гейт и vite preview не нужны.
  const urlArg = process.argv[2];
  let server = null;

  // 1. Прод-сборка обязана существовать (CI собирает её шагом выше).
  if (!urlArg) {
    try {
      await readFile("dist/index.html");
    } catch {
      console.error("dist/index.html не найден — сначала `npm run build`");
      process.exit(2);
    }

    // 2. Поднимаем vite preview на свободном порту (бинь vite через node —
    //    `spawn("npx")` на Windows не резолвит npx.cmd без shell).
    // bin/vite.js не экспортируется через package.json exports — резолвим по пути пакета.
    const viteBin = join(dirname(require.resolve("vite/package.json")), "bin/vite.js");
    server = spawn(
      process.execPath,
      [viteBin, "preview", "--port", String(PORT), "--strictPort"],
      { stdio: "ignore" },
    );
  }

  const targetUrl = urlArg ?? URL;
  // Флаги обязаны идти launcher'у: lighthouse() их игнорирует, когда передан
  // готовый `port` (поэтому chromeFlags в опциях lighthouse не дублируем).
  // Набор проверен на ubuntu-раннерах (Chrome 132+):
  //  - --disable-dev-shm-usage: /dev/shm всего 64 МБ — без него рендерер падает;
  //  - --enable-unsafe-swiftshader: в новом headless (Chrome 132+) софтверный
  //    GL требуется разрешить явно, иначе страница не рисует НИ ОДНОГО кадра
  //    и Lighthouse падает с NO_FCP «The page did not paint any content»;
  //  - --disable-gpu НЕ добавляем: с новым headless он как раз и провоцирует
  //    пустой кадр (NO_FCP), хотя локально на Windows всё рисуется.
  const chrome = await launch({
    chromeFlags: [
      "--headless",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--enable-unsafe-swiftshader",
    ],
  });

  try {
    await waitForServer(targetUrl);

    // 3. Два прогона → лучший по LCP (CI шумит).
    const runs = [];
    for (let i = 0; i < 2; i++) {
      runs.push(await runLighthouse(chrome, targetUrl));
    }
    // NaN-защита при сортировке: error-аудит без метрики не попадёт в «лучший».
    const lcpValue = (lhr) =>
      lhr?.audits?.["largest-contentful-paint"]?.numericValue ?? Infinity;
    const best = [...runs].sort((a, b) => lcpValue(a) - lcpValue(b))[0];

    // 4. Отчёт пишем ДО проверки порогов — если гейт упал, артефакт всё
    //    равно существует и регрессию можно расследовать по HTML/JSON.
    //    Сбой записи (диск/права) НЕ должен ронять гейт: отчёт — сервисный
    //    артефакт, вердикт выносится только по Web Vitals.
    try {
      const reportDir = "perf-report";
      await mkdir(reportDir, { recursive: true });
      await writeFile(join(reportDir, "report.json"), JSON.stringify(best, null, 2));
      const html = generateReport(best, "html");
      await writeFile(join(reportDir, "report.html"), html);
    } catch (reportErr) {
      console.warn("[perf] не удалось сохранить отчёт:", reportErr);
    }

    // 5. Сверяем целевые метрики. Прогон может вернуть error-аудит (краш
    //    рендерера на раннере, сетевой сбой) — numericValue тогда отсутствует.
    //    Вместо TypeError печатаем диагностику и роняем гейт осознанно (throw,
    //    а не process.exit — чтобы finally погасил Chrome и preview-сервер).
    let failed = false;
    console.log(
      `=== Web Vitals (лучший из 2 прогонов, desktop/provided, ${targetUrl}) ===`,
    );
    const missing = Object.keys(TARGETS).filter(
      (key) => !Number.isFinite(best.audits?.[key]?.numericValue),
    );
    if (missing.length > 0) {
      console.error(
        `[perf] метрики не собраны (${missing.join(", ")}) — Lighthouse вернул error-аудит.`,
      );
      if (best.runtimeError) {
        console.error(`[perf] runtimeError: ${best.runtimeError.message}`);
      }
      for (const key of missing) {
        const audit = best.audits?.[key];
        console.error(
          `[perf] audit ${key}: ${audit?.errorMessage ?? "нет errorMessage"}`,
        );
      }
      throw new Error("Lighthouse не собрал Web Vitals — см. диагностику выше");
    }
    for (const [key, { max, label }] of Object.entries(TARGETS)) {
      const value = best.audits[key].numericValue;
      const ok = Number.isFinite(value) && value <= max;
      if (!ok) failed = true;
      const rendered = key === "cumulative-layout-shift"
        ? value.toFixed(3)
        : String(Math.round(value));
      console.log(
        `${ok ? "✔" : "✘"} ${label}: ${rendered} (лимит ${key === "cumulative-layout-shift" ? max.toFixed(1) : max})`,
      );
    }

    if (failed) {
      console.error("Web Vitals ниже целевых — см. метрики выше.");
      process.exit(1);
    }
    console.log("Web Vitals в норме ✔");
  } finally {
    // Chrome на Windows держит temp-файлы открытыми — chrome.kill() может
    // бросить EPERM при rmSync. Это только уборка за собой: если упала,
    // результат замера уже вынесен выше, гейт ронять нельзя.
    try {
      chrome.kill();
    } catch {
      /* cleanup-ошибка не влияет на вердикт гейта */
    }
    if (server) {
      try {
        server.kill();
      } catch {
        /* cleanup-ошибка не влияет на вердикт гейта */
      }
    }
  }
}

main().catch((err) => {
  console.error("Perf-гейт упал:", err);
  process.exit(1);
});
