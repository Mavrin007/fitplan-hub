# Архитектура «Кило»

Краткое описание слоёв и конвенций проекта. Подробные фичи — в README;
этот файл фиксирует структурные решения, чтобы их не приходилось
переоткрывать при росте.

## Слои

```
src/
  convex/      — бэкенд-слой (Convex): схемы, мутации/запросы, auth
  features/    — фичи-модули: всё, что относится к одной фиче, в одной папке
                 (компонент + логика + данные + тесты рядом)
  lib/         — доменные библиотеки без UI (nutrition, mealData, workoutData,
                 projection, charts, export, errors, i18n)
  pages/       — страницы-маршруты (тонкие: собирают данные + раскладывают UI)
  components/  — переиспользуемые UI-компоненты (общие, не фиче-специфичные)
  components/ui/ — базовые примитивы (кнопки, инпуты, диалоги) на Radix
  test/        — тестовая инфраструктура: fixtures, convex-моки, renderWithRouter
```

## Feature folders (`src/features/`)

**Конвенция:** новая фича, у которой есть и UI, и логика, и данные, кладётся
в `src/features/<name>/`, а не размазывается по `components/` + `lib/`.

**Эталонный пример — `src/features/onboarding/`:**
- `OnboardingWizard.tsx` — компонент-визард;
- `onboarding.ts` — чистая логика (ключ localStorage, `shouldShowOnboarding`);
- `OnboardingWizard.test.tsx` — тесты рядом.

Страницы (`pages/`) импортируют фичу как модуль:
`import { OnboardingWizard } from "@/features/onboarding/OnboardingWizard"`.

**Что остаётся вне features:** по-настоящему общий код — доменные библиотеки
в `lib/` (их используют несколько фич сразу) и переиспользуемые UI-примитивы
в `components/`.

**Правило роста:** как только у новой фичи появляется 2+ файла, заводите
`src/features/<name>/`.

**Уже мигрировали:**
- `src/features/meals/` — `MealsPage.tsx` + `lib/` (mealUtils, photo-review);
  страница `pages/Meals.tsx` — тонкая обёртка;
- `src/features/workouts/` — `WorkoutsPage.tsx` + `lib/workoutUtils.ts`;
- `src/features/assistant/` (бэкенд-модули, живут в `src/convex/assistant/`,
  см. ниже).

Бизнес-логика живёт в `lib/` фичи (чистые функции, покрытые тестами),
страница остаётся тонкой.

## Ролевая модель (SaaS-ready)

`src/convex/roles.ts` — рабочий слой поверх `ROLES` из `schema.ts`:

- `myRole` — запрос роли текущего пользователя (`null` — аноним);
- `getUserRole(ctx, userId)` — помощник для хендлеров, дефолт `USER`
  (мягкая миграция: старые аккаунты без поля `role` считаются `USER`);
- `assertRole(role, allowed)` — гард «кинь ConvexError, если роли нет»;
- `setUserRole` — мутация смены роли: только `admin`, плюс защита от
  снятия роли с последнего админа.

Роль хранится в поле `users.role` (уже есть в схеме). Расширение для SaaS:
в нужных хендлерах вызывать `assertRole(await getUserRole(ctx, me), [ROLES.ADMIN])`
или добавлять `requireRole`-обёртки.

## i18n

**Текущее решение — осознанный RU-first, без фреймворка:**

- `src/lib/i18n.ts` — единый словарь повторяющихся строк: метки приёмов пищи,
  дни недели, инвентарь, юниты (`UNITS`) + реэкспорт label-карт из `nutrition`.
- Страницы импортируют метки из словаря, а не хардкодят по месту:
  `import { GOAL_LABELS, UNITS } from "@/lib/i18n"`.

**Когда вводить полноценный i18n:** при первом запросе второго языка (или
заказчике, которому нужен en) — тогда:
1. `i18n.ts` превращается в `t(key)`-обёртку над locale-файлами
   (`src/i18n/ru.ts`, `src/i18n/en.ts`);
