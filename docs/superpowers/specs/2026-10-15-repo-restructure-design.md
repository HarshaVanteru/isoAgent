# Repo Restructure & Frontend Refactor — Design

Date: 2026-10-15 · Status: awaiting review

## Goal

Make `backend/` and `frontend/` fully self-contained projects, and rebuild the
frontend as a maintainable, well-structured React app with a refined UI/UX.
The backend gets a light touch: the move, plus fixes for real duplication or
defects only. Pipeline behaviour, prompts, and the HTTP API contract do not change.

## Decisions (agreed)

| Topic | Decision |
| --- | --- |
| Root contents | Only `README.md`, `.gitignore`, `backend/`, `frontend/` (+ this `docs/` folder) |
| Backend scope | Move everything Python into `backend/`; fix duplication/defects only |
| API contract | Unchanged — all current URLs keep working (incl. legacy `/review`, un-prefixed routes) |
| Env files | `backend/.env` (+ `.env.example`), `frontend/.env` (+ `.env.example`) — independent |
| UI direction | Option A: keep the sage-green document-workspace identity, raise the craft |
| README | Update paths/commands to the new layout; no rewrite |

## 1. Target layout

```text
README.md
.gitignore
backend/
  .env.example  .python-version  pyproject.toml  requirements.txt  compose.yaml
  app/                      (unchanged package internals, see §2)
  tests/                    (moved from root)
frontend/
  .env.example  index.html  package.json  package-lock.json
  tsconfig.json  tsconfig.node.json  vite.config.ts  eslint.config.js
  src/                      (see §3)
```

## 2. Backend

### 2.1 Move
- `pyproject.toml`, `requirements.txt`, `.python-version`, `.env.example`,
  `compose.yaml`, `tests/` → `backend/`. `backend/__init__.py` is deleted.
- The import package becomes `app` (run from `backend/`):
  `uvicorn app.main:app`, `python -m app.ingest`. Internal imports are already
  relative, so only tests, `pyproject.toml`, and one user-facing error string
  (`nodes.py`: "Run python -m backend.app.ingest …") change.
- `pyproject.toml`: `module-name = "app"`, script `iso-agent = "app.ingest:main"`,
  pytest `pythonpath = ["."]`, `testpaths = ["tests"]`.
- `core/config.py`: `ROOT = parents[3]` → `BACKEND_DIR = parents[2]`. `.env`,
  `data/`, `.cache/`, and the default document folder resolve under `backend/`.
- `.gitignore`: anchor backend-generated paths under `backend/`
  (`/backend/data/`, `/backend/ISO 9001 Full Documents/`).

### 2.2 Targeted fixes (no behaviour change)
1. **Double locking** — `IngestionService.ingest_file/_ingest_file`,
   `ingest_folder/_ingest_folder`, `upload/_upload` each take the same `RLock`
   twice. Collapse each pair into one locked method.
2. **Untyped dependencies** — routes use `Annotated[object, Depends(get_services)]`
   and reach into `request.app.state.conversations`. Add typed dependencies
   (`ServicesDep`, `ConversationsDep`) in `api/dependencies.py`.
3. **Routes in `main.py`** — `/health` and `/api/documents` move into a new
   `api/routes/system.py`; `main.py` becomes assembly + lifespan only.
4. **Hard-coded CORS origins** — add `cors_origins` setting (default
   `http://localhost:5173,http://127.0.0.1:5173`) so the frontend port in
   `frontend/.env` can change without editing code.

Explicitly **not** changed: graph topology, nodes, prompts, chunking, Qdrant
store, legacy review compatibility, checkpoint filename, response shapes.

## 3. Frontend

### 3.1 Tooling
- Keep React 19 + Vite 6 + TypeScript (strict). Add `noUnusedLocals/Parameters`.
- Add ESLint (flat config: typescript-eslint, react-hooks, react-refresh).
- Add Vitest + Testing Library + jsdom for unit/component tests.
- Scripts: `dev`, `build`, `preview`, `lint`, `typecheck`, `test`.
- `frontend/.env`: `VITE_API_PROXY_TARGET` (default `http://127.0.0.1:8000`),
  `VITE_DEV_PORT` (default `5173`); read in `vite.config.ts` via `loadEnv`.
- Google Fonts move from CSS `@import` to `<link rel=preconnect>` + `<link>` in `index.html`.

