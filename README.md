# W2W Racing — Members Portal

React + Vite + TypeScript + Tailwind dashboard app for W2W Racing members: driver profiles/achievements, event signups, and car/livery management. Login-gated via Discord OAuth, handled entirely by the `members-backend` API.

## Setup

```bash
cp .env.example .env   # VITE_API_URL should point at the members-backend, default http://localhost:3001
npm install
npm run dev            # http://localhost:5174
```

Requires `members-backend` running (see its README for Discord app + Postgres setup) — this app has no functionality of its own beyond calling that API.

## Structure

- `src/context/AuthContext.tsx` — current user + auth state, hydrated from `GET /auth/me`.
- `src/routing/{RequireAuth,RequireAdmin}.tsx` — route guards.
- `src/layouts/{AuthLayout,DashboardShell}.tsx` — the public auth-page shell vs. the logged-in sidebar shell.
- `src/lib/api*` — typed fetch client, one module per backend resource.
- `src/pages/**` — one folder per feature area (auth, dashboard, drivers, events, cars, admin).

Sign-in is a redirect flow: `LoginPage` links straight to the backend's `/auth/discord`, which round-trips through Discord and lands back on `/dashboard`, `/pending-approval`, or `/not-in-server` depending on the outcome.
