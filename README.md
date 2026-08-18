[![CI](https://github.com/Mavrin007/fitplan-hub/actions/workflows/ci.yml/badge.svg)](https://github.com/Mavrin007/fitplan-hub/actions/workflows/ci.yml)

## Overview

This project uses the following tech stack:
- Vite
- Typescript
- React Router v7 (all imports from `react-router` instead of `react-router-dom`)
- React 19 (for frontend components)
- Tailwind v4 (for styling)
- Shadcn UI (for UI components library)
- Lucide Icons (for icons)
- Convex (for backend & database)
- Convex Auth (for authentication)
- Auth.js Core (`@auth/core`, direct dependency for OAuth providers like Google)
- Framer Motion (for animations)

All relevant files live in the 'src' directory.

## Features

- **Personalized workout plans** (`src/lib/workoutLibrary.ts`) — weekly split adapted
to goal, gender, age, height/weight/BMI, experience, equipment, injuries and training
frequency, with 4-week progression, RPE-based load adjustment (`src/lib/effort.ts`)
and realistic substitutions (no jumping for high BMI, joint-safe alternatives).
- **Realistic meal plans** (`src/lib/mealLibrary.ts`) — curated dishes with human
portions (no "0.75 bars" or odd combos): 7-day weekly menus for weight loss and
muscle gain (second snack on a bulk), goal-aware portion scaling, dishes don't
repeat within a week, day total converges to the calorie target.
- Guest-first flow with email attach, nutrition diary, water tracking, weight/
progress charts and CSV export.
- **Food catalog search** (`src/lib/productSearch.ts`) — curated in-app library
  (~70 products with per-serving macros and prices) plus **Open Food Facts**
  fallback: type a query in the add-to-diary dialog and pull real per-100 g
  macros from the open barcode database (no API key; 8 s timeout, offline-safe
  — the dialog keeps working with the local library).
- **Photo meal tracking** (`src/convex/photo.ts`) — snap a plate, Gemini Vision
  recognizes the dish and returns per-item KBJU which lands straight in the
  diary (5 analyses/hour rate limit; JPEG/PNG/WebP ≤ 2.5 MB; requires
  `GEMINI_API_KEY`, model tunable via `GEMINI_PHOTO_MODEL`).
- **Explained goal projection** (`src/lib/projection.ts`) — linear regression on
  weight entries projects the target date and explains it in plain words:
  «Если продолжишь в текущем темпе (0,5 кг в неделю), снизишь до 82,0 кг за
  ~3 месяца — к 28 октября 2026 г. Осталось 5,5 кг», with an honest
  «предварительный» caveat when there are too few measurements.
- **Weekly email digest** (`src/convex/digest.ts` + `src/convex/crons.ts`) —
  every Monday 08:00 UTC the backend aggregates the past week (weight delta,
  average calories/protein, workouts + tonnage, water, active days) and emails a
  plain-language summary through the same `vly.email.send` gateway as OTP. Users
  without an email, guests, and weeks with no data are skipped; a failed
  recipient never breaks the run (`getMyWeeklyDigest` returns the same summary
  for the in-app view). Disable with `DIGEST_DISABLED=1`.

### Product catalog & Open Food Facts

`searchOpenFoodFacts` calls `world.openfoodfacts.org` (search API, `json=1`,
`fields=product_name,brands,code,nutriments`, page size 8). Products are
normalized to per-100 g macros (kcal preferred, kJ ÷ 4.184 fallback), junk
entries and duplicates are filtered. Network/HTTP failures surface as
«каталог недоступен» in the dialog instead of breaking it. Attribution:
Open Food Facts is a free, open database under the ODbL license; a link to
<https://world.openfoodfacts.org> on the marketing page is recommended when
shipping the feature.

Respect the API's fair-use limits: search is user-triggered (explicit button,
not per-keystroke), so the app stays well within the free quota.

Use **npm** as the package manager (Node 22+):

```bash
npm install
npm run dev   # frontend only (needs the backend, see .freebuff/run.md)
npm test      # vitest
npm run lint
npm run build # tsc -b && vite build
```

For local development with the Convex backend, see `.freebuff/run.md` — the
preview needs two processes: `CONVEX_DEV_DEPLOYMENT=local npx convex dev` and
`npx vite`.

## Setup

This project is set up already and running on a cloud environment, as well as a convex development in the sandbox.

## Tests

- **Unit / component tests (vitest):** `npm test` — business logic, Convex
  handlers (fake ctx.db, no runtime), React components (convex-react-mock).
  Coverage gate with thresholds: `npm run test:coverage`.
- **E2E (Playwright):** `npm run test:e2e` — runs the full local stack
  (convex dev :3210 + vite :5173, auto-started by `playwright.config.ts`)
  across four specs: the critical path (guest → onboarding profile →
  generate workout plan → attach email via dev-OTP → sign out → sign in by
  email → data persisted), a **scoped axe accessibility audit** (0
  critical/serious violations on /auth and all five dashboard pages), a
  **mobile spec** (375px viewport: no horizontal scroll on any dashboard
  page) and a **reduced-motion spec** (headless Chromium forced into
  `prefers-reduced-motion`, see “Accessibility” below). See
  `.freebuff/run.md` → “E2E (Playwright)” for details.

## Accessibility

- **Reduced motion** — with the system setting “reduce motion” ON, all
  decorative animation is disabled on two layers:
  - **CSS** (`src/index.css`, `@media (prefers-reduced-motion: reduce)`):
    infinite decorative animations (`animate-aurora`, `animate-float`,
    `animate-shine`, `animate-pulse`) are killed, hover lift (`.card-lift`)
    snaps, all `transition-*` utilities get `transition-duration: 0.01ms`,
    and `html` scrolls instantly (`scroll-behavior: auto` instead of
    `smooth`).
  - **Framer Motion** (`src/main.tsx` → `MotionConfig reducedMotion="user"`):
    transform/layout animations (card entrances, ring draw) jump straight to
    their final state; opacity-only fades still run.
  - **Unit tests** (`*.reduced-motion.test.tsx` — Landing, Dashboard,
    Overview, Meals, Workouts, Profile, ProgressRing, RingProgress):
    isolated jsdom files stub `matchMedia(matches=true)` and assert the first
    rendered frame has no transform/layout animation; paired control tests in
    the normal `*.test.tsx` files prove the animation *does* run when the
    setting is off.
  - **E2E** (`e2e/reduced-motion.spec.ts`): headless Chromium launched with
    `--force-prefers-reduced-motion`, then asserts computed
    `animation-name: none` for the decorative classes, `scroll-behavior: auto`,
    zero running `document.getAnimations()` on the dashboard after onboarding
    (motion cards landed at their final state), and no console errors.
- **Contrast & semantics:** `e2e/a11y.spec.ts` runs an axe audit (via
  `@axe-core/playwright`) on `/auth` and all five dashboard pages in **both**
  light and dark themes, failing on any critical/serious WCAG A/AA
  violations (color contrast, ARIA, heading structure).
- **Keyboard:** custom interactive controls (Select, OTP input, dialogs) are
  built on Radix UI primitives, which ship full keyboard navigation and
  focus trapping; progress rings expose `role="progressbar"` with
  `aria-valuenow/min/max`.

## Performance & Web Vitals

- **Lighthouse gate in CI** (`perf` job): `scripts/lighthouse-check.mjs` serves
  the production build (`vite preview` from `dist`) and asserts Web Vitals on
  the public landing page (mobile, simulated throttling; best of 2 runs — CI
  runners are noisy). Local check: `npm run build && npm run perf:check`.
- **Targets (Google Web Vitals / Lighthouse):**
  - `LCP < 2500 ms` — largest contentful paint;
  - `CLS < 0.1` — layout shift;
  - `TBT < 300 ms` — blocking time (proxy for FID);
  - `FCP < 1800 ms` — first contentful paint.
  Current baseline and regressions are visible in the CI run log (each run
  prints the best numbers). Raising the font load / trimming the initial JS
  bundle directly moves LCP — see “known bottlenecks” below.
- **Fonts:** 3 families (Roboto body, Onest display, IBM Plex Mono for
  numbers). The critical display font (Onest, variable — covers 600/700) is
  `preload`ed for Cyrillic + Latin in `index.html`; all loads use
  `font-display: swap`. Inter was dropped earlier as a fallback-only family.
- **Images:** there are no raster images in the app — illustrations are inline
  SVG (theme-aware), icons are lucide, so webp/avif/srcset don't apply; the
  only PNGs are PWA icons/favicon. If photos are added later, ship webp/avif
  with `srcset` + `loading="lazy"`.
- **Code splitting:** all 10 pages are `React.lazy` + `Suspense` with manual
  vendor chunks (react-vendor, radix-ui, framer-motion). `AssistantChat` and
  the Vly toolbar are lazy too — they're not on the first screen (the main
  bundle dropped from ~530 kB to ~324 kB / gzip ~99 kB). lucide icons are
  merged into one chunk to cut RTT on slow networks.

