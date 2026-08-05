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

Frontend error tracking (Sentry) is enabled only when `VITE_SENTRY_DSN` is set;
`beforeSend` strips emails, JWTs and API keys before events leave the browser.
Read-only helper values (`GEMINI_MODEL`, optional) tune the model used.

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
convention: `AUTH_<PROVIDER_ID>_ID` / `AUTH_<PROVIDER_ID>_SECRET`).

Do **NOT** set `VLY_EMAIL_DEV_CAPTURE` in production — the dev OTP capture is
for local work only. Guest sign-in works immediately; email OTP sends the code
through the VLY gateway (`vly.email.send`) using `VLY_INTEGRATION_KEY`. For
letters to be delivered, verify the sender domain in the VLY dashboard — until
then the send call returns an error and the code is not delivered.

OTP delivery is rate-limited server-side (`src/convex/otpRateLimit.ts`):
re-sending a code to the same email within 60 seconds is rejected before the
VLY gateway is hit. Failed code-entry attempts are additionally capped at 5
per hour (`signIn.maxFailedAttempsPerHour` in `src/convex/auth.ts`, built into
`@convex-dev/auth`).

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

## Auth is already set up.

All convex authentication functions are already set up. The auth currently uses email OTP, Google OAuth and anonymous (guest) users.

The email OTP configuration is defined in `src/convex/auth/emailOtp.ts`. DO NOT MODIFY THIS FILE.

The Google OAuth provider lives in `src/convex/auth.ts` (imported from
`@auth/core/providers/google`); the sign-in button is on `/auth`.

### Enabling Google OAuth (one-time setup)

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   → **Create credentials → OAuth client ID** → type **Web application**.
2. Under **Authorized redirect URIs** add the Convex auth callback:
   - local backend: `http://127.0.0.1:3210/api/auth/callback/google`
   - production: `https://<your-project>.convex.cloud/api/auth/callback/google`
   (also add your frontend URL under **Authorized JavaScript origins**).
3. Copy the **Client ID** and **Client Secret** into the Convex environment
   as `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` (Convex Dashboard → Settings →
   Environment Variables, or `npx convex env set`).
4. `npx convex deploy` to push the updated `auth.ts` provider list.

The button on `/auth` then signs the user in with their Google account. When
an anonymous guest signs in with Google, the existing user and their data are
kept (account linking, `createOrUpdateUser` in `src/convex/auth.ts`).

> **Linking note:** account linking here is *session-based* (guest → Google,
> guest → email). A Google account whose email already belongs to an
> email-OTP user is **not** auto-merged — that would require email-based
> linking (`allowDangerousEmailAccountLinking`), which is intentionally off
> to avoid silently joining accounts.

Also, DO NOT MODIFY THESE AUTH FILES: `src/convex/auth.config.ts` and `src/convex/auth.ts`.

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