### 3.2 Source structure

```text
src/
  main.tsx
  app/
    App.tsx               view switching, global notices
    AppShell.tsx          sidebar + header + main layout, mobile drawer
  api/
    client.ts             fetch wrapper, ApiError, JSON handling
    endpoints.ts          health, documents, threads (create/get/ask/clarify)
    types.ts              Thread, Message, Source, LibraryReport, LibraryFile, Health
  features/
    chat/
      ChatView.tsx  MessageList.tsx  MessageItem.tsx  Composer.tsx
      WelcomeScreen.tsx  ClarificationCard.tsx  SourceList.tsx  SourceCard.tsx
      useConversation.ts  citations.ts (+ .test.ts)  sourceLabel.ts (+ .test.ts)
    library/
      LibraryView.tsx  LibraryStats.tsx  FileList.tsx  FileRow.tsx
      useLibrary.ts  files.ts (+ .test.ts)
  components/            Sidebar.tsx  Header.tsx  Notice.tsx  Markdown.tsx  Spinner.tsx
  hooks/                 useHealth.ts  useLocalStorage.ts
  styles/                tokens.css  base.css
```

Each component has a co-located `*.module.css` (CSS Modules — Vite-native,
scoped, no new dependency). All colours, spacing, radii, shadows, and type
scale come from `tokens.css` custom properties.

**Responsibilities**
- `api/` is the only code that calls `fetch`. Types replace the current ad-hoc
  shapes; `File` is renamed `LibraryFile` (no longer shadows DOM `File`).
- `useConversation` owns thread state, restore-from-localStorage, ask/clarify,
  in-flight guard, optimistic pending message, and error state — the logic now
  inline in `App`.
- `useLibrary` owns fetching + 30 s polling (paused while a chat request is in
  flight) and exposes derived `files`, `indexedCount`, `categories`
  (pure helpers in `files.ts`).
- Components are presentational; props are typed; no component > ~150 lines.

### 3.3 UI/UX improvements (same identity)
1. **Readable design system** — tokens for the existing sage palette; consistent
   spacing/type scale; replaces 12 KB of minified, hard-coded CSS.
2. **Dark mode** — follows `prefers-color-scheme` via token overrides.
3. **Responsive** — below 900 px the sidebar becomes an off-canvas drawer opened
   from a header menu button (Esc / backdrop closes, focus returns to trigger);
   composer and messages reflow for phones.
4. **Clickable citations** — in the latest assistant answer, `[n]` renders as a
   button that scrolls to and expands source *n* (sources belong to the latest
   turn only, so older answers keep plain text).
5. **Composer** — auto-growing textarea (capped), Enter to send / Shift+Enter
   newline hint, disabled reasons visible, focus restored after send.
6. **States** — skeletons for conversation restore and library load; clear empty
   state for an un-indexed library; errors dismissible and announced (`role=alert`).
7. **Accessibility** — landmarks, `aria-current` on nav, `aria-live` for new
   answers and "working" status, visible focus rings, AA contrast in both themes,
   `prefers-reduced-motion` respected.
8. **Library** — files grouped by category with status filter (All / Indexed /
   Needs attention / Not indexed) and a search box; error text shown inline.

Out of scope (YAGNI): uploads/delete from UI, conversation history list,
routing library, global state library, data-fetching library.

## 4. Error handling
- `ApiError(status, message)` from `client.ts`; FastAPI `detail` strings surface
  verbatim. Restore of a 404/422 thread clears the stored id (current behaviour).
- Network failure while polling the library does not overwrite an existing
  library snapshot; it shows a dismissible notice once.

## 5. Testing & verification
- Backend: `cd backend && python -m pytest -q` passes (same suite, updated imports).
  Model/Groq opt-in tests unchanged.
- Frontend: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`
  all pass. Unit tests cover `files.ts`, `citations.ts`, `sourceLabel.ts`,
  `api/client.ts`; a component test covers Composer submit/Enter behaviour.
- Manual: run both, check chat, clarification, sources, library, mobile width,
  dark mode in the browser.

## 6. Risks
- Existing local `data/` / `.env` at the old root location would no longer be
  found; the README notes moving them into `backend/`.
- Installing backend deps (torch via sentence-transformers, Docling) is large;
  verification needs a `backend/.venv`.