## SEO

The app lives behind auth — only the landing page, `/auth` and `/privacy` are
public, so SEO effort is concentrated there (it's also what social shares
render).

- **Meta:** `title`, `description`, `lang="ru"`, `theme-color`, `robots
  meta`, canonical.
- **Open Graph + Twitter Card:** `og:type/site_name/locale/title/
  description/url/image` (1200×630 `public/og-image.png`, generated from the
  same brand geometry as the logo/icons) and `twitter:card`
  (`summary_large_image`).
- **Schema.org:** `WebApplication` + `Organization` JSON-LD in `index.html`
  (no fake ratings/reviews).
- **`robots.txt` + `sitemap.xml`:** generated by `scripts/generate-seo.mjs`
  (npm `seo:gen`), listing only the public paths; dashboard routes are
  `Disallow`ed. The domain is `SITE_URL` (env, set in CI/Vercel), falling
  back to `https://fitplan-hub.vercel.app`.
- **Canonical/OG URLs** are absolute — `%SITE_URL%` is substituted by a
  tiny Vite plugin (`siteUrl` in `vite.config.ts`) so the same `index.html`
  works for dev and prod builds.
- Known limitation (honest): it's a client-rendered SPA — Google renders JS
  fine, but non-JS crawlers only see the app shell. SSR/prerender is the
  natural next step if organic traffic to the landing becomes a priority.

