import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier/flat";

export default tseslint.config(
  { ignores: ["dist", "src/convex/_generated"] },
  {
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      eslintConfigPrettier,
    ],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Ключевая защита от «Rendered more hooks than during the previous render»:
      // хуки должны вызываться в одном и том же порядке на каждом рендере
      // (никаких useMemo/useEffect после ранних return в компоненте).
      "react-hooks/rules-of-hooks": "error",
      // Пропущенные зависимости эффектов — ошибка, а не предупреждение:
      // «забытый» dep в массиве = потенциальный баг с устаревшими данными.
      "react-hooks/exhaustive-deps": "error",
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },
  // Сгенерированный shadcn/ui код и его хуки: новые экспериментальные правила
  // react-hooks v7 (set-state-in-effect, purity) флаг-ят их легальные паттерны
  // (setState в эффекте медиа-запроса, Math.random в sidebar), поэтому для
  // ui-каталога и кастомных хуков-обёрток они отключены.
  {
    files: ["src/components/ui/**", "src/hooks/use-mobile.ts"],
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
    },
  },
);
