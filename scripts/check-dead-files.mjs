// Проверка мёртвых файлов: каждый файл в src/components/ui/ (кроме *.test.*)
// должен импортироваться хотя бы раз где-то в src/ (кроме тестов). Иначе CI падает.
//
// Локально: npm run check:dead-files
// Работает без внешних зависимостей — рекурсивный обход + grep по импортам.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const UI_DIR = join("src", "components", "ui");
const SRC_DIR = "src";

// Все .ts/.tsx файлы в src/ (без тестов и служебных папок).
function collectFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (["node_modules", "dist", "coverage", ".git"].includes(entry)) continue;
    if (statSync(p).isDirectory()) collectFiles(p, out);
    else if (/\.(ts|tsx)$/.test(entry) && !entry.includes(".test.")) out.push(p);
  }
  return out;
}

const allFiles = collectFiles(SRC_DIR);
// Читаем каждый файл один раз — быстрее, чем перечитывать для каждого ui-файла.
const contents = new Map(allFiles.map((f) => [f, readFileSync(f, "utf8")]));

// Локальный ли это импорт: относительный путь (./ ../) или алиас @/.
function isLocalImport(spec) {
  return spec.startsWith("./") || spec.startsWith("../") || spec.startsWith("@/");
}

function isImported(baseName) {
  const alias = `@/components/ui/${baseName}`;
  for (const content of contents.values()) {
    for (const line of content.split("\n")) {
      const m = line.match(/from\s+["']([^"']*)["']/);
      if (!m) continue;
      const spec = m[1];
      if (spec === alias) return true;
      // Относительные локальные пути: ./button, ../ui/button и т.п.
      if (isLocalImport(spec) && (spec.endsWith(`/${baseName}`) || spec === baseName)) {
        return true;
      }
    }
  }
  return false;
}

const uiFiles = readdirSync(UI_DIR)
  .filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes(".test.") && f !== "index.ts" && f !== "index.tsx")
  .sort();

const dead = [];
for (const f of uiFiles) {
  const base = f.replace(/\.(ts|tsx)$/, "");
  if (!isImported(base)) dead.push(`src/components/ui/${f}`);
}

if (dead.length > 0) {
  console.error("❌ Мёртвые файлы в src/components/ui/ (нигде не импортируются):");
  for (const f of dead) console.error("   " + f);
  console.error(
    "Их можно удалить или — если это публичный компонент — импортировать. " +
      "Исключения: index.ts, *.test.* (они исключены из проверки).",
  );
  process.exit(1);
}

console.log(`✅ Все ${uiFiles.length} файлов в src/components/ui/ используются.`);