## Environment Variables

The project is set up with project specific CONVEX_DEPLOYMENT and VITE_CONVEX_URL environment variables on the client side.

The convex server has a separate set of environment variables that are accessible by the convex backend.

Currently, these variables include auth-specific keys: JWKS, JWT_PRIVATE_KEY, and SITE_URL.

The AI assistant (`src/convex/assistant.ts`) reads two backend keys — at least one
is required for it to answer:

- `GEMINI_API_KEY` — primary provider (Google Gemini, no extra gateway needed)
- `VLY_INTEGRATION_KEY` — fallback: routes through the VLY gateway (`gpt-4o-mini`)

The **same `VLY_INTEGRATION_KEY` also powers production email OTP delivery**: the
auth provider (`src/convex/auth/emailOtp.ts`) sends the verification code through
`vly.email.send` (no API keys in the source). `VLY_APP_NAME` (optional) is used as
the sender name in the letter. A verified sender domain is required in the VLY
dashboard (`vly.email.verifyDomain` / `listDomains`) for letters to be delivered.

The weekly digest cron reuses the same gateway: it runs only when
`VLY_INTEGRATION_KEY` is set and can be switched off with `DIGEST_DISABLED=1`
(dev/staging usually disable it).

### AI-assistant per-user limits (`src/convex/assistantLimits.ts`)

The chat action enforces a **server-side quota per user per day** before any AI
provider call (an exhausted quota costs the provider nothing):

- **Message quota** — `ASSISTANT_DAILY_MESSAGE_LIMIT` (default 30/day).
- **Token quota** — `ASSISTANT_DAILY_TOKEN_LIMIT` (default 150 000/day,
  ≈30 messages × ~5k tokens each). A long, expensive conversation burns the
  budget faster than 30 short ones; the client pre-checks `getMyLimit` and shows
  the remaining messages and tokens in the chat footer.
- **Anti-spam interval** — `ASSISTANT_MIN_INTERVAL_MS` (default 2000 ms).

Set these in the Convex Dashboard (Project → Settings → Environment Variables)
to tune them per deployment without touching code. The chat action also has a
**60-second timeout** per AI request (`AI_REQUEST_TIMEOUT_MS` in
`src/convex/assistant.ts`) — a hung provider never hangs the user's chat.

