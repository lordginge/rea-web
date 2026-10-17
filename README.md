# REA Web

A web UI for [REA (Reverse Engineer Anything)](https://github.com/morluto/rea).
Paste any public website URL and REA opens it in a real headless browser, then
inspects the page through the Chrome DevTools Protocol. You get the page
structure, scripts, network requests, console output, storage keys and a
viewport screenshot, each finding backed by a REA evidence ID.

## How it works

- The frontend is a React + Vite + Tailwind + shadcn/ui single page.
- The backend (Hono + tRPC + Drizzle/MySQL) accepts a URL, validates that it is
  a public http(s) target (SSRF guard: localhost and private ranges are
  rejected), then orchestrates REA:
  1. launches headless Chromium with a CDP debugging port,
  2. opens the target URL in a tab,
  3. runs `rea-agents list-browser-targets` to resolve the page target,
  4. runs `rea-agents inspect-web-page` (plus `capture-web-screenshot` when
     enabled) and returns the normalized, evidence-backed result.
- Every analysis is persisted (URL, status, result JSON) and shown in the
  recent-analyses list, so results can be re-opened later.

## Repo contents

This project was built on the Kimi webapp-building stack (React + TypeScript +
Vite + Tailwind + shadcn/ui) with the backend-building graft (Hono + tRPC 11 +
Drizzle ORM + MySQL). This repo contains every file specific to REA Web:

- `src/pages/Home.tsx` — the whole UI (URL input, options, results, history)
- `api/rea/runner.ts` — the Chromium + REA CLI orchestration and SSRF guard
- `api/rea/router.ts` — the `rea.analyze` / `rea.history` / `rea.get` tRPC procedures
- `db/schema.ts` — the analyses table
- `api/router.ts` — router registration
- `Dockerfile` — Node 22 + Chromium image for deployment
- `package.json` — dependencies (includes `rea-agents`)

The generic scaffold files (Vite config, tRPC provider, Hono boot, the shadcn/ui
components under `src/components/ui/`, tailwind/tsconfig boilerplate) come from
the Kimi `0-origin` webapp template and backend-building graft and are not
duplicated here. To run standalone, scaffold a project with those two Kimi
skills, copy this repo's files in, then:

```bash
npm install
npm run db:push
npm run dev        # http://localhost:3000
```

Production:

```bash
npm run build && npm start
```

or build the included `Dockerfile` (Node 22 + Chromium, everything included).

## Notes and limits

- Analysis is passive observation of the live page in a sandboxed headless
  browser. Only public http(s) targets are accepted.
- Findings reflect REA's observation window; a fast-loading page may show few
  or no network requests because they completed before capture started.
- REA requires Node.js >= 22.19. The Dockerfile pins Node 22 for that reason.