2. label-карты (GOAL_LABELS и т.д.) становятся функциями `t("goals.lose_weight")`;
3. переиспользуемые в словаре строки переносятся первыми — они уже собраны
   в одном месте, миграция не требует поиска по всему коду.

Для RU-рынка фреймворк добавлять сейчас не стали: это вес без пользы.

## Тестирование

- Юнит-тесты бэкенда гоняются через `@/test/convex-db-mock` (фейковый ctx.db)
  + мокнутый `getAuthUserId` — без Convex-рантайма.
- Компонентные тесты страниц — через `@/test/convex-react-mock`.
- Пороги покрытия: строки ≥ 80 %, ветви ≥ 75 % (`npm run test:coverage`).

## AI-ассистент: команды, а не запись из «сырого» ответа

`src/convex/assistant/` — модули без UI, тестируются без Convex-рантайма:

- `commands.ts` — typed command model (`logMeal`/`logWorkout`/`logWeight`/
  `logWater`) + строгая runtime-валидация: типы, диапазоны, длины, enums,
  границы массивов, неизвестные поля. Поля КБЖУ в команде ЗАПРЕЩЕНЫ
  (`forbidden_field`) — модель не может сделать макросы authoritative.
- `nutrition.ts` — серверное разрешение продуктов (кураторская библиотека →
  свои продукты → детерминированная оценка) и расчёт КБЖУ: `verified` /
  `open_food_facts` / `internal` / `ai_estimate` + `isEstimate` для UI.
- `prompt.ts` — сборка системного промпта: SYSTEM INSTRUCTIONS и USER_DATA
  разделены; пользовательский текст всегда внутри `USER_DATA` с пометкой
  «недоверенные данные» (защита от prompt injection). Модель получает
  компактную сводку, а не всю БД.
- `types.ts` — структурные типы документов (совместимы с `Doc<...>`).

Путь записи: `USER → LLM → INTENT/COMMAND → STRICT VALIDATION → DOMAIN
SERVICE → BUSINESS RULES → DATABASE MUTATION`. Невалидный ответ модели не
изменяет БД и возвращает пользователю понятную ошибку.

## Идемпотентность и ошибки

- `src/convex/idempotency.ts` — `idempotencyKey` (userId+key, TTL 7 дней) для
  критических мутаций записи (еда/вода/вес/тренировки, фото, Telegram):
  повтор запроса не создаёт дубликат; при сбое тела ключ откатывается, чтобы
  честный ретрай прошёл. Таблица `idempotencyKeys` в схеме.
- `src/convex/errors.ts` — единая таксономия ошибок (`AUTH_REQUIRED`,
  `RATE_LIMITED`, `VALIDATION_FAILED`, `FOOD_NOT_FOUND`, `AI_INVALID_OUTPUT`,
  `DUPLICATE_REQUEST`, …) — ConvexError с кодом вместо произвольных строк.

## Безопасность

- **CSRF**: cookie-аутентификации нет — Convex-токены в заголовках, поэтому
  классический CSRF неприменим. JWT федеративных провайдеров валидируются
  по JWKS (см. `auth.config.ts`).
- **Глобальный rate-limit записей**: `src/convex/rateLimit.ts` — скользящее
  окно на ключ (`<userId>:<операция>`) в таблице `rateLimitEvents`; все
  мутации записи (вода, дневник, продукты, вес, тренировки, план) проходят
  через `consumeRateLimit`. Ассистент лимитируется отдельно
  (`assistantLimits.ts`). Ошибка — ConvexError с `retryAfterSec`.
- **GDPR**: `account.exportMyData` (переносимость, один JSON со всеми
  таблицами) и `account.deleteMyAccount` (забвение — данные, сессии,
  провайдеры, документ users). Страница `/privacy` — статичная политика.
- **Линковка аккаунтов**: `createOrUpdateUser` в `auth.ts` связывает
  подтверждённую почту (Google OAuth / email-OTP) с существующим
  пользователем; гостевой session-linking имеет приоритет, чтобы данные
  гостя не осиротевали.