Frontend error tracking (Sentry) is enabled only when `VITE_SENTRY_DSN` is set;
`beforeSend` strips emails, JWTs and API keys before events leave the browser.
Read-only helper values (`GEMINI_MODEL`, optional) tune the model used.

### Schema migrations

`schemaValidation: false` (template default) is a deliberate choice at this
project size: old documents are not re-validated on read, and new *optional*
fields are added as **soft migrations** — the code reads them via `?? 0` and
patches rows lazily on the next write (see `totalTokens` on `assistantLimits`:
pre-existing rows simply lack the field until the next `checkAndConsume`).
Backfill jobs become worthwhile only when a field starts driving queries or
aggregations; until then soft migration keeps the DB stable without a migration
framework.

Heavy calculations are cached: workout plans are generated once and stored in
`workoutPlans` (regenerated when the profile changes), and progress charts
derive from the user's own logs with client-side memoization — no per-render
recomputation, and no denormalized weekly summary is needed at this scale.

## Production: Convex cloud + Vercel

### 1. Deploy the backend to Convex cloud

Log in once (opens a browser):

```bash
npx convex login
```

Then push functions, schema and http routes to the cloud project:

```bash
npx convex deploy
```

The CLI prints the cloud deployment URL (e.g. `https://<project>.convex.cloud`) and
writes `VITE_CONVEX_URL` to `.env.local` — keep it for local builds, and copy the
**cloud** URL (not `http://127.0.0.1:3210`) into Vercel.

### 2. Set backend env vars (Convex Dashboard)

Project → Settings → Environment Variables. Values are the same ones used
locally (see `.freebuff/run.md`):

- `VLY_CONVEX_AUTH_ISSUER` → `https://freebuff.com`
- `SITE_URL` → the **production** URL (e.g. `https://fitplan-hub.vercel.app`)
- `JWT_PRIVATE_KEY` → PKCS8 RSA key, **single line** (newlines → spaces)
- `JWT_STORAGE_KEY` → base64 session-storage key
- `JWKS` → public-key JSON
- `GEMINI_API_KEY` → Google AI Studio key for the assistant (or `VLY_INTEGRATION_KEY` as fallback)
- `VLY_INTEGRATION_KEY` → VLY gateway key: assistant fallback **and** production email OTP delivery (`vly.email.send`)
- `VLY_APP_NAME` → optional sender name in OTP letters (defaults to «КИЛО»)
- `GEMINI_MODEL` → optional model override (defaults to `gemini-flash-latest`)

**Google OAuth** (optional second sign-in, `src/convex/auth.ts`):

- `AUTH_GOOGLE_ID` → OAuth Client ID (Google Cloud Console)
- `AUTH_GOOGLE_SECRET` → OAuth Client Secret

These are read automatically by `@auth/core/providers/google` (Auth.js
convention: `AUTH_<PROVIDER_ID>_ID` / `AUTH_<PROVIDER_ID>_SECRET`;
`@auth/core` is a **direct** dependency — `src/convex/auth.ts` imports
`Google` from `@auth/core/providers/google`).

Register the OAuth client in Google Cloud Console (full step-by-step in
«Enabling Google OAuth» below, including the consent screen and test users)
with these redirect URIs — the callback route is served by Convex Auth at
`CONVEX_SITE_URL`:

- Local dev: `http://127.0.0.1:3211/api/auth/callback/google` (port 3211 is
  the local `CONVEX_SITE_URL`)
- Production: `https://<project>.convex.cloud/api/auth/callback/google` (the
  Convex cloud URL from step 1 — **not** the Vercel domain: Vercel's SPA
  rewrites would intercept the callback)

Do **NOT** set `VLY_EMAIL_DEV_CAPTURE` in production — the dev OTP capture is
for local work only. Guest sign-in works immediately; email OTP sends the code
through the VLY gateway (`vly.email.send`) using `VLY_INTEGRATION_KEY`. For
letters to be delivered, verify the sender domain in the VLY dashboard — until
then the send call returns an error and the code is not delivered.

### OTP security model (`src/convex/auth/emailOtp.ts` + `src/convex/otpRateLimit.ts`)

- **15-minute expiry** — `Email({ maxAge: 60 * 15 })`: the code dies after 15
  minutes. The client mirrors this (`src/pages/Auth.tsx`): the dev capture
  block counts down («Код истекает через N мин»), and submitting an expired
  code shows the distinct «Код истёк. Нажмите “Отправить ещё раз”.» message
  instead of the generic wrong-code error — without spending a request on the
  backend (server remains the source of truth for verification).
- **60-second resend rate-limit** — `OTP_RESEND_INTERVAL_MS` enforced in
  `sendVerificationRequest` *before* the VLY gateway (or the dev capture) is
  hit, so re-sending within the window costs nothing. The client pre-checks
  `canSend` so a blocked resend never reaches `signIn` and the current code
  stays valid; after the window, re-sending issues a **new** code.
- **Single-use, email-bound code** — 6 digits from `crypto.getRandomValues`;
  `@convex-dev/auth` stores the code bound to the requesting email and deletes
  it on successful verification, so the same code cannot be reused. Guest→
  email linking keeps the same `userId` (`createOrUpdateUser` in
  `src/convex/auth.ts`), so attaching an email never orphans the guest's data.
- **5 failed attempts/hour** — `signIn.maxFailedAttempsPerHour: 5` (built into
  `@convex-dev/auth`); the client pre-checks `canAttempt` and shows
  «Слишком много попыток. Подождите N мин» without burning an attempt.

### 3. Frontend env + deploy to Vercel

In Vercel project → Settings → Environment Variables, add:

- `VITE_CONVEX_URL` → the cloud Convex URL (from step 1)
- `VITE_SENTRY_DSN` → optional; enables error tracking (PII-free by `beforeSend`)

The repo ships `vercel.json` (Vite + SPA rewrites for react-router). CI deploys
from GitHub Actions: the `deploy` job (branch `main`) runs once these repo
secrets exist — Vercel → Account Settings → Tokens:

- `VERCEL_TOKEN` (token), `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` (from `npx vercel link`)
- `CONVEX_DEPLOY_TOKEN` (Convex Dashboard → Settings → Deploy Keys) — deploys
  backend functions before the frontend build

Without these secrets the CI `deploy` job is skipped and only the `check` job runs.


# Using Authentication (Important!)

You must follow these conventions when using authentication.

## DevOps & CI

### Pipelines

- **`.github/workflows/ci.yml`** — on push to `main` and on PRs: lint,
  typecheck, unit tests, coverage gate (see “Tests”), build, dead-file and
  CSS audits; then, depending on the event:
  - **`perf`** — Lighthouse Web Vitals gate against the built landing page
    (see “Performance & Web Vitals”);
  - **`e2e`** — Playwright critical path + axe + mobile (push to `main` only);
  - **`deploy`** — production deploy to Convex cloud (`CONVEX_DEPLOY_TOKEN`)
    and Vercel (`VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID`),
    with the `VITE_CONVEX_URL` guard and smoke test of the deployed URL.
    No GitHub Environment is used (a previously set `environment: production`
    made the job hang in the queue waiting for manual approval) — secrets are
    read from the repository directly, and `cancel-in-progress: false` lets a
    running deploy finish instead of being interrupted by the next push.
  - **`deploy-preview`** — Vercel **preview (staging) deploy on every PR**
    (only for PRs from this repo, since forks don't get secrets): unique
    staging URL is smoke-tested and commented on the PR. Preview env vars
    must be set in the Vercel panel the same way as production; if they are
    missing, the guard fails honestly instead of deploying an empty build.
- **`.github/workflows/nightly.yml`** — full run against `main` every day at
  03:00 UTC (lint, audit, typecheck, tests + coverage, build). Catches flaky
  tests and dependency rot that PRs hide behind stable green runs. On failure
  it posts to `DEPLOY_ALERT_WEBHOOK` if that secret is set.
- **`.github/dependabot.yml`** — weekly npm updates (minor/patch grouped,
  major bumps and Convex packages come as separate manual PRs) and monthly
  GitHub Actions updates.

### Alerting

Set the optional secret **`DEPLOY_ALERT_WEBHOOK`** (Telegram bot API URL, Slack
Incoming Webhook, …) to get notified when a deploy or the nightly run fails.
Without the secret the steps are skipped and CI stays green in local
repositories without monitoring.

### Monitoring

- **Frontend:** Sentry (browser) via `VITE_SENTRY_DSN` — error tracking with
  a `beforeSend` that strips emails, JWTs and API keys. Client-side only.
- **Backend:** Convex ships built-in observability (function logs, error
  traces, HTTP status, dashboard) — no extra setup needed. For server-side
  error alerting, Convex supports Sentry for actions: install `@sentry/node`,
  initialize it in the action runtime with the `SENTRY_DSN` backend env var
  and wrap the `assistant.chat` / `envStatus` actions (see Convex docs,
  “Sentry”); this is optional and documented here rather than wired in code
  because it requires a real DSN to be useful.

### Docker

Intentionally not used. The stack is serverless: Convex runs the backend
functions in its cloud (no containers to manage), Vercel serves the static
frontend. A Dockerfile would add packaging work with zero operational benefit
for this architecture. If you need a portable local environment, `node 22`
(engines in `package.json`) plus `npm ci` is the full requirement — see
`.freebuff/run.md`.

## Auth is already set up.

All convex authentication functions are already set up. The auth currently uses email OTP, Google OAuth and anonymous (guest) users.

The email OTP configuration is defined in `src/convex/auth/emailOtp.ts`
(already extended with server-side rate-limit and VLY email delivery — change
it deliberately, not blindly).

The Google OAuth provider lives in `src/convex/auth.ts` (imported from
`@auth/core/providers/google`); the sign-in button is on `/auth`.

### Enabling Google OAuth (one-time setup)

1. **OAuth consent screen** — [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   → **OAuth consent screen** (left menu) → **External** → fill in the app name
   and your email → **Save**. Keep the status **Testing** while developing; in
   Testing mode only accounts listed in **Test users** can sign in — add your
   own email there, otherwise Google answers `access_denied`.
2. **OAuth client ID** — **Credentials** → **Create credentials → OAuth client
   ID** → type **Web application**.
3. Under **Authorized redirect URIs** add both callbacks. The callback route is
   served by Convex Auth at `CONVEX_SITE_URL` — use the Convex URLs, **not**
   the Vercel domain (its SPA rewrites would return the app instead of the
   auth endpoint):
   - local backend: `http://127.0.0.1:3211/api/auth/callback/google`
   - production: `https://<your-project>.convex.cloud/api/auth/callback/google`
   (Authorized JavaScript origins can stay empty — the flow uses a code
   exchange, not an implicit flow.)
4. **Create** → copy the **Client ID** (`*.apps.googleusercontent.com`) and the
   **Client Secret**.
5. Set them in the environment. Locally (dev backend reads env at startup —
   restart `convex dev` after):

   ```bash
   CONVEX_DEV_DEPLOYMENT=local npx convex env set AUTH_GOOGLE_ID <client-id>
   CONVEX_DEV_DEPLOYMENT=local npx convex env set AUTH_GOOGLE_SECRET <client-secret>
   ```

   For production, add the same two variables in the Convex Dashboard
   (Project → Settings → Environment Variables) and run `npx convex deploy`.

The button on `/auth` then signs the user in with their Google account. When
an anonymous guest signs in with Google, the existing user and their data are
kept (account linking, `createOrUpdateUser` in `src/convex/auth.ts`).

> **Linking note:** account linking here is *session-based* (guest → Google,
> guest → email). A Google account whose email already belongs to an
> email-OTP user is **not** auto-merged — that would require email-based
> linking (`allowDangerousEmailAccountLinking`), which is intentionally off
> to avoid silently joining accounts.

These files are already extended (Google OAuth, guest→email linking, attempt
limits) — change them deliberately, and keep the auth docs above in sync.

## Using Convex Auth on the backend

On the `src/convex/users.ts` file, you can use the `getCurrentUser` function to get the current user's data.

## Using Convex Auth on the frontend

The `/auth` page is already set up to use auth. Navigate to `/auth` for all log in / sign up sequences.

You MUST use this hook to get user data. Never do this yourself without the hook:
```typescript
import { useAuth } from "@/hooks/use-auth";

const { isLoading, isAuthenticated, user, signIn, signOut } = useAuth();
```

## Protected Routes

The starter `/dashboard` route is protected with `RequireAuth`, which sends
signed-out users to `/auth?returnTo=<current route>`. Extend that page for the
product's authenticated experience, and reuse `RequireAuth` when adding another
protected route.

## Auth Page

The auth page is defined in `src/pages/Auth.tsx`. Send sign-in and sign-up actions
to `/auth`.

## Authorization

You can perform authorization checks on the frontend and backend.

On the frontend, you can use the `useAuth` hook to get the current user's data and authentication state.

You should also be protecting queries, mutations, and actions at the base level, checking for authorization securely.

**Role model (SaaS-ready):** `src/convex/roles.ts` implements a working
`ROLES` layer — `myRole` query, `getUserRole` helper (default `USER` for
legacy accounts), `assertRole` guard, and an admin-only `setUserRole`
mutation with last-admin protection. See `ARCHITECTURE.md` for conventions
(feature folders, i18n strategy).

## Security & privacy

**CSRF.** Authentication uses Convex bearer tokens from the same-origin
client — there are no cookies, so classic cross-site request forgery does not
apply. `auth.config.ts` validates federated JWTs against a pinned JWKS;
`convex/http.ts` (auth callback routes) only binds the self-issued
`CONVEX_SITE_URL` issuer.

**Global rate limiting (anti-flood).** Write mutations (water, meal log,
foods, weight, workout logs, plan saves) are throttled by
`src/convex/rateLimit.ts` (`rateLimitEvents` table, sliding window,
`retryAfterSec` error). The AI assistant has its own per-user daily quota
(messages + tokens) and anti-spam interval — see `assistantLimits.ts`. OTP
sending is additionally limited to once per 60 s per email, and code-entry
failures to 5 per hour (built into `@convex-dev/auth`).

**Account export & deletion (GDPR).** `src/convex/account.ts`:
`exportMyData` returns every table of the current user (UI button downloads a
JSON bundle), `deleteMyAccount` wipes all app data, sessions, linked
providers and the user document. Both are reachable from Профиль → «Данные и
приватность»; the policy itself lives at `/privacy` (static page,
`src/pages/Privacy.tsx`).

**Google ↔ email account linking.** `createOrUpdateUser` in `src/convex/auth.ts`
links a verified-email sign-in (Google OAuth or email OTP after code
verification) to an existing user with that verified email, so signing in via
Google and then email (or vice versa) does not create duplicate accounts.
Anonymous-session linking (guest → email) takes precedence and preserves all
guest data.

## Adding a redirect after auth

The `/auth` route in `src/main.tsx` redirects to `/dashboard` by default. If the
product's main authenticated route is different, update `redirectAfterAuth` to
that route. A validated same-origin `returnTo` query parameter takes priority so
users can resume the protected page they originally requested. Never leave an
authenticated product redirecting back to the public landing page.

## Complete authenticated products

When the requested product implies accounts, a workspace, a dashboard, or other
signed-in functionality, the task is not complete with only a landing page and
auth form. Build the main authenticated experience, protect its route, and verify
that signing in reaches it.

# Frontend Conventions

You will be using the Vite frontend with React 19, Tailwind v4, and Shadcn UI.

Generally, pages should be in the `src/pages` folder, and components should be in the `src/components` folder.

Shadcn primitives are located in the `src/components/ui` folder and should be used by default.

## Page routing

Your page component should go under the `src/pages` folder.

When adding a page, update the react router configuration in `src/main.tsx` to include the new route you just added.

## Shad CN conventions

Follow these conventions when using Shad CN components, which you should use by default.
- Remember to use "cursor-pointer" to make the element clickable
- For title text, use the "tracking-tight font-bold" class to make the text more readable
- Always make apps MOBILE RESPONSIVE. This is important
- AVOID NESTED CARDS. Try and not to nest cards, borders, components, etc. Nested cards add clutter and make the app look messy.
- AVOID SHADOWS. Avoid adding any shadows to components. stick with a thin border without the shadow.
- Avoid skeletons; instead, use the loader2 component to show a spinning loading state when loading data.


## Landing Pages

You must always create good-looking designer-level styles to your application. 
- Make it well animated and fit a certain "theme", ie neo brutalist, retro, neumorphism, glass morphism, etc

Use known images and emojis from online.

If the user is logged in already, show the get started button to say "Dashboard" or "Profile" instead to take them there.

## Responsiveness and formatting

Make sure pages are wrapped in a container to prevent the width stretching out on wide screens. Always make sure they are centered aligned and not off-center.

Always make sure that your designs are mobile responsive. Verify the formatting to ensure it has correct max and min widths as well as mobile responsiveness.

- Always create sidebars for protected dashboard pages and navigate between pages
- Always create navbars for landing pages
- On these bars, the created logo should be clickable and redirect to the index page

## Animating with Framer Motion

You must add animations to components using Framer Motion. It is already installed and configured in the project.

To use it, import the `motion` component from `framer-motion` and use it to wrap the component you want to animate.


### Other Items to animate
- Fade in and Fade Out
- Slide in and Slide Out animations
- Rendering animations
- Button clicks and UI elements

Animate for all components, including on landing page and app pages.

## Three JS Graphics

Your app comes with three js by default. You can use it to create 3D graphics for landing pages, games, etc.


## Colors

You can override colors in: `src/index.css`

This uses the oklch color format for tailwind v4.

Always use these color variable names.

Make sure all ui components are set up to be mobile responsive and compatible with both light and dark mode.

Set theme using `dark` or `light` variables at the parent className.

## Styling and Theming

When changing the theme, always change the underlying theme of the shad cn components app-wide under `src/components/ui` and the colors in the index.css file.

Avoid hardcoding in colors unless necessary for a use case, and properly implement themes through the underlying shad cn ui components.

When styling, ensure buttons and clickable items have pointer-click on them (don't by default).

Always follow a set theme style and ensure it is tuned to the user's liking.

## Toasts

You should always use toasts to display results to the user, such as confirmations, results, errors, etc.

Use the shad cn Sonner component as the toaster. For example:

```
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
export function SonnerDemo() {
  return (
    <Button
      variant="outline"
      onClick={() =>
        toast("Event has been created", {
          description: "Sunday, December 03, 2023 at 9:00 AM",
          action: {
            label: "Undo",
            onClick: () => console.log("Undo"),
          },
        })
      }
    >
      Show Toast
    </Button>
  )
}
```

Remember to import { toast } from "sonner". Usage: `toast("Event has been created.")`

## Dialogs

Always ensure your larger dialogs have a scroll in its content to ensure that its content fits the screen size. Make sure that the content is not cut off from the screen.

Ideally, instead of using a new page, use a Dialog instead. 

# Using the Convex backend

You will be implementing the convex backend. Follow your knowledge of convex and the documentation to implement the backend.

## The Convex Schema

You must correctly follow the convex schema implementation.

The schema is defined in `src/convex/schema.ts`.

Do not include the `_id` and `_creationTime` fields in your queries (it is included by default for each table).
Do not index `_creationTime` as it is indexed for you. Never have duplicate indexes.


## Convex Actions: Using CRUD operations

When running anything that involves external connections, you must use a convex action with "use node" at the top of the file.

You cannot have queries or mutations in the same file as a "use node" action file. Thus, you must use pre-built queries and mutations in other files.

You can also use the pre-installed internal crud functions for the database:

```ts
// in convex/users.ts
import { crud } from "convex-helpers/server/crud";
import schema from "./schema.ts";

export const { create, read, update, destroy } = crud(schema, "users");

// in some file, in an action:
const user = await ctx.runQuery(internal.users.read, { id: userId });

await ctx.runMutation(internal.users.update, {
  id: userId,
  patch: {
    status: "inactive",
  },
});
```


## Common Convex Mistakes To Avoid

When using convex, make sure:
- Document IDs are referenced as `_id` field, not `id`.
- Document ID types are referenced as `Id<"TableName">`, not `string`.
- Document object types are referenced as `Doc<"TableName">`.
- Keep schemaValidation to false in the schema file.
- You must correctly type your code so that it passes the type checker.
- You must handle null / undefined cases of your convex queries for both frontend and backend, or else it will throw an error that your data could be null or undefined.
- Always use the `@/folder` path, with `@/convex/folder/file.ts` syntax for importing convex files.
- This includes importing generated files like `@/convex/_generated/server`, `@/convex/_generated/api`
- Remember to import functions like useQuery, useMutation, useAction, etc. from `convex/react`
- NEVER have return type validators.
