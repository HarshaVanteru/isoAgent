# Repo Restructure & Frontend Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `backend/` and `frontend/` fully self-contained projects, and rebuild the frontend as a structured, tested React app with a refined UI/UX.

**Architecture:** Backend files move under `backend/`; the import package becomes `app`; four targeted fixes (single locking, typed dependencies, system routes module, configurable CORS). The frontend's single 13 KB `App.tsx` + minified CSS is replaced by an `api/` layer, feature folders (`chat/`, `library/`), shared components, hooks, design tokens and CSS Modules.

**Tech Stack:** Python 3.12, FastAPI, LangGraph, pytest · React 19, Vite 6, TypeScript 5.7 (strict), CSS Modules, ESLint 9 (flat), Vitest 3 + Testing Library + jsdom, lucide-react, react-markdown + remark-gfm.

**Spec:** `docs/superpowers/specs/2026-10-15-repo-restructure-design.md`

## Global Constraints

- Root contains only `README.md`, `.gitignore`, `backend/`, `frontend/`, `docs/`.
- HTTP API contract unchanged: every current URL (incl. `/review`, un-prefixed `/documents/*`, `/search`, `/health`) keeps working with the same response shapes.
- Pipeline behaviour, prompts, graph topology, chunking, Qdrant store: unchanged.
- Backend env file: `backend/.env`; frontend env file: `frontend/.env`. Each has a committed `.env.example`.
- Backend venv: `backend/.venv` (already created and populated; CPU torch + CPU torchvision).
- Baseline backend suite before any change: **60 passed, 4 skipped** — must stay identical (plus new tests).
- Frontend keeps the sage-green identity; adds dark mode via `prefers-color-scheme`; responsive breakpoint 900 px (drawer), 640 px (compact).
- No new runtime dependencies in the frontend (dev dependencies only).
- Commits happen only if the user approved committing; work on branch `refactor/repo-restructure`.

## Review Focus

1. **Backend down / Vite proxy error** — the dev proxy answers `500` with an empty body; the UI must say the backend is unreachable/misbehaving, not "Request failed". → `client.test.ts` (Task 3).
2. **IME composition** — pressing Enter to confirm a Japanese/Chinese candidate must not send the message. → `Composer.test.tsx` (Task 8).
3. **Stored thread restore** — a 404/422 thread id is forgotten silently; a network failure keeps the id and shows the error. → `useConversation.test.ts` (Task 6).
4. **Citations** — `[1][2]` (the backend's normalised form) must both link; numbers without a source and anything inside code must stay plain text. → `citations.test.ts` (Task 4).
5. **Existing Qdrant Docker volume** — moving `compose.yaml` into `backend/` changes the Compose project name and would orphan the `qdrant_data` volume; pin `name: isoagent`. → `docker compose config` check (Task 1).

---

## File Structure

```text
backend/
  .env.example  .python-version  compose.yaml  pyproject.toml  requirements.txt   (moved)
  app/core/config.py               BACKEND_DIR paths, cors_origins
  app/api/dependencies.py          ServicesDep, ConversationsDep
  app/api/routes/system.py         NEW: /health, /api/health, /api/documents
  app/api/routes/{chat,documents,search}.py   typed deps
  app/main.py                      assembly + lifespan only
  app/services/ingestion_service.py  single-lock methods
  app/conversation/nodes.py        ingest command string
  tests/                           moved; imports app.*; NEW test_system_routes.py
frontend/
  .env.example  index.html  package.json  tsconfig.json  tsconfig.app.json
  tsconfig.node.json  vite.config.ts  eslint.config.js
  src/main.tsx
  src/test/setup.ts
  src/app/        App.tsx App.module.css AppShell.tsx AppShell.module.css AppShell.test.tsx view.ts
  src/api/        client.ts client.test.ts endpoints.ts types.ts
  src/lib/        citations.ts(+test) cx.ts motion.ts storage.ts(+test)
  src/hooks/      useHealth.ts
  src/components/ Header Markdown(+test) Notice Sidebar Skeleton Spinner (.tsx + .module.css)
  src/features/chat/     ChatView(+test) ClarificationCard Composer(+test) MessageItem MessageList
                         SourceCard SourceList WelcomeScreen (.tsx + .module.css)
                         sourceLabel.ts(+test) useConversation.ts(+test) useSourceFocus.ts
  src/features/library/  FileList FileRow LibraryStats LibraryView(+test) (.tsx + .module.css)
                         files.ts(+test) useLibrary.ts(+test)
  src/styles/     tokens.css base.css
  (deleted) src/App.tsx src/style.css
```

---

### Task 1: Move all backend files into `backend/`

**Files:**
- Move: `pyproject.toml`, `requirements.txt`, `.python-version`, `.env.example`, `compose.yaml`, `tests/` → `backend/`
- Delete: `backend/__init__.py`
- Modify: `backend/pyproject.toml`, `backend/requirements.txt`, `backend/compose.yaml`, `backend/.env.example`, `backend/app/core/config.py:6-48`, `backend/app/conversation/nodes.py:112`, `backend/tests/*.py` (imports), `.gitignore`

**Interfaces:**
- Produces: import package `app` (run from `backend/`), `app.core.config.BACKEND_DIR: Path`.

- [ ] **Step 1: Create branch and move files**

```bash
cd /home/venu-reddy/Desktop/isoAgent
git switch -c refactor/repo-restructure
git mv pyproject.toml requirements.txt .python-version .env.example compose.yaml backend/
git mv tests backend/tests
git rm -q backend/__init__.py
```

- [ ] **Step 2: Point tests at the new package name (they fail to import now)**

```bash
cd backend
sed -i 's/backend\.app/app/g' tests/*.py
.venv/bin/python -m pytest -q -p no:cacheprovider 2>&1 | tail -3
```
Expected: collection errors / failures (`config.py` still resolves the repo root; `nodes.py` message still says `backend.app.ingest`).

- [ ] **Step 3: Resolve paths relative to `backend/`** — in `backend/app/core/config.py` replace the `ROOT` constant and every `ROOT` use:

```python
BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / '.env', extra='ignore')
    groq_api_key: str = ''
    groq_model: str = 'openai/gpt-oss-120b'
    document_dir: Path = BACKEND_DIR / 'ISO 9001 Full Documents'
    data_dir: Path = BACKEND_DIR / 'data'
    ...
    model_cache_dir: Path = BACKEND_DIR / '.cache' / 'huggingface' / 'hub'
    ...
    @model_validator(mode='after')
    def paths_and_limits(self):
        for name in ('document_dir', 'data_dir', 'model_cache_dir'):
            value = getattr(self, name)
            setattr(self, name, value.resolve() if value.is_absolute() else (BACKEND_DIR / value).resolve())
        if self.qdrant_path and self.qdrant_path != ':memory:':
            self.qdrant_path = str((BACKEND_DIR / self.qdrant_path).resolve())
```

In `backend/app/conversation/nodes.py` line 112:

```python
            raise CorpusUnavailable('Run python -m app.ingest before querying documents.')
```

- [ ] **Step 4: Fix packaging** — `backend/pyproject.toml`: delete the `readme = "README.md"` line (the README lives outside the project), and set:

```toml
[project.scripts]
iso-agent = "app.ingest:main"

[tool.uv.build-backend]
module-name = "app"
module-root = ""

[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["."]
```

`backend/requirements.txt` header becomes:

```text
# Generated from pyproject.toml; update dependency versions there first.
# Requires Python 3.12 or newer. Run from the backend/ directory:
#   python -m pip install -r requirements.txt
# On Linux without a GPU, install CPU wheels first to avoid multi-GB CUDA downloads:
#   python -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
#
# Node.js/npm, LibreOffice, and Docker/Qdrant are installed separately.
```

`backend/compose.yaml` — first line, so the existing `isoagent_qdrant_data` volume is reused:

```yaml
name: isoagent
```

`backend/.env.example` — add one comment line at the top:

```text
# Backend settings. Relative paths (DOCUMENT_DIR, DATA_DIR, MODEL_CACHE_DIR, QDRANT_PATH) resolve from backend/.
```

- [ ] **Step 5: Anchor backend-generated paths in `.gitignore`** — replace `/build/` `/dist/` `/ISO 9001 Full Documents/` `/data/` with:

```text
/backend/build/
/backend/dist/
/backend/ISO 9001 Full Documents/
/backend/data/
```

- [ ] **Step 6: Run the suite**

Run: `cd backend && .venv/bin/python -m pytest -q -p no:cacheprovider`
Expected: `60 passed, 4 skipped`

- [ ] **Step 7: Verify packaging and the CLI entry point**

```bash
cd backend
.venv/bin/python -m pip install -q --no-deps -e .
.venv/bin/iso-agent --help | head -3        # usage: iso-agent [-h] [--folder FOLDER] [--force]
.venv/bin/python -c "from app.main import app; print(app.title)"   # ISO Knowledge Assistant
command -v docker && docker compose config | grep -A1 '^volumes' # isoagent_qdrant_data (skip if no docker)
ls -A ..                                    # .git .gitignore README.md backend docs frontend (+.remember)
```

- [ ] **Step 8: Commit**

```bash
git add -A . ../.gitignore && git commit -m "refactor(backend): move all backend files into backend/"
```

---

### Task 2: Backend targeted fixes

**Files:**
- Create: `backend/app/api/routes/system.py`, `backend/tests/test_system_routes.py`
- Modify: `backend/app/api/dependencies.py`, `backend/app/api/routes/chat.py`, `backend/app/api/routes/documents.py`, `backend/app/api/routes/search.py`, `backend/app/main.py`, `backend/app/core/config.py`, `backend/app/services/ingestion_service.py`, `backend/.env.example`

**Interfaces:**
- Consumes: `app.services.container.Services`, `app.services.conversation_service.ConversationService`.
- Produces: `ServicesDep`, `ConversationsDep`, `get_conversations(request)`, `Settings.cors_origins: str`, `Settings.cors_origin_list: list[str]`, router `app.api.routes.system.router`.

- [ ] **Step 1: Write the failing tests** — `backend/tests/test_system_routes.py`:

```python
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.api.dependencies import get_conversations
from app.api.routes import system
from app.core.config import Settings
from app.core.errors import IndexConfigurationError
from app.main import app


def test_system_router_owns_health_and_library_overview():
    paths = {route.path for route in system.router.routes}
    assert paths == {'/health', '/api/health', '/api/documents'}


def test_health_is_served_on_both_paths():
    with TestClient(app) as client:
        for path in ('/health', '/api/health'):
            body = client.get(path).json()
            assert body['status'] == 'ok'
            assert body['index_backend'] == 'qdrant'


def test_documents_overview_combines_report_and_inventory(monkeypatch):
    with TestClient(app) as client:
        ingestion = app.state.services.ingestion
        monkeypatch.setattr(ingestion, 'report', lambda: {'files': [], 'chunks': 0, 'indexed_at': None})
        monkeypatch.setattr(ingestion, 'inventory', lambda: [{'source': 'a.pdf', 'file_type': '.pdf'}])
        body = client.get('/api/documents').json()
        assert body['chunks'] == 0
        assert body['inventory'] == [{'source': 'a.pdf', 'file_type': '.pdf'}]


def test_cors_origins_parse_from_comma_separated_setting():
    settings = Settings(_env_file=None, cors_origins=' http://a:1 , http://b:2,, ')
    assert settings.cors_origin_list == ['http://a:1', 'http://b:2']


def test_cors_allows_default_frontend_origin():
    with TestClient(app) as client:
        response = client.options('/api/health', headers={
            'Origin': 'http://127.0.0.1:5173', 'Access-Control-Request-Method': 'GET'})
        assert response.headers['access-control-allow-origin'] == 'http://127.0.0.1:5173'


def test_conversation_dependency_requires_initialized_service():
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace()))
    with pytest.raises(IndexConfigurationError):
        get_conversations(request)
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && .venv/bin/python -m pytest tests/test_system_routes.py -q -p no:cacheprovider`
Expected: FAIL — `ImportError: cannot import name 'get_conversations'`.

- [ ] **Step 3: Typed dependencies** — replace `backend/app/api/dependencies.py`:

```python
"""Typed FastAPI dependencies for services created in the application lifespan."""
from typing import Annotated

from fastapi import Depends, Request

from ..core.errors import IndexConfigurationError
from ..services.container import Services
from ..services.conversation_service import ConversationService


def get_services(request: Request) -> Services:
    services = getattr(request.app.state, 'services', None)
    if services is None:
        raise IndexConfigurationError('Application services are not initialized')
    return services


def get_conversations(request: Request) -> ConversationService:
    conversations = getattr(request.app.state, 'conversations', None)
    if conversations is None:
        raise IndexConfigurationError('Conversation service is not initialized')
    return conversations


ServicesDep = Annotated[Services, Depends(get_services)]
ConversationsDep = Annotated[ConversationService, Depends(get_conversations)]
```

`backend/app/api/routes/chat.py`:

```python
"""Chat HTTP endpoints; conversation behavior lives in ConversationService."""
from uuid import UUID, uuid4
from fastapi import APIRouter
from ..dependencies import ConversationsDep
from ...models.requests import Question, ClarificationReply, Review

router = APIRouter(prefix='/api/threads', tags=['chat'])


@router.post('')
def create_thread():
    return {'thread_id': str(uuid4())}


@router.get('/{thread_id}')
def get_thread(thread_id: UUID, conversations: ConversationsDep):
    return conversations.get_thread(thread_id)


@router.post('/{thread_id}/messages')
def ask(thread_id: UUID, body: Question, conversations: ConversationsDep):
    return conversations.ask(thread_id, body)


@router.post('/{thread_id}/clarify')
def clarify(thread_id: UUID, body: ClarificationReply, conversations: ConversationsDep):
    return conversations.clarify(thread_id, body)


@router.post('/{thread_id}/review')
def review(thread_id: UUID, body: Review, conversations: ConversationsDep):
    return conversations.review(thread_id, body)
```

`backend/app/api/routes/documents.py` — replace the `Annotated`/`Depends`/`get_services` imports and the `Services = ...` alias with `from ..dependencies import ServicesDep`, and annotate each `services` parameter as `services: ServicesDep` (bodies unchanged).

`backend/app/api/routes/search.py`:

```python
from fastapi import APIRouter
from ..dependencies import ServicesDep
from ...models.requests import SearchRequest
from ...models.responses import SearchResponse

router = APIRouter(tags=['search'])


@router.post('/search', response_model=SearchResponse)
def search(body: SearchRequest, services: ServicesDep):
    return services.search.search(body.query, body.top_k, body.filters)
```

- [ ] **Step 4: System routes** — `backend/app/api/routes/system.py`:

```python
"""Health and library-overview endpoints used by the frontend."""
from fastapi import APIRouter

from ...core.config import settings
from ..dependencies import ServicesDep

router = APIRouter(tags=['system'])


@router.get('/api/health')
@router.get('/health')
def health():
    return {'status': 'ok', 'groq_configured': bool(settings.groq_api_key),
            'model': settings.groq_model, 'embedding_model': settings.embedding_model,
            'index_backend': 'qdrant', 'reranker_model': settings.reranker_model}


@router.get('/api/documents')
def documents(services: ServicesDep):
    return {**services.ingestion.report(), 'inventory': services.ingestion.inventory()}
```

- [ ] **Step 5: Configurable CORS** — `backend/app/core/config.py`, add after `upload_max_bytes`:

```python
    cors_origins: str = 'http://localhost:5173,http://127.0.0.1:5173'
```

and after `office_executable`:

```python
    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(',') if origin.strip()]
```

`backend/.env.example`, append:

```text
# Comma-separated browser origins allowed to call the API directly (match VITE_DEV_PORT in frontend/.env).
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

- [ ] **Step 6: Slim `main.py`** — replace from the router imports to end of file:

```python
from .api.routes import chat as chat_routes, documents as document_routes
from .api.routes import search as search_routes, system as system_routes
...
app = FastAPI(title='ISO Knowledge Assistant', lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origin_list,
                   allow_methods=['GET', 'POST', 'DELETE'], allow_headers=['Content-Type'])
app.include_router(system_routes.router)
app.include_router(chat_routes.router)
app.include_router(document_routes.router)
app.include_router(search_routes.router)
# Document and search routes are also served under /api for the frontend proxy.
app.include_router(document_routes.router, prefix='/api')
app.include_router(search_routes.router, prefix='/api')


@app.exception_handler(PipelineError)
async def pipeline_error(request, exc):
    return JSONResponse(status_code=exc.status_code, content={'detail': str(exc)})
```

(`index = DocumentIndex(settings)` and `lifespan` stay — the graph and tests use `main.index`.)

- [ ] **Step 7: Single-lock ingestion methods** — in `backend/app/services/ingestion_service.py`:
  - delete `def ingest_file(...)` wrapper and rename `_ingest_file` → `ingest_file` (it already holds `with self.lock:`);
  - delete `def ingest_folder(...)` wrapper and rename `_ingest_folder` → `ingest_folder`;
  - merge `upload`/`_upload` into one method whose body is wrapped in `with self.lock:`:

```python
    def upload(self, stream, filename, force=False):
        with self.lock:
            safe_name = Path(filename.replace('\\', '/')).name
            ...  # former _upload body, unchanged, indented one level
            return self.ingest_file(target, force, source=f'uploads/{safe_name}')
```

Run: `grep -n "_ingest_file\|_ingest_folder\|_upload" app/ tests/ -r` → no output.

- [ ] **Step 8: Run full suite**

Run: `cd backend && .venv/bin/python -m pytest -q -p no:cacheprovider`
Expected: `66 passed, 4 skipped`

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "refactor(backend): typed dependencies, system routes, single-lock ingestion, configurable CORS"
```

---

### Task 3: Frontend tooling and API layer

**Files:**
- Modify: `frontend/package.json`, `frontend/tsconfig.json`, `frontend/vite.config.ts`, `frontend/index.html`
- Create: `frontend/tsconfig.app.json`, `frontend/tsconfig.node.json`, `frontend/eslint.config.js`, `frontend/.env.example`, `frontend/src/test/setup.ts`, `frontend/src/api/types.ts`, `frontend/src/api/client.ts`, `frontend/src/api/client.test.ts`, `frontend/src/api/endpoints.ts`

**Interfaces:**
- Produces: `request<T>(path, { body?, signal? })`, `ApiError { status: number }`, `isAbortError(e)`, `errorMessage(e)`, `UNREACHABLE_MESSAGE`, `BACKEND_ERROR_MESSAGE`; `api.{health, library, createThread, getThread, ask, clarify}`; types `MetadataValue, Source, ThreadMessage, ClarificationExchange, Thread, LibraryFile, LibraryReport, Health`.

- [ ] **Step 1: Dev dependencies and scripts**

```bash
cd frontend
npm install -D eslint@^9 @eslint/js@^9 typescript-eslint@^8 eslint-plugin-react-hooks@^5 \
  eslint-plugin-react-refresh@^0.4 globals@^15 vitest@^3 jsdom@^26 @testing-library/react@^16 \
  @testing-library/dom@^10 @testing-library/jest-dom@^6 @testing-library/user-event@^14 @types/node@^22
```

`package.json` `scripts`:

```json
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "typecheck": "tsc -b",
    "lint": "eslint .",
    "test": "vitest run",
    "test:watch": "vitest"
  },
```

- [ ] **Step 2: TypeScript project files**

`tsconfig.json`:

```json
{
  "files": [],
  "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.node.json" }]
}
```

`tsconfig.app.json`:

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "ES2022",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "moduleDetection": "force",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vite/client"]
  },
  "include": ["src"]
}
```

`tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "moduleDetection": "force",
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true,
    "strict": true,
    "types": ["node"]
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 3: Vite, ESLint, env, HTML, test setup**

`vite.config.ts`:

```ts
/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const port = Number(env.VITE_DEV_PORT || 5173);
  const proxy = { '/api': env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8000' };
  return {
    plugins: [react()],
    // strictPort: a silently shifted port would no longer match the backend CORS_ORIGINS.
    server: { host: '127.0.0.1', port, strictPort: true, proxy },
    preview: { host: '127.0.0.1', port, proxy },
    test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'] },
  };
});
```

`eslint.config.js`:

```js
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
);
```

`.env.example`:

```text
# Backend URL that the Vite dev server proxies /api requests to.
VITE_API_PROXY_TARGET=http://127.0.0.1:8000
# Vite dev server port. If you change it, add the new origin to CORS_ORIGINS in backend/.env.
VITE_DEV_PORT=5173
```

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light dark" />
    <meta name="theme-color" content="#f3f5ee" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#141c17" media="(prefers-color-scheme: dark)" />
    <title>ISO · Knowledge workspace</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@500;600;700;800&display=swap"
    />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());

// jsdom does not implement layout or media queries.
Element.prototype.scrollIntoView = function scrollIntoView() {};
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
```

- [ ] **Step 4: Write the failing client tests** — `src/api/client.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, BACKEND_ERROR_MESSAGE, UNREACHABLE_MESSAGE, isAbortError, request } from './client';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function mockFetch(implementation: () => Promise<Response>) {
  const fetchMock = vi.fn(implementation);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('request', () => {
  it('GETs JSON under the /api prefix', async () => {
    const fetchMock = mockFetch(async () => json({ ok: true }));
    await expect(request('/health')).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith('/api/health', { signal: undefined });
  });

  it('POSTs a JSON body', async () => {
    const fetchMock = mockFetch(async () => json({ thread_id: 't' }));
    await request('/threads', { body: { a: 1 } });
    expect(fetchMock).toHaveBeenCalledWith('/api/threads', {
      method: 'POST',
      signal: undefined,
      headers: { 'Content-Type': 'application/json' },
      body: '{"a":1}',
    });
  });

  it('uses a FastAPI string detail as the message', async () => {
    mockFetch(async () => json({ detail: 'Conversation not found' }, 404));
    const error = await request('/threads/x').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, message: 'Conversation not found' });
  });

  it('uses the first validation message for 422 responses', async () => {
    mockFetch(async () => json({ detail: [{ msg: 'Value error, Question cannot be blank' }] }, 422));
    await expect(request('/x', { body: {} })).rejects.toMatchObject({
      status: 422,
      message: 'Value error, Question cannot be blank',
    });
  });

  it('explains non-JSON server failures such as a dev-proxy error', async () => {
    mockFetch(async () => new Response('', { status: 500 }));
    await expect(request('/documents')).rejects.toMatchObject({ status: 500, message: BACKEND_ERROR_MESSAGE });
  });

  it('reports network failures as an unreachable backend', async () => {
    mockFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(request('/health')).rejects.toMatchObject({ status: 0, message: UNREACHABLE_MESSAGE });
  });

  it('rethrows aborts untouched', async () => {
    const abort = new DOMException('Aborted', 'AbortError');
    mockFetch(async () => {
      throw abort;
    });
    const error = await request('/health').catch((caught: unknown) => caught);
    expect(error).toBe(abort);
    expect(isAbortError(error)).toBe(true);
  });
});
```

- [ ] **Step 5: Run to verify failure**

Run: `cd frontend && npx vitest run src/api`
Expected: FAIL — `Failed to resolve import "./client"`.

- [ ] **Step 6: Implement** — `src/api/types.ts`:

```ts
export type MetadataValue = string | number | boolean | null | string[] | number[];

export interface Source {
  text: string;
  score: number;
  vector_score?: number;
  citation: number;
  metadata: Record<string, MetadataValue>;
}

export interface ThreadMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ClarificationExchange {
  question: string;
  answer: string;
}

export interface Thread {
  thread_id: string;
  category: string;
  pending_clarification: boolean;
  clarification_question: string;
  clarification_history: ClarificationExchange[];
  messages: ThreadMessage[];
  question: string;
  answer: string;
  sources: Source[];
}

export interface LibraryFile {
  source: string;
  file_type: string;
  size_bytes?: number;
  supported?: boolean;
  document_id?: string;
  document_name?: string;
  status?: 'indexed' | 'error';
  chunks?: number;
  error?: string;
}

export interface LibraryReport {
  files: LibraryFile[];
  inventory: LibraryFile[];
  chunks: number;
  indexed_at: string | null;
}

export interface Health {
  status: string;
  groq_configured: boolean;
  model: string;
  embedding_model: string;
  reranker_model: string;
}
```

`src/api/client.ts`:

```ts
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export const UNREACHABLE_MESSAGE = 'Cannot reach the backend. Check that the API server is running.';
export const BACKEND_ERROR_MESSAGE =
  'The backend did not respond correctly. Check that it is running and review its logs.';

const API_PREFIX = '/api';

interface RequestOptions {
  body?: unknown;
  signal?: AbortSignal;
}

/** The only place the app talks to the backend. POSTs when a body is given. */
export async function request<T>(path: string, { body, signal }: RequestOptions = {}): Promise<T> {
  const init: RequestInit =
    body === undefined
      ? { signal }
      : { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  let response: Response;
  try {
    response = await fetch(`${API_PREFIX}${path}`, init);
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new ApiError(UNREACHABLE_MESSAGE, 0);
  }
  if (!response.ok) {
    const data: unknown = await response.json().catch(() => null);
    const fallback = response.status >= 500 ? BACKEND_ERROR_MESSAGE : `Request failed (${response.status}).`;
    throw new ApiError(detailMessage(data) ?? fallback, response.status);
  }
  return (await response.json()) as T;
}

function detailMessage(data: unknown): string | null {
  if (typeof data !== 'object' || data === null || !('detail' in data)) return null;
  const { detail } = data;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const first: unknown = detail[0];
    if (typeof first === 'object' && first !== null && 'msg' in first && typeof first.msg === 'string') {
      return first.msg;
    }
  }
  return null;
}

export function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError';
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}
```

`src/api/endpoints.ts`:

```ts
import { request } from './client';
import type { Health, LibraryReport, Thread } from './types';

const threadPath = (id: string) => `/threads/${encodeURIComponent(id)}`;

export const api = {
  health: (signal?: AbortSignal) => request<Health>('/health', { signal }),
  library: (signal?: AbortSignal) => request<LibraryReport>('/documents', { signal }),
  createThread: () => request<{ thread_id: string }>('/threads', { body: {} }),
  getThread: (id: string) => request<Thread>(threadPath(id)),
  ask: (id: string, question: string, category: string) =>
    request<Thread>(`${threadPath(id)}/messages`, { body: { question, category } }),
  clarify: (id: string, answer: string) => request<Thread>(`${threadPath(id)}/clarify`, { body: { answer } }),
};
```

- [ ] **Step 7: Verify**

Run: `npx vitest run src/api && npm run typecheck && npm run lint`
Expected: 7 tests pass; typecheck clean; lint clean or only warnings in the old `src/App.tsx` (deleted in Task 10).

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "build(frontend): add lint/test tooling, env-driven Vite config, typed API client"
```

---

### Task 4: Pure helpers (citations, files, source labels, storage, motion, cx)

**Files:**
- Create: `src/lib/citations.ts`, `src/lib/citations.test.ts`, `src/lib/storage.ts`, `src/lib/storage.test.ts`, `src/lib/motion.ts`, `src/lib/cx.ts`, `src/features/library/files.ts`, `src/features/library/files.test.ts`, `src/features/chat/sourceLabel.ts`, `src/features/chat/sourceLabel.test.ts`

**Interfaces:**
- Produces:
  - `linkCitations(markdown: string, available: ReadonlySet<number>): string`, `citationFromHref(href?: string): number | null`, `sourceElementId(citation: number): string`
  - `storage.get(key): string | null`, `storage.set(key, value): void`, `storage.remove(key): void`
  - `scrollBehavior(): ScrollBehavior`, `cx(...classes): string`
  - `FileStatus = 'indexed' | 'error' | 'pending'`, `StatusFilter = 'all' | FileStatus`, `FileGroup { category; files }`, `mergeFiles(report | null)`, `categoryOf(source)`, `fileName(source)`, `fileStatus(file)`, `listCategories(files)`, `filterFiles(files, status, query)`, `groupByCategory(files): FileGroup[]`, `countByStatus(files): Record<FileStatus, number>`, `GENERAL_CATEGORY = 'General'`
  - `sourceTitle(source)`, `sourceLocation(source)`, `formatMetadataValue(value)`

- [ ] **Step 1: Write failing tests**

`src/lib/citations.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { citationFromHref, linkCitations, sourceElementId } from './citations';

describe('linkCitations', () => {
  const available = new Set([1, 2, 3]);

  it('links adjacent citations in the backend-normalised form', () => {
    expect(linkCitations('Yes [1][2].', available)).toBe('Yes [\\[1\\]](#source-1)[\\[2\\]](#source-2).');
  });

  it('leaves numbers without a retrieved source untouched', () => {
    expect(linkCitations('See [9].', available)).toBe('See [9].');
  });

  it('never rewrites inline or fenced code', () => {
    const text = 'Use `arr[1]` and\n```\nx[2]\n```\n[3]';
    expect(linkCitations(text, available)).toBe('Use `arr[1]` and\n```\nx[2]\n```\n[\\[3\\]](#source-3)');
  });

  it('leaves existing links and reference definitions untouched', () => {
    expect(linkCitations('[1](https://a.b) [2]: https://c.d', available)).toBe('[1](https://a.b) [2]: https://c.d');
  });
});

describe('citationFromHref', () => {
  it('parses citation anchors only', () => {
    expect(citationFromHref('#source-4')).toBe(4);
    expect(citationFromHref('#source-0')).toBeNull();
    expect(citationFromHref('#source-x')).toBeNull();
    expect(citationFromHref('https://example.com')).toBeNull();
    expect(citationFromHref(undefined)).toBeNull();
  });

  it('matches the source element id', () => {
    expect(`#${sourceElementId(4)}`).toBe('#source-4');
  });
});
```

`src/lib/storage.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { storage } from './storage';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('storage', () => {
  it('round-trips values', () => {
    storage.set('k', 'v');
    expect(storage.get('k')).toBe('v');
    storage.remove('k');
    expect(storage.get('k')).toBeNull();
  });

  it('degrades silently when storage is blocked', () => {
    const denied = () => {
      throw new DOMException('denied', 'SecurityError');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(denied);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(denied);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(denied);
    expect(storage.get('k')).toBeNull();
    expect(() => storage.set('k', 'v')).not.toThrow();
    expect(() => storage.remove('k')).not.toThrow();
  });
});
```

`src/features/library/files.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { LibraryFile, LibraryReport } from '../../api/types';
import {
  categoryOf,
  countByStatus,
  fileName,
  fileStatus,
  filterFiles,
  groupByCategory,
  listCategories,
  mergeFiles,
} from './files';

const indexed: LibraryFile = { source: 'Purchasing/OP-01.docx', file_type: '.docx', status: 'indexed', chunks: 4 };
const failed: LibraryFile = { source: 'Purchasing/Flow.vsd', file_type: '.vsd', status: 'error', error: 'No LibreOffice' };
const pending: LibraryFile = { source: 'Manual.pdf', file_type: '.pdf' };

describe('mergeFiles', () => {
  it('overlays ingestion results on the inventory and sorts by source', () => {
    const report: LibraryReport = {
      inventory: [{ source: 'Purchasing/OP-01.docx', file_type: '.docx', size_bytes: 10 }, pending],
      files: [indexed],
      chunks: 4,
      indexed_at: null,
    };
    expect(mergeFiles(report)).toEqual([pending, { ...indexed, size_bytes: 10 }]);
  });

  it('returns an empty list before the report loads', () => {
    expect(mergeFiles(null)).toEqual([]);
  });
});

describe('file helpers', () => {
  it('derives category, name, and status', () => {
    expect(categoryOf('Purchasing/OP-01.docx')).toBe('Purchasing');
    expect(categoryOf('Manual.pdf')).toBe('General');
    expect(fileName('a/b/c.pdf')).toBe('c.pdf');
    expect([indexed, failed, pending].map(fileStatus)).toEqual(['indexed', 'error', 'pending']);
  });

  it('lists categories alphabetically without duplicates', () => {
    expect(listCategories([indexed, pending, failed])).toEqual(['General', 'Purchasing']);
  });

  it('filters by status and case-insensitive search', () => {
    const files = [indexed, failed, pending];
    expect(filterFiles(files, 'error', '')).toEqual([failed]);
    expect(filterFiles(files, 'all', 'MANUAL')).toEqual([pending]);
    expect(filterFiles(files, 'indexed', 'manual')).toEqual([]);
  });

  it('groups by category in alphabetical order', () => {
    expect(groupByCategory([indexed, pending, failed])).toEqual([
      { category: 'General', files: [pending] },
      { category: 'Purchasing', files: [indexed, failed] },
    ]);
  });

  it('counts files per status', () => {
    expect(countByStatus([indexed, failed, pending, pending])).toEqual({ indexed: 1, error: 1, pending: 2 });
  });
});
```

`src/features/chat/sourceLabel.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { MetadataValue, Source } from '../../api/types';
import { formatMetadataValue, sourceLocation, sourceTitle } from './sourceLabel';

const source = (metadata: Record<string, MetadataValue>): Source => ({ text: '', score: 1, citation: 1, metadata });

describe('sourceTitle', () => {
  it('prefers document name, then filename, then source', () => {
    expect(sourceTitle(source({ document_name: 'OP-01.docx', source: 'x' }))).toBe('OP-01.docx');
    expect(sourceTitle(source({ document_name: null, source: 'Purchasing/x.pdf' }))).toBe('Purchasing/x.pdf');
    expect(sourceTitle(source({}))).toBe('Document');
  });
});

describe('sourceLocation', () => {
  it('describes page, slide, sheet, or category plus the chunk', () => {
    expect(sourceLocation(source({ page: 3, page_number: 9, chunk_index: 0 }))).toBe('Page 3 · Chunk 0');
    expect(sourceLocation(source({ page: null, page_number: 2 }))).toBe('Page 2');
    expect(sourceLocation(source({ slide: 4, chunk_index: 2 }))).toBe('Slide 4 · Chunk 2');
    expect(sourceLocation(source({ sheet: 'Risks' }))).toBe('Sheet: Risks');
    expect(sourceLocation(source({ category: 'Purchasing' }))).toBe('Purchasing');
    expect(sourceLocation(source({}))).toBe('');
  });
});

describe('formatMetadataValue', () => {
  it('formats lists and empty values', () => {
    expect(formatMetadataValue([1, 2])).toBe('1, 2');
    expect(formatMetadataValue([])).toBe('—');
    expect(formatMetadataValue(null)).toBe('—');
    expect(formatMetadataValue(false)).toBe('false');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib src/features`
Expected: FAIL — unresolved imports.

- [ ] **Step 3: Implement**

`src/lib/citations.ts`:

```ts
const CITATION_HREF_PREFIX = '#source-';
// [n] not followed by "(" (already a link) or ":" (a reference definition).
const CITATION_PATTERN = /\[(\d{1,3})\](?![(:])/g;
// Odd entries after splitting are inline code spans or fenced blocks.
const CODE_PATTERN = /(```[\s\S]*?```|`[^`\n]*`)/;

export const sourceElementId = (citation: number) => `source-${citation}`;

/** Rewrite [n] citations that have a retrieved source into in-page links. */
export function linkCitations(markdown: string, available: ReadonlySet<number>): string {
  return markdown
    .split(CODE_PATTERN)
    .map((part, index) =>
      index % 2 === 1
        ? part
        : part.replace(CITATION_PATTERN, (match, digits: string) =>
            available.has(Number(digits)) ? `[\\[${digits}\\]](${CITATION_HREF_PREFIX}${digits})` : match,
          ),
    )
    .join('');
}

export function citationFromHref(href: string | undefined): number | null {
  if (!href?.startsWith(CITATION_HREF_PREFIX)) return null;
  const citation = Number(href.slice(CITATION_HREF_PREFIX.length));
  return Number.isInteger(citation) && citation > 0 ? citation : null;
}
```

`src/lib/storage.ts`:

```ts
/** localStorage that never throws (private mode, blocked cookies, quota). */
export const storage = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // The conversation simply will not survive a reload.
    }
  },
  remove(key: string): void {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Nothing to clean up if storage is unavailable.
    }
  },
};
```

`src/lib/motion.ts`:

```ts
export function scrollBehavior(): ScrollBehavior {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}
```

`src/lib/cx.ts`:

```ts
export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
```

`src/features/library/files.ts`:

```ts
import type { LibraryFile, LibraryReport } from '../../api/types';

export type FileStatus = 'indexed' | 'error' | 'pending';
export type StatusFilter = 'all' | FileStatus;

export interface FileGroup {
  category: string;
  files: LibraryFile[];
}

/** Matches the backend's category for files at the library root. */
export const GENERAL_CATEGORY = 'General';

/** Inventory (files on disk) overlaid with ingestion results, sorted by path. */
export function mergeFiles(report: LibraryReport | null): LibraryFile[] {
  if (!report) return [];
  const bySource = new Map<string, LibraryFile>();
  for (const file of report.inventory) bySource.set(file.source, file);
  for (const file of report.files) bySource.set(file.source, { ...bySource.get(file.source), ...file });
  return [...bySource.values()].sort((a, b) => a.source.localeCompare(b.source));
}

export function categoryOf(source: string): string {
  const slash = source.indexOf('/');
  return slash > 0 ? source.slice(0, slash) : GENERAL_CATEGORY;
}

export function fileName(source: string): string {
  return source.slice(source.lastIndexOf('/') + 1) || source;
}

export function fileStatus(file: LibraryFile): FileStatus {
  if (file.status === 'indexed') return 'indexed';
  if (file.status === 'error') return 'error';
  return 'pending';
}

export function listCategories(files: LibraryFile[]): string[] {
  return [...new Set(files.map((file) => categoryOf(file.source)))].sort((a, b) => a.localeCompare(b));
}

export function filterFiles(files: LibraryFile[], status: StatusFilter, query: string): LibraryFile[] {
  const needle = query.trim().toLowerCase();
  return files.filter(
    (file) =>
      (status === 'all' || fileStatus(file) === status) && (!needle || file.source.toLowerCase().includes(needle)),
  );
}

export function groupByCategory(files: LibraryFile[]): FileGroup[] {
  const groups = new Map<string, LibraryFile[]>();
  for (const file of files) {
    const category = categoryOf(file.source);
    const group = groups.get(category);
    if (group) group.push(file);
    else groups.set(category, [file]);
  }
  return [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, groupFiles]) => ({ category, files: groupFiles }));
}

export function countByStatus(files: LibraryFile[]): Record<FileStatus, number> {
  const counts: Record<FileStatus, number> = { indexed: 0, error: 0, pending: 0 };
  for (const file of files) counts[fileStatus(file)] += 1;
  return counts;
}
```

`src/features/chat/sourceLabel.ts`:

```ts
import type { MetadataValue, Source } from '../../api/types';

type Present = Exclude<MetadataValue, null>;

const present = (value: MetadataValue | undefined): value is Present =>
  value !== null && value !== undefined && value !== '';

export function sourceTitle({ metadata }: Source): string {
  const name = [metadata.document_name, metadata.filename, metadata.source].find(present);
  return name === undefined ? 'Document' : String(name);
}

export function sourceLocation({ metadata }: Source): string {
  const page = present(metadata.page) ? metadata.page : metadata.page_number;
  const parts: string[] = [];
  if (present(page)) parts.push(`Page ${String(page)}`);
  else if (present(metadata.slide)) parts.push(`Slide ${String(metadata.slide)}`);
  else if (present(metadata.sheet)) parts.push(`Sheet: ${String(metadata.sheet)}`);
  else if (present(metadata.category)) parts.push(String(metadata.category));
  if (present(metadata.chunk_index)) parts.push(`Chunk ${String(metadata.chunk_index)}`);
  return parts.join(' · ');
}

export function formatMetadataValue(value: MetadataValue | undefined): string {
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
  return present(value) ? String(value) : '—';
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib src/features && npm run typecheck`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(frontend): pure helpers for citations, library files, source labels, storage"
```

---

### Task 5: Design tokens, base styles, and shared presentational components

**Files:**
- Create: `src/styles/tokens.css`, `src/styles/base.css`, `src/components/{Notice,Spinner,Skeleton,Markdown}.tsx`, matching `.module.css`, `src/components/Markdown.test.tsx`

**Interfaces:**
- Consumes: `linkCitations`, `citationFromHref` (Task 4), `cx` (Task 4).
- Produces: `<Notice tone?="info"|"error" onDismiss?>`, `<Spinner size?>`, `<Skeleton lines? label>`, `<Markdown citations? onCitation?>{string}</Markdown>`. Global classes `.visually-hidden`, `.eyebrow`.

- [ ] **Step 1: Failing test** — `src/components/Markdown.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Markdown } from './Markdown';

describe('Markdown', () => {
  it('turns citations with a source into buttons and leaves others as text', async () => {
    const onCitation = vi.fn();
    render(
      <Markdown citations={new Set([1, 2])} onCitation={onCitation}>
        {'Evaluate suppliers [1][2] and see [7].'}
      </Markdown>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Show source 2' }));
    expect(onCitation).toHaveBeenCalledWith(2);
    expect(screen.queryByRole('button', { name: 'Show source 7' })).toBeNull();
    expect(screen.getByText(/\[7\]/)).toBeInTheDocument();
  });

  it('opens ordinary links in a new tab without opener access', () => {
    render(<Markdown>{'[ISO](https://www.iso.org)'}</Markdown>);
    const link = screen.getByRole('link', { name: 'ISO' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer noopener');
  });

  it('renders citations as plain text when no handler is given', () => {
    render(<Markdown citations={new Set([1])}>{'Answer [1].'}</Markdown>);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components`
Expected: FAIL — cannot resolve `./Markdown`.

- [ ] **Step 3: Tokens and base styles**

`src/styles/tokens.css`:

```css
:root {
  color-scheme: light;

  --font-sans: 'DM Sans', system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-display: 'Manrope', var(--font-sans);
  --font-mono: ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace;

  --text-2xs: 0.6875rem;
  --text-xs: 0.75rem;
  --text-sm: 0.8125rem;
  --text-base: 0.9375rem;
  --text-xl: 1.75rem;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;

  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --radius-pill: 999px;

  --color-bg: #fbfcf9;
  --color-surface: #ffffff;
  --color-surface-muted: #f3f6ef;
  --color-sidebar: #f3f5ee;
  --color-border: #e3e8dc;
  --color-border-strong: #d0dac4;
  --color-text: #263b34;
  --color-text-muted: #5c6956;
  --color-text-subtle: #6d7a64;
  --color-brand: #1f493a;
  --color-brand-hover: #2f6150;
  --color-on-brand: #eef5e2;
  --color-accent: #7fa361;
  --color-accent-soft: #e8efdf;
  --color-accent-text: #3d6a35;
  --color-nav-active: #e0e9d8;
  --color-hover: #edf2eb;
  --color-focus: #4f8a5b;
  --color-warning-bg: #f6f1dc;
  --color-warning-text: #6e5f22;
  --color-warning-border: #e7dfbf;
  --color-danger-bg: #fbefea;
  --color-danger-text: #96442f;
  --color-danger-border: #f0d8ce;
  --color-success-bg: #e5efdb;
  --color-success-text: #3a652b;

  --shadow-sm: 0 1px 2px rgb(31 57 35 / 0.06);
  --shadow-md: 0 6px 24px rgb(31 57 35 / 0.08);

  --sidebar-width: 272px;
  --header-height: 64px;
  --content-width: 760px;
  --transition-fast: 150ms ease;
}

@media (prefers-color-scheme: dark) {
  :root {
    color-scheme: dark;

    --color-bg: #111814;
    --color-surface: #172019;
    --color-surface-muted: #1c261f;
    --color-sidebar: #141c17;
    --color-border: #27332b;
    --color-border-strong: #364539;
    --color-text: #e3ebe2;
    --color-text-muted: #aebaab;
    --color-text-subtle: #929f8f;
    --color-brand: #9cc98a;
    --color-brand-hover: #b3d8a3;
    --color-on-brand: #10200f;
    --color-accent: #8fbf6f;
    --color-accent-soft: #213024;
    --color-accent-text: #aed69b;
    --color-nav-active: #22322a;
    --color-hover: #1f2a22;
    --color-focus: #9cc98a;
    --color-warning-bg: #2b2716;
    --color-warning-text: #e6d697;
    --color-warning-border: #433c1e;
    --color-danger-bg: #2e1c17;
    --color-danger-text: #f2ad99;
    --color-danger-border: #4a2a21;
    --color-success-bg: #1f2e1d;
    --color-success-text: #aed69b;

    --shadow-sm: 0 1px 2px rgb(0 0 0 / 0.35);
    --shadow-md: 0 6px 24px rgb(0 0 0 / 0.4);
  }
}
```

`src/styles/base.css`:

```css
*,
*::before,
*::after {
  box-sizing: border-box;
}

html {
  -webkit-text-size-adjust: 100%;
}

body {
  margin: 0;
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  line-height: 1.5;
  color: var(--color-text);
  background: var(--color-bg);
  font-synthesis: none;
  -webkit-font-smoothing: antialiased;
}

#root {
  height: 100dvh;
}

h1,
h2,
h3,
p {
  margin: 0;
}

button,
input,
select,
textarea {
  font: inherit;
  color: inherit;
}

button {
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

button:disabled {
  cursor: not-allowed;
}

:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

.eyebrow {
  font-size: var(--text-2xs);
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--color-accent-text);
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 4: Components**

`src/components/Notice.tsx`:

```tsx
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from '../lib/cx';
import styles from './Notice.module.css';

interface NoticeProps {
  tone?: 'info' | 'error';
  children: ReactNode;
  onDismiss?: () => void;
}

export function Notice({ tone = 'info', children, onDismiss }: NoticeProps) {
  return (
    <div className={cx(styles.notice, styles[tone])} role={tone === 'error' ? 'alert' : 'status'}>
      <span className={styles.message}>{children}</span>
      {onDismiss && (
        <button type="button" className={styles.dismiss} onClick={onDismiss} aria-label="Dismiss">
          <X size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
```

`src/components/Notice.module.css`:

```css
.notice {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  font-size: var(--text-sm);
  border: 1px solid;
  border-radius: var(--radius-md);
}

.info {
  color: var(--color-warning-text);
  background: var(--color-warning-bg);
  border-color: var(--color-warning-border);
}

.error {
  color: var(--color-danger-text);
  background: var(--color-danger-bg);
  border-color: var(--color-danger-border);
}

.message {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.dismiss {
  display: grid;
  place-items: center;
  padding: 2px;
  color: inherit;
  background: none;
  border: 0;
  border-radius: var(--radius-sm);
}

.dismiss:hover {
  background: color-mix(in srgb, currentColor 10%, transparent);
}
```

`src/components/Spinner.tsx`:

```tsx
import { LoaderCircle } from 'lucide-react';
import styles from './Spinner.module.css';

export function Spinner({ size = 16 }: { size?: number }) {
  return <LoaderCircle size={size} className={styles.spinner} aria-hidden="true" />;
}
```

`src/components/Spinner.module.css`:

```css
.spinner {
  flex-shrink: 0;
  animation: spin 1.2s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
```

`src/components/Skeleton.tsx`:

```tsx
import styles from './Skeleton.module.css';

export function Skeleton({ lines = 3, label }: { lines?: number; label: string }) {
  return (
    <div className={styles.skeleton} role="status" aria-label={label}>
      {Array.from({ length: lines }, (_, index) => (
        <span key={index} className={styles.line} />
      ))}
    </div>
  );
}
```

`src/components/Skeleton.module.css`:

```css
.skeleton {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-2) 0;
}

.line {
  height: 14px;
  border-radius: var(--radius-sm);
  background: linear-gradient(90deg, var(--color-surface-muted), var(--color-border), var(--color-surface-muted));
  background-size: 200% 100%;
  animation: shimmer 1.4s ease-in-out infinite;
}

.line:nth-child(3n + 2) {
  width: 82%;
}

.line:nth-child(3n) {
  width: 64%;
}

@keyframes shimmer {
  from {
    background-position: 200% 0;
  }
  to {
    background-position: -200% 0;
  }
}
```

`src/components/Markdown.tsx`:

```tsx
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { citationFromHref, linkCitations } from '../lib/citations';
import styles from './Markdown.module.css';

interface MarkdownProps {
  children: string;
  /** Citation numbers that have a retrieved source; only these become buttons. */
  citations?: ReadonlySet<number>;
  onCitation?: (citation: number) => void;
}

export function Markdown({ children, citations, onCitation }: MarkdownProps) {
  const linkable = Boolean(onCitation && citations?.size);
  const components: Components = {
    a({ href, children: label }) {
      const citation = linkable ? citationFromHref(href) : null;
      if (citation !== null && onCitation) {
        return (
          <button
            type="button"
            className={styles.citation}
            onClick={() => onCitation(citation)}
            aria-label={`Show source ${citation}`}
          >
            {citation}
          </button>
        );
      }
      return (
        <a href={href} target="_blank" rel="noreferrer noopener">
          {label}
        </a>
      );
    },
  };
  const text = linkable && citations ? linkCitations(children, citations) : children;
  return (
    <div className={styles.markdown}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
```

`src/components/Markdown.module.css`:

```css
.markdown {
  overflow-wrap: anywhere;
}

.markdown > :first-child {
  margin-top: 0;
}

.markdown > :last-child {
  margin-bottom: 0;
}

.markdown p,
.markdown ul,
.markdown ol,
.markdown blockquote,
.markdown pre {
  margin: 0.6em 0;
}

.markdown ul,
.markdown ol {
  padding-left: 1.4em;
}

.markdown li + li {
  margin-top: 0.25em;
}

.markdown h1,
.markdown h2,
.markdown h3,
.markdown h4 {
  margin: 1.1em 0 0.4em;
  font-family: var(--font-display);
  line-height: 1.3;
}

.markdown h1 {
  font-size: 1.3em;
}

.markdown h2 {
  font-size: 1.18em;
}

.markdown h3,
.markdown h4 {
  font-size: 1.05em;
}

.markdown a {
  color: var(--color-accent-text);
  text-underline-offset: 2px;
}

.markdown code {
  padding: 0.1em 0.35em;
  font-family: var(--font-mono);
  font-size: 0.88em;
  background: var(--color-surface-muted);
  border-radius: 4px;
}

.markdown pre {
  overflow-x: auto;
  padding: var(--space-3);
  background: var(--color-surface-muted);
  border-radius: var(--radius-sm);
}

.markdown pre code {
  padding: 0;
  background: none;
}

.markdown blockquote {
  padding-left: var(--space-3);
  color: var(--color-text-muted);
  border-left: 3px solid var(--color-border-strong);
}

.markdown table {
  display: block;
  max-width: 100%;
  margin: var(--space-3) 0;
  overflow-x: auto;
  font-size: 0.92em;
  border-collapse: collapse;
}

.markdown th,
.markdown td {
  min-width: 100px;
  padding: 6px 10px;
  text-align: left;
  vertical-align: top;
  border: 1px solid var(--color-border);
}

.markdown th {
  font-weight: 600;
  background: var(--color-surface-muted);
}

.citation {
  display: inline-grid;
  place-items: center;
  min-width: 1.6em;
  height: 1.6em;
  margin: 0 1px;
  padding: 0 0.35em;
  font-size: 0.72em;
  font-weight: 600;
  line-height: 1;
  vertical-align: 0.15em;
  color: var(--color-accent-text);
  background: var(--color-accent-soft);
  border: 1px solid var(--color-border-strong);
  border-radius: 5px;
  transition: background var(--transition-fast);
}

.citation:hover {
  background: var(--color-nav-active);
}
```

- [ ] **Step 5: Verify**

Run: `npx vitest run src/components && npm run typecheck`
Expected: 3 tests pass.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(frontend): design tokens with dark mode and shared presentational components"
```

---

### Task 6: Data hooks (conversation, library, health)

**Files:**
- Create: `src/features/chat/useConversation.ts`, `src/features/chat/useConversation.test.ts`, `src/features/library/useLibrary.ts`, `src/features/library/useLibrary.test.ts`, `src/hooks/useHealth.ts`

**Interfaces:**
- Consumes: `api`, `ApiError`, `errorMessage`, `isAbortError` (Task 3); `storage` (Task 4); `mergeFiles`, `listCategories`, `countByStatus` (Task 4).
- Produces:
  - `THREAD_STORAGE_KEY = 'iso-thread'`, `emptyThread(): Thread`, `useConversation()` → `Conversation = { thread, category, setCategory, draft, setDraft, restoring, busy, pendingMessage, error, dismissError, send(text?: string): Promise<void>, reset(): void }`
  - `POLL_INTERVAL_MS = 30_000`, `LibraryStatus = 'loading' | 'ready' | 'unavailable'`, `useLibrary({ paused })` → `{ files, categories, indexedCount, chunkCount, indexedAt, status, online: boolean | null, error, dismissError }`
  - `useHealth(): Health | null`

- [ ] **Step 1: Failing tests** — `src/features/chat/useConversation.test.ts`:

```ts
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import { api } from '../../api/endpoints';
import type { Thread } from '../../api/types';
import { THREAD_STORAGE_KEY, emptyThread, useConversation } from './useConversation';

vi.mock('../../api/endpoints', () => ({
  api: { createThread: vi.fn(), getThread: vi.fn(), ask: vi.fn(), clarify: vi.fn() },
}));
const mocked = vi.mocked(api);

const answered = (overrides: Partial<Thread> = {}): Thread => ({
  ...emptyThread(),
  thread_id: 't1',
  messages: [
    { role: 'user', content: 'Q' },
    { role: 'assistant', content: 'A [1]' },
  ],
  ...overrides,
});

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
});

describe('useConversation', () => {
  it('creates a thread on first send, asks with the category, and clears the draft', async () => {
    mocked.createThread.mockResolvedValue({ thread_id: 't1' });
    mocked.ask.mockResolvedValue(answered());
    const { result } = renderHook(() => useConversation());
    act(() => {
      result.current.setCategory('Purchasing');
      result.current.setDraft('  Q  ');
    });
    await act(() => result.current.send());
    expect(mocked.ask).toHaveBeenCalledWith('t1', 'Q', 'Purchasing');
    expect(localStorage.getItem(THREAD_STORAGE_KEY)).toBe('t1');
    expect(result.current.thread.messages).toHaveLength(2);
    expect(result.current.draft).toBe('');
    expect(result.current.busy).toBe(false);
  });

  it('sends the reply to /clarify while a clarification is pending', async () => {
    localStorage.setItem(THREAD_STORAGE_KEY, 't1');
    mocked.getThread.mockResolvedValue(answered({ pending_clarification: true, category: 'Purchasing' }));
    mocked.clarify.mockResolvedValue(answered());
    const { result } = renderHook(() => useConversation());
    await waitFor(() => expect(result.current.restoring).toBe(false));
    expect(result.current.category).toBe('Purchasing');
    await act(() => result.current.send('Supplier control'));
    expect(mocked.clarify).toHaveBeenCalledWith('t1', 'Supplier control');
    expect(mocked.ask).not.toHaveBeenCalled();
  });

  it('forgets a stored thread the backend no longer knows', async () => {
    localStorage.setItem(THREAD_STORAGE_KEY, 'gone');
    mocked.getThread.mockRejectedValue(new ApiError('Conversation not found', 404));
    const { result } = renderHook(() => useConversation());
    await waitFor(() => expect(result.current.restoring).toBe(false));
    expect(localStorage.getItem(THREAD_STORAGE_KEY)).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('keeps the stored thread and reports the error when the backend is unreachable', async () => {
    localStorage.setItem(THREAD_STORAGE_KEY, 't1');
    mocked.getThread.mockRejectedValue(new ApiError('Cannot reach the backend.', 0));
    const { result } = renderHook(() => useConversation());
    await waitFor(() => expect(result.current.restoring).toBe(false));
    expect(localStorage.getItem(THREAD_STORAGE_KEY)).toBe('t1');
    expect(result.current.thread.thread_id).toBe('t1');
    expect(result.current.error).toBe('Cannot reach the backend.');
  });

  it('keeps the draft when sending fails', async () => {
    mocked.createThread.mockResolvedValue({ thread_id: 't1' });
    mocked.ask.mockRejectedValue(new ApiError('Conversation processing failed.', 502));
    const { result } = renderHook(() => useConversation());
    act(() => result.current.setDraft('Q'));
    await act(() => result.current.send());
    expect(result.current.draft).toBe('Q');
    expect(result.current.error).toBe('Conversation processing failed.');
  });

  it('ignores blank messages', async () => {
    const { result } = renderHook(() => useConversation());
    await act(() => result.current.send('   '));
    expect(mocked.createThread).not.toHaveBeenCalled();
  });

  it('reset clears thread, category, draft, and the stored id', async () => {
    mocked.createThread.mockResolvedValue({ thread_id: 't1' });
    mocked.ask.mockResolvedValue(answered());
    const { result } = renderHook(() => useConversation());
    act(() => result.current.setCategory('Purchasing'));
    await act(() => result.current.send('Q'));
    act(() => result.current.reset());
    expect(result.current.thread).toEqual(emptyThread());
    expect(result.current.category).toBe('');
    expect(localStorage.getItem(THREAD_STORAGE_KEY)).toBeNull();
  });
});
```

`src/features/library/useLibrary.test.ts`:

```ts
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, UNREACHABLE_MESSAGE } from '../../api/client';
import { api } from '../../api/endpoints';
import type { LibraryReport } from '../../api/types';
import { POLL_INTERVAL_MS, useLibrary } from './useLibrary';

vi.mock('../../api/endpoints', () => ({ api: { library: vi.fn() } }));
const mocked = vi.mocked(api);

const report: LibraryReport = {
  inventory: [{ source: 'Purchasing/a.docx', file_type: '.docx' }, { source: 'b.pdf', file_type: '.pdf' }],
  files: [{ source: 'Purchasing/a.docx', file_type: '.docx', status: 'indexed', chunks: 3 }],
  chunks: 3,
  indexed_at: '2026-10-15T10:00:00Z',
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('useLibrary', () => {
  it('loads the report and derives files, categories, and counts', async () => {
    mocked.library.mockResolvedValue(report);
    const { result } = renderHook(() => useLibrary({ paused: false }));
    expect(result.current.status).toBe('loading');
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(result.current.status).toBe('ready');
    expect(result.current.files).toHaveLength(2);
    expect(result.current.categories).toEqual(['General', 'Purchasing']);
    expect(result.current.indexedCount).toBe(1);
    expect(result.current.chunkCount).toBe(3);
    expect(result.current.online).toBe(true);
  });

  it('keeps the last snapshot when polling fails and reports the failure once', async () => {
    mocked.library.mockResolvedValueOnce(report).mockRejectedValue(new ApiError(UNREACHABLE_MESSAGE, 0));
    const { result } = renderHook(() => useLibrary({ paused: false }));
    await act(() => vi.advanceTimersByTimeAsync(0));
    await act(() => vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS));
    expect(result.current.error).toBe(UNREACHABLE_MESSAGE);
    expect(result.current.online).toBe(false);
    act(() => result.current.dismissError());
    await act(() => vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS));
    expect(result.current.error).toBeNull();
    expect(result.current.files).toHaveLength(2);
    expect(result.current.status).toBe('ready');
  });

  it('reports unavailable when the first load fails', async () => {
    mocked.library.mockRejectedValue(new ApiError(UNREACHABLE_MESSAGE, 0));
    const { result } = renderHook(() => useLibrary({ paused: false }));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(result.current.status).toBe('unavailable');
  });

  it('does not poll while paused', async () => {
    mocked.library.mockResolvedValue(report);
    renderHook(() => useLibrary({ paused: true }));
    await act(() => vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2));
    expect(mocked.library).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/features/chat/useConversation.test.ts src/features/library/useLibrary.test.ts`
Expected: FAIL — unresolved modules.

- [ ] **Step 3: Implement** — `src/features/chat/useConversation.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, errorMessage } from '../../api/client';
import { api } from '../../api/endpoints';
import type { Thread } from '../../api/types';
import { storage } from '../../lib/storage';

export const THREAD_STORAGE_KEY = 'iso-thread';

export const emptyThread = (): Thread => ({
  thread_id: '',
  category: '',
  pending_clarification: false,
  clarification_question: '',
  clarification_history: [],
  messages: [],
  question: '',
  answer: '',
  sources: [],
});

/** Owns the active conversation: restore, ask/clarify, draft, and errors. */
export function useConversation() {
  const [thread, setThread] = useState<Thread>(emptyThread);
  const [category, setCategory] = useState('');
  const [draft, setDraft] = useState('');
  const [restoring, setRestoring] = useState(() => storage.get(THREAD_STORAGE_KEY) !== null);
  const [busy, setBusy] = useState(false);
  const [pendingMessage, setPendingMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    const storedId = storage.get(THREAD_STORAGE_KEY);
    if (!storedId) return;
    let active = true;
    api
      .getThread(storedId)
      .then((restored) => {
        if (!active) return;
        setThread(restored);
        setCategory(restored.category ?? '');
      })
      .catch((caught: unknown) => {
        if (!active) return;
        if (caught instanceof ApiError && (caught.status === 404 || caught.status === 422)) {
          storage.remove(THREAD_STORAGE_KEY);
        } else {
          setThread((current) => ({ ...current, thread_id: storedId }));
          setError(errorMessage(caught));
        }
      })
      .finally(() => {
        if (active) setRestoring(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const send = useCallback(
    async (text?: string) => {
      const message = (text ?? draft).trim();
      if (!message || inFlight.current || restoring) return;
      inFlight.current = true;
      setBusy(true);
      setError(null);
      setPendingMessage(message);
      try {
        let threadId = thread.thread_id;
        if (!threadId) {
          const created = (await api.createThread()).thread_id;
          storage.set(THREAD_STORAGE_KEY, created);
          setThread((current) => ({ ...current, thread_id: created }));
          threadId = created;
        }
        const result = thread.pending_clarification
          ? await api.clarify(threadId, message)
          : await api.ask(threadId, message, category);
        setThread(result);
        setDraft('');
      } catch (caught) {
        setError(errorMessage(caught));
      } finally {
        inFlight.current = false;
        setBusy(false);
        setPendingMessage('');
      }
    },
    [draft, restoring, thread.thread_id, thread.pending_clarification, category],
  );

  const reset = useCallback(() => {
    if (inFlight.current || restoring) return;
    storage.remove(THREAD_STORAGE_KEY);
    setThread(emptyThread());
    setCategory('');
    setDraft('');
    setError(null);
  }, [restoring]);

  const dismissError = useCallback(() => setError(null), []);

  return {
    thread,
    category,
    setCategory,
    draft,
    setDraft,
    restoring,
    busy,
    pendingMessage,
    error,
    dismissError,
    send,
    reset,
  };
}

export type Conversation = ReturnType<typeof useConversation>;
```

`src/features/library/useLibrary.ts`:

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { errorMessage, isAbortError } from '../../api/client';
import { api } from '../../api/endpoints';
import type { LibraryReport } from '../../api/types';
import { countByStatus, listCategories, mergeFiles } from './files';

export const POLL_INTERVAL_MS = 30_000;

export type LibraryStatus = 'loading' | 'ready' | 'unavailable';

/** Loads the library report and refreshes it periodically unless paused. */
export function useLibrary({ paused }: { paused: boolean }) {
  const [report, setReport] = useState<LibraryReport | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pausedRef = useRef(paused);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const controller = new AbortController();
    let failing = false;
    const load = async () => {
      try {
        const data = await api.library(controller.signal);
        failing = false;
        setReport(data);
        setOnline(true);
        setError(null);
      } catch (caught) {
        // Report a failure once per outage; keep the last good snapshot on screen.
        if (isAbortError(caught) || failing) return;
        failing = true;
        setOnline(false);
        setError(errorMessage(caught));
      }
    };
    void load();
    const timer = window.setInterval(() => {
      if (!pausedRef.current) void load();
    }, POLL_INTERVAL_MS);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, []);

  const files = useMemo(() => mergeFiles(report), [report]);
  const categories = useMemo(() => listCategories(files), [files]);
  const indexedCount = useMemo(() => countByStatus(files).indexed, [files]);
  const dismissError = useCallback(() => setError(null), []);
  const status: LibraryStatus = report ? 'ready' : online === false ? 'unavailable' : 'loading';

  return {
    files,
    categories,
    indexedCount,
    chunkCount: report?.chunks ?? 0,
    indexedAt: report?.indexed_at ?? null,
    status,
    online,
    error,
    dismissError,
  };
}
```

`src/hooks/useHealth.ts`:

```ts
import { useEffect, useState } from 'react';
import { api } from '../api/endpoints';
import type { Health } from '../api/types';

/** Backend configuration for the UI; connectivity errors are reported by library polling. */
export function useHealth(): Health | null {
  const [health, setHealth] = useState<Health | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    api
      .health(controller.signal)
      .then(setHealth)
      .catch(() => {});
    return () => controller.abort();
  }, []);
  return health;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/features src/hooks && npm run typecheck && npm run lint`
Expected: all pass; no new lint errors.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(frontend): conversation, library, and health hooks"
```

---

### Task 7: Application shell (Sidebar, Header, AppShell with mobile drawer)

**Files:**
- Create: `src/app/view.ts`, `src/app/AppShell.tsx`, `src/app/AppShell.module.css`, `src/app/AppShell.test.tsx`, `src/components/Header.tsx`, `src/components/Header.module.css`, `src/components/Sidebar.tsx`, `src/components/Sidebar.module.css`

**Interfaces:**
- Produces: `type View = 'chat' | 'library'`; `<AppShell title sidebar={(closeDrawer) => ReactNode}>children</AppShell>`; `<Header title menuOpen onMenuToggle menuButtonRef>`; `<Sidebar view onNavigate onNewChat newChatDisabled fileCount indexedCount chunkCount online>`.

- [ ] **Step 1: Failing test** — `src/app/AppShell.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { AppShell } from './AppShell';

function renderShell() {
  render(
    <AppShell
      title="Ask your documents"
      sidebar={(closeDrawer) => (
        <button type="button" onClick={closeDrawer}>
          Document library
        </button>
      )}
    >
      <p>content</p>
    </AppShell>,
  );
  return screen.getByRole('button', { name: 'Toggle navigation' });
}

describe('AppShell', () => {
  it('opens the drawer, focuses the sidebar, and closes on Escape returning focus', async () => {
    const user = userEvent.setup();
    const menu = renderShell();
    await user.click(menu);
    expect(menu).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Document library' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(menu).toHaveAttribute('aria-expanded', 'false');
    expect(menu).toHaveFocus();
  });

  it('lets the sidebar close the drawer after navigation', async () => {
    const user = userEvent.setup();
    const menu = renderShell();
    await user.click(menu);
    await user.click(screen.getByRole('button', { name: 'Document library' }));
    expect(menu).toHaveAttribute('aria-expanded', 'false');
  });

  it('exposes landmarks and a skip link', () => {
    renderShell();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main-content');
    expect(screen.getByRole('complementary', { name: 'Sidebar' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/app`
Expected: FAIL — cannot resolve `./AppShell`.

- [ ] **Step 3: Implement**

`src/app/view.ts`:

```ts
export type View = 'chat' | 'library';
```

`src/components/Header.tsx`:

```tsx
import { ChevronRight, Menu, ShieldCheck } from 'lucide-react';
import type { Ref } from 'react';
import styles from './Header.module.css';

interface HeaderProps {
  title: string;
  menuOpen: boolean;
  onMenuToggle: () => void;
  menuButtonRef: Ref<HTMLButtonElement>;
}

export function Header({ title, menuOpen, onMenuToggle, menuButtonRef }: HeaderProps) {
  return (
    <header className={styles.header}>
      <button
        ref={menuButtonRef}
        type="button"
        className={styles.menu}
        onClick={onMenuToggle}
        aria-label="Toggle navigation"
        aria-expanded={menuOpen}
        aria-controls="app-sidebar"
      >
        <Menu size={20} aria-hidden="true" />
      </button>
      <div className={styles.crumbs}>
        <span className={styles.crumb}>Workspace</span>
        <ChevronRight size={13} className={styles.crumb} aria-hidden="true" />
        <span className={styles.title} aria-current="page">
          {title}
        </span>
      </div>
      <span className={styles.badge}>
        <ShieldCheck size={14} aria-hidden="true" /> Answers with sources
      </span>
    </header>
  );
}
```

`src/components/Header.module.css`:

```css
.header {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: var(--space-3);
  height: var(--header-height);
  padding: 0 var(--space-8);
  background: color-mix(in srgb, var(--color-bg) 85%, transparent);
  border-bottom: 1px solid var(--color-border);
}

.menu {
  display: none;
  place-items: center;
  width: 36px;
  height: 36px;
  padding: 0;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
}

.menu:hover {
  background: var(--color-hover);
}

.crumbs {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  font-size: var(--text-xs);
  color: var(--color-text-subtle);
}

.title {
  overflow: hidden;
  font-weight: 600;
  color: var(--color-text);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.badge {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  padding: 6px 12px;
  font-size: var(--text-2xs);
  color: var(--color-accent-text);
  background: var(--color-accent-soft);
  border-radius: var(--radius-pill);
}

@media (max-width: 900px) {
  .header {
    padding: 0 var(--space-4);
  }

  .menu {
    display: grid;
  }
}

@media (max-width: 560px) {
  .crumb,
  .badge {
    display: none;
  }
}
```

`src/components/Sidebar.tsx`:

```tsx
import { BookOpen, Database, Layers, MessageSquare, Plus, ShieldCheck } from 'lucide-react';
import type { View } from '../app/view';
import styles from './Sidebar.module.css';

interface SidebarProps {
  view: View;
  onNavigate: (view: View) => void;
  onNewChat: () => void;
  newChatDisabled: boolean;
  /** null while the library is still loading. */
  fileCount: number | null;
  indexedCount: number;
  chunkCount: number;
  /** null until the first library request settles. */
  online: boolean | null;
}

const CONNECTION_LABEL = {
  online: 'Backend connected',
  offline: 'Backend unreachable',
  unknown: 'Checking backend',
} as const;

export function Sidebar({
  view,
  onNavigate,
  onNewChat,
  newChatDisabled,
  fileCount,
  indexedCount,
  chunkCount,
  online,
}: SidebarProps) {
  const connection = online === null ? 'unknown' : online ? 'online' : 'offline';
  return (
    <div className={styles.sidebar}>
      <a className={styles.brand} href="/" aria-label="ISO knowledge workspace home">
        <span className={styles.brandIcon} aria-hidden="true">
          <Layers size={22} />
        </span>
        <span className={styles.brandText} aria-hidden="true">
          iso<span className={styles.brandDot}>.</span>
          <small>Knowledge workspace</small>
        </span>
      </a>

      <button type="button" className={styles.newChat} onClick={onNewChat} disabled={newChatDisabled}>
        <Plus size={16} aria-hidden="true" /> New conversation
      </button>

      <nav className={styles.nav} aria-labelledby="sidebar-nav-label">
        <p id="sidebar-nav-label" className={styles.navLabel}>
          Workspace
        </p>
        <button
          type="button"
          className={styles.navItem}
          aria-current={view === 'chat' ? 'page' : undefined}
          onClick={() => onNavigate('chat')}
        >
          <MessageSquare size={17} aria-hidden="true" /> Ask your documents
        </button>
        <button
          type="button"
          className={styles.navItem}
          aria-current={view === 'library' ? 'page' : undefined}
          onClick={() => onNavigate('library')}
        >
          <BookOpen size={17} aria-hidden="true" /> Document library
          <span className={styles.count}>{fileCount ?? '—'}</span>
        </button>
      </nav>

      <section className={styles.card} aria-labelledby="sidebar-card-title">
        <ShieldCheck size={19} className={styles.cardIcon} aria-hidden="true" />
        <h2 id="sidebar-card-title" className={styles.cardTitle}>
          Your documents. Clear answers.
        </h2>
        <p className={styles.cardText}>
          Ask naturally and get answers with sources. The assistant asks a follow-up when it needs more detail.
        </p>
      </section>

      <div className={styles.status}>
        <Database size={16} aria-hidden="true" />
        <div>
          Local knowledge base
          <small>
            {indexedCount} documents · {chunkCount} chunks
          </small>
        </div>
        <span
          className={styles.dot}
          data-state={connection}
          role="img"
          aria-label={CONNECTION_LABEL[connection]}
          title={CONNECTION_LABEL[connection]}
        />
      </div>
    </div>
  );
}
```

`src/components/Sidebar.module.css`:

```css
.sidebar {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  padding: var(--space-8) var(--space-5) var(--space-5);
}

.brand {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin: 0 var(--space-2) var(--space-10);
  font: 800 1.875rem/1 var(--font-display);
  letter-spacing: -0.05em;
  color: var(--color-text);
  text-decoration: none;
  border-radius: var(--radius-sm);
}

.brandIcon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  color: var(--color-on-brand);
  background: var(--color-brand);
  border-radius: 11px;
}

.brandDot {
  color: var(--color-accent);
}

.brandText small {
  display: block;
  margin-top: 6px;
  font: 600 0.5625rem/1.4 var(--font-sans);
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.newChat {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-3) var(--space-4);
  font-weight: 500;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  transition: background var(--transition-fast);
}

.newChat:hover:not(:disabled) {
  background: var(--color-hover);
}

.newChat:disabled {
  opacity: 0.55;
}

.nav {
  display: grid;
  gap: var(--space-1);
}

.navLabel {
  margin: var(--space-8) var(--space-3) var(--space-2);
  font-size: var(--text-2xs);
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-text-subtle);
}

.navItem {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  padding: 10px var(--space-3);
  text-align: left;
  color: var(--color-text-muted);
  background: none;
  border: 0;
  border-radius: var(--radius-sm);
  transition:
    background var(--transition-fast),
    color var(--transition-fast);
}

.navItem:hover {
  color: var(--color-text);
  background: var(--color-hover);
}

.navItem[aria-current='page'] {
  font-weight: 600;
  color: var(--color-accent-text);
  background: var(--color-nav-active);
}

.count {
  margin-left: auto;
  padding: 2px 7px;
  font-size: var(--text-2xs);
  background: var(--color-surface-muted);
  border-radius: var(--radius-sm);
}

.card {
  margin: auto 0 var(--space-6);
  padding: var(--space-5) var(--space-4);
  background: var(--color-accent-soft);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.cardIcon {
  color: var(--color-accent-text);
}

.cardTitle {
  margin: var(--space-3) 0 6px;
  font-size: var(--text-sm);
  font-weight: 600;
}

.cardText {
  font-size: var(--text-xs);
  line-height: 1.7;
  color: var(--color-text-muted);
}

.status {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-5) var(--space-1) 0;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  border-top: 1px solid var(--color-border);
}

.status small {
  display: block;
  margin-top: 2px;
  font-size: var(--text-2xs);
  color: var(--color-text-subtle);
}

.dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  margin-left: auto;
  background: var(--color-text-subtle);
  border-radius: 50%;
}

.dot[data-state='online'] {
  background: var(--color-accent);
}

.dot[data-state='offline'] {
  background: var(--color-danger-text);
}
```

`src/app/AppShell.tsx`:

```tsx
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Header } from '../components/Header';
import styles from './AppShell.module.css';

interface AppShellProps {
  title: string;
  /** Receives a callback that closes the mobile drawer (call it after navigating). */
  sidebar: (closeDrawer: () => void) => ReactNode;
  children: ReactNode;
}

const FOCUSABLE = 'a[href], button:not([disabled])';

export function AppShell({ title, sidebar, children }: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  useEffect(() => {
    if (!drawerOpen) return;
    sidebarRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setDrawerOpen(false);
      menuButton.current?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen]);

  return (
    <div className={styles.shell} data-drawer-open={drawerOpen || undefined}>
      <a className={styles.skipLink} href="#main-content">
        Skip to content
      </a>
      <aside id="app-sidebar" ref={sidebarRef} className={styles.sidebar} aria-label="Sidebar">
        {sidebar(closeDrawer)}
      </aside>
      {drawerOpen && <div className={styles.backdrop} onClick={closeDrawer} aria-hidden="true" />}
      <div className={styles.main}>
        <Header
          title={title}
          menuOpen={drawerOpen}
          onMenuToggle={() => setDrawerOpen((open) => !open)}
          menuButtonRef={menuButton}
        />
        <main id="main-content" className={styles.content} tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
```

`src/app/AppShell.module.css`:

```css
.shell {
  display: flex;
  height: 100dvh;
  overflow: hidden;
}

.skipLink {
  position: absolute;
  top: -100px;
  left: var(--space-4);
  z-index: 100;
  padding: var(--space-2) var(--space-4);
  color: var(--color-on-brand);
  background: var(--color-brand);
  border-radius: var(--radius-sm);
}

.skipLink:focus {
  top: var(--space-4);
}

.sidebar {
  flex-shrink: 0;
  width: var(--sidebar-width);
  overflow-y: auto;
  background: var(--color-sidebar);
  border-right: 1px solid var(--color-border);
}

.main {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.content {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  outline: none;
}

.backdrop {
  display: none;
}

@media (max-width: 900px) {
  .sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    z-index: 40;
    width: min(var(--sidebar-width), 85vw);
    visibility: hidden;
    box-shadow: var(--shadow-md);
    transform: translateX(-100%);
    transition:
      transform 200ms ease,
      visibility 0s linear 200ms;
  }

  .shell[data-drawer-open] .sidebar {
    visibility: visible;
    transform: none;
    transition: transform 200ms ease;
  }

  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 30;
    display: block;
    background: rgb(10 20 14 / 0.45);
  }
}
```

- [ ] **Step 4: Verify**

Run: `npx vitest run src/app && npm run typecheck && npm run lint`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(frontend): responsive app shell with accessible mobile drawer"
```

---

### Task 8: Chat feature

**Files:**
- Create: `src/features/chat/{ChatView,WelcomeScreen,MessageList,MessageItem,ClarificationCard,SourceList,SourceCard,Composer}.tsx`, matching `.module.css` (MessageList has none), `src/features/chat/useSourceFocus.ts`, `src/features/chat/Composer.test.tsx`, `src/features/chat/ChatView.test.tsx`

**Interfaces:**
- Consumes: `Conversation` (Task 6), `LibraryStatus` (Task 6), `Markdown`, `Skeleton`, `Spinner` (Task 5), `sourceElementId` (Task 4), `sourceTitle`, `sourceLocation`, `formatMetadataValue` (Task 4), `scrollBehavior`, `cx` (Task 4).
- Produces: `<ChatView conversation categories indexedCount libraryStatus modelLabel onOpenLibrary>`; `useSourceFocus(sources) → { isExpanded(c), toggle(c), reveal(c) }`; `<Composer value onChange onSubmit disabled placeholder categories category onCategoryChange categoryDisabled>`.

- [ ] **Step 1: Failing tests**

`src/features/chat/Composer.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Composer } from './Composer';

function Harness({ onSubmit, disabled = false }: { onSubmit: () => void; disabled?: boolean }) {
  const [value, setValue] = useState('');
  return (
    <Composer
      value={value}
      onChange={setValue}
      onSubmit={onSubmit}
      disabled={disabled}
      placeholder="Ask anything"
      categories={['Purchasing']}
      category=""
      onCategoryChange={() => {}}
      categoryDisabled={false}
    />
  );
}

describe('Composer', () => {
  it('sends on Enter and inserts a newline on Shift+Enter', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    const box = screen.getByRole('textbox', { name: 'Your question' });
    await user.type(box, 'Hello{Shift>}{Enter}{/Shift}there');
    expect(box).toHaveValue('Hello\nthere');
    expect(onSubmit).not.toHaveBeenCalled();
    await user.keyboard('{Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('does not send blank input', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    await user.type(screen.getByRole('textbox', { name: 'Your question' }), '   {Enter}');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Send question' })).toBeDisabled();
  });

  it('does not send while an IME composition is active', () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    const box = screen.getByRole('textbox', { name: 'Your question' });
    fireEvent.change(box, { target: { value: 'にほん' } });
    fireEvent.keyDown(box, { key: 'Enter', isComposing: true });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('offers the document categories', () => {
    render(<Harness onSubmit={vi.fn()} />);
    const select = screen.getByRole('combobox', { name: 'Document category' });
    expect(select).toHaveDisplayValue('All documents');
    expect(screen.getByRole('option', { name: 'Purchasing' })).toBeInTheDocument();
  });
});
```

`src/features/chat/ChatView.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Thread } from '../../api/types';
import { ChatView } from './ChatView';
import { emptyThread, type Conversation } from './useConversation';

function conversation(thread: Partial<Thread> = {}, overrides: Partial<Conversation> = {}): Conversation {
  return {
    thread: { ...emptyThread(), ...thread },
    category: '',
    setCategory: vi.fn(),
    draft: '',
    setDraft: vi.fn(),
    restoring: false,
    busy: false,
    pendingMessage: '',
    error: null,
    dismissError: vi.fn(),
    send: vi.fn(async () => {}),
    reset: vi.fn(),
    ...overrides,
  };
}

const answered: Partial<Thread> = {
  thread_id: 't1',
  messages: [
    { role: 'user', content: 'How are suppliers evaluated?' },
    { role: 'assistant', content: 'Annually [1].' },
  ],
  sources: [
    {
      text: 'Evaluate suppliers annually.',
      score: 4.2,
      citation: 1,
      metadata: { document_name: 'OP-07 Supplier evaluation.docx', page: 2, chunk_index: 0 },
    },
  ],
};

const renderChat = (value: Conversation) =>
  render(
    <ChatView
      conversation={value}
      categories={[]}
      indexedCount={3}
      libraryStatus="ready"
      modelLabel="model via Groq"
      onOpenLibrary={vi.fn()}
    />,
  );

describe('ChatView', () => {
  it('shows suggestions for a new conversation and sends the one picked', async () => {
    const value = conversation();
    renderChat(value);
    await userEvent.click(screen.getByRole('button', { name: /customer complaint/ }));
    expect(value.send).toHaveBeenCalledWith('How do we handle a customer complaint?');
  });

  it('expands the cited source when a citation is clicked', async () => {
    renderChat(conversation(answered));
    const source = screen.getByRole('button', { name: /OP-07 Supplier evaluation\.docx/ });
    expect(source).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(screen.getByRole('button', { name: 'Show source 1' }));
    expect(source).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Evaluate suppliers annually.')).toBeVisible();
  });

  it('shows the clarification request and adapts the composer', () => {
    renderChat(
      conversation({
        thread_id: 't1',
        pending_clarification: true,
        question: 'How is it controlled?',
        clarification_question: 'Which procedure do you mean?',
      }),
    );
    expect(screen.getByText('Which procedure do you mean?')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Your question' })).toHaveAttribute(
      'placeholder',
      'Reply to the clarification…',
    );
    expect(screen.getByRole('combobox', { name: 'Document category' })).toBeDisabled();
  });

  it('prompts to open the library when nothing is indexed', async () => {
    const onOpenLibrary = vi.fn();
    render(
      <ChatView
        conversation={conversation()}
        categories={[]}
        indexedCount={0}
        libraryStatus="ready"
        modelLabel="m"
        onOpenLibrary={onOpenLibrary}
      />,
    );
    expect(screen.getByText('Your document library has not been indexed yet.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Open library/ }));
    expect(onOpenLibrary).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/features/chat`
Expected: FAIL — cannot resolve `./Composer`, `./ChatView`.

- [ ] **Step 3: Implement**

`src/features/chat/useSourceFocus.ts`:

```ts
import { useCallback, useState } from 'react';
import type { Source } from '../../api/types';
import { sourceElementId } from '../../lib/citations';
import { scrollBehavior } from '../../lib/motion';

const NONE: ReadonlySet<number> = new Set();

/** Expanded state for the latest answer's sources; resets whenever a new answer arrives. */
export function useSourceFocus(sources: Source[]) {
  const [state, setState] = useState({ sources, open: NONE });
  const open = state.sources === sources ? state.open : NONE;

  const update = useCallback(
    (change: (current: Set<number>) => void) =>
      setState((previous) => {
        const next = new Set(previous.sources === sources ? previous.open : NONE);
        change(next);
        return { sources, open: next };
      }),
    [sources],
  );

  const isExpanded = useCallback((citation: number) => open.has(citation), [open]);

  const toggle = useCallback(
    (citation: number) =>
      update((next) => {
        if (next.has(citation)) next.delete(citation);
        else next.add(citation);
      }),
    [update],
  );

  const reveal = useCallback(
    (citation: number) => {
      update((next) => next.add(citation));
      requestAnimationFrame(() => {
        const element = document.getElementById(sourceElementId(citation));
        element?.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
        element?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
      });
    },
    [update],
  );

  return { isExpanded, toggle, reveal };
}
```

`src/features/chat/WelcomeScreen.tsx`:

```tsx
import { BookOpen, ChevronRight, ShieldCheck } from 'lucide-react';
import styles from './WelcomeScreen.module.css';

interface WelcomeScreenProps {
  suggestions: readonly string[];
  disabled: boolean;
  onPick: (suggestion: string) => void;
}

export function WelcomeScreen({ suggestions, disabled, onPick }: WelcomeScreenProps) {
  return (
    <section className={styles.welcome} aria-labelledby="welcome-title">
      <div className={styles.mark} aria-hidden="true">
        <BookOpen size={29} />
        <span className={styles.spark}>✦</span>
      </div>
      <p className="eyebrow">Clarity, backed by your documents</p>
      <h1 id="welcome-title" className={styles.title}>
        Your next answer is already in your files.
      </h1>
      <p className={styles.lead}>
        Explore your ISO 9001 knowledge base. Ask a question, check the sources, and make it yours.
      </p>
      <ul className={styles.suggestions}>
        {suggestions.map((suggestion, index) => (
          <li key={suggestion}>
            <button type="button" onClick={() => onPick(suggestion)} disabled={disabled}>
              <span className={styles.number} aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className={styles.text}>{suggestion}</span>
              <ChevronRight size={17} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <p className={styles.foot}>
        <ShieldCheck size={14} aria-hidden="true" /> Grounded in your documents
        <span aria-hidden="true">·</span> Ask follow-up questions
      </p>
    </section>
  );
}
```

`src/features/chat/WelcomeScreen.module.css`:

```css
.welcome {
  max-width: 640px;
  margin: clamp(var(--space-8), 9vh, 112px) auto var(--space-8);
  text-align: center;
}

.mark {
  position: relative;
  display: grid;
  place-items: center;
  width: 68px;
  height: 68px;
  margin: 0 auto var(--space-6);
  color: var(--color-accent-text);
  background: linear-gradient(140deg, var(--color-accent-soft), var(--color-nav-active));
  border: 1px solid var(--color-border);
  border-radius: 20px;
}

.spark {
  position: absolute;
  top: -2px;
  right: -8px;
  padding: 3px;
  font-size: 1.1rem;
  color: var(--color-accent);
  background: var(--color-bg);
}

.title {
  margin: var(--space-4) auto;
  max-width: 14em;
  font: 600 clamp(1.75rem, 4.5vw, 2.5rem)/1.2 var(--font-display);
  letter-spacing: -0.035em;
  text-wrap: balance;
}

.lead {
  max-width: 440px;
  margin: 0 auto;
  font-size: var(--text-base);
  line-height: 1.7;
  color: var(--color-text-muted);
  text-wrap: pretty;
}

.suggestions {
  display: grid;
  gap: var(--space-2);
  max-width: 500px;
  margin: var(--space-8) auto var(--space-6);
  padding: 0;
  list-style: none;
}

.suggestions button {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  padding: var(--space-3) var(--space-4);
  text-align: left;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  transition:
    background var(--transition-fast),
    border-color var(--transition-fast);
}

.suggestions button:hover:not(:disabled) {
  background: var(--color-hover);
  border-color: var(--color-border-strong);
}

.suggestions button:disabled {
  opacity: 0.55;
}

.suggestions svg {
  flex-shrink: 0;
  color: var(--color-text-subtle);
}

.number {
  font: 600 var(--text-2xs) var(--font-display);
  color: var(--color-accent-text);
}

.text {
  flex: 1;
}

.foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: var(--text-2xs);
  color: var(--color-text-subtle);
}
```

`src/features/chat/MessageItem.tsx`:

```tsx
import { Layers } from 'lucide-react';
import type { ThreadMessage } from '../../api/types';
import { Markdown } from '../../components/Markdown';
import { cx } from '../../lib/cx';
import styles from './MessageItem.module.css';

interface MessageItemProps {
  role: ThreadMessage['role'];
  content: string;
  citations?: ReadonlySet<number>;
  onCitation?: (citation: number) => void;
}

export function MessageItem({ role, content, citations, onCitation }: MessageItemProps) {
  const fromUser = role === 'user';
  return (
    <article className={cx(styles.message, fromUser && styles.user)}>
      <span className={styles.avatar} aria-hidden="true">
        {fromUser ? 'Y' : <Layers size={17} />}
      </span>
      <div className={styles.body}>
        <p className={styles.author}>{fromUser ? 'You' : 'ISO assistant'}</p>
        {fromUser ? (
          <p className={styles.userText}>{content}</p>
        ) : (
          <Markdown citations={citations} onCitation={onCitation}>
            {content}
          </Markdown>
        )}
      </div>
    </article>
  );
}
```

`src/features/chat/MessageItem.module.css`:

```css
.message {
  display: flex;
  gap: var(--space-3);
  font-size: var(--text-base);
  line-height: 1.7;
}

.avatar {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: 30px;
  height: 30px;
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-accent-text);
  background: var(--color-accent-soft);
  border-radius: 9px;
}

.user .avatar {
  color: var(--color-text-muted);
  background: var(--color-surface-muted);
}

.body {
  flex: 1;
  min-width: 0;
}

.author {
  margin-bottom: 2px;
  font-size: var(--text-xs);
  font-weight: 600;
  line-height: 30px;
  color: var(--color-text-muted);
}

.userText {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
```

`src/features/chat/MessageList.tsx`:

```tsx
import type { ThreadMessage } from '../../api/types';
import { MessageItem } from './MessageItem';

interface MessageListProps {
  messages: ThreadMessage[];
  /** Index of the message whose [n] citations map to the current sources (-1 for none). */
  citedIndex: number;
  citations: ReadonlySet<number>;
  onCitation: (citation: number) => void;
}

export function MessageList({ messages, citedIndex, citations, onCitation }: MessageListProps) {
  return messages.map((message, index) => {
    const cited = index === citedIndex;
    return (
      <MessageItem
        key={index}
        role={message.role}
        content={message.content}
        citations={cited ? citations : undefined}
        onCitation={cited ? onCitation : undefined}
      />
    );
  });
}
```

`src/features/chat/ClarificationCard.tsx`:

```tsx
import { MessageSquare } from 'lucide-react';
import type { ClarificationExchange } from '../../api/types';
import { Markdown } from '../../components/Markdown';
import styles from './ClarificationCard.module.css';

interface ClarificationCardProps {
  request: string;
  question: string;
  history: ClarificationExchange[];
}

export function ClarificationCard({ request, question, history }: ClarificationCardProps) {
  return (
    <section className={styles.card} aria-labelledby="clarification-title">
      <p id="clarification-title" className={styles.heading}>
        <MessageSquare size={16} aria-hidden="true" /> A detail before I search
      </p>
      <p className={styles.request}>
        <strong>Your request:</strong> {request}
      </p>
      {history.length > 0 && (
        <ol className={styles.history} aria-label="Earlier clarifications">
          {history.map((exchange, index) => (
            <li key={index}>
              <p>
                <strong>Assistant:</strong> {exchange.question}
              </p>
              <p>
                <strong>You:</strong> {exchange.answer}
              </p>
            </li>
          ))}
        </ol>
      )}
      <Markdown>{question}</Markdown>
      <p className={styles.hint}>Reply in the message box below to continue.</p>
    </section>
  );
}
```

`src/features/chat/ClarificationCard.module.css`:

```css
.card {
  padding: var(--space-5);
  font-size: var(--text-base);
  line-height: 1.7;
  background: var(--color-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.heading {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
  padding-bottom: var(--space-3);
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-accent-text);
  border-bottom: 1px solid var(--color-border);
}

.request {
  margin-bottom: var(--space-3);
}

.history {
  margin: 0 0 var(--space-4);
  padding: var(--space-1) 0 var(--space-1) var(--space-4);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  list-style: none;
  border-left: 3px solid var(--color-border-strong);
}

.history li + li {
  margin-top: var(--space-2);
}

.hint {
  margin-top: var(--space-3);
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}
```

`src/features/chat/SourceCard.tsx`:

```tsx
import { ChevronRight } from 'lucide-react';
import type { Source } from '../../api/types';
import { Markdown } from '../../components/Markdown';
import { sourceElementId } from '../../lib/citations';
import { formatMetadataValue, sourceLocation, sourceTitle } from './sourceLabel';
import styles from './SourceCard.module.css';

interface SourceCardProps {
  source: Source;
  expanded: boolean;
  onToggle: () => void;
}

export function SourceCard({ source, expanded, onToggle }: SourceCardProps) {
  const id = sourceElementId(source.citation);
  const location = sourceLocation(source);
  return (
    <div id={id} className={styles.card} data-expanded={expanded || undefined}>
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={expanded}
        aria-controls={`${id}-panel`}
        onClick={onToggle}
      >
        <span className={styles.number}>{source.citation}</span>
        <span className={styles.label}>
          <span className={styles.name}>{sourceTitle(source)}</span>
          {location && <small className={styles.location}>{location}</small>}
        </span>
        <ChevronRight size={16} className={styles.chevron} aria-hidden="true" />
      </button>
      <div id={`${id}-panel`} className={styles.panel} hidden={!expanded}>
        <Markdown>{source.text}</Markdown>
        <dl className={styles.metadata}>
          {Object.entries(source.metadata).map(([key, value]) => (
            <div key={key}>
              <dt>{key.replaceAll('_', ' ')}</dt>
              <dd>{formatMetadataValue(value)}</dd>
            </div>
          ))}
          <div>
            <dt>relevance score</dt>
            <dd>{source.score.toFixed(3)}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
```

`src/features/chat/SourceCard.module.css`:

```css
.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  scroll-margin: var(--space-6);
  transition: border-color var(--transition-fast);
}

.card[data-expanded] {
  border-color: var(--color-border-strong);
}

.toggle {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  padding: var(--space-3);
  text-align: left;
  background: none;
  border: 0;
  border-radius: inherit;
}

.toggle:hover {
  background: var(--color-hover);
}

.number {
  min-width: 24px;
  padding: 2px 6px;
  font-size: var(--text-2xs);
  font-weight: 600;
  text-align: center;
  color: var(--color-accent-text);
  background: var(--color-accent-soft);
  border-radius: 5px;
}

.label {
  flex: 1;
  min-width: 0;
}

.name {
  display: block;
  font-weight: 500;
  overflow-wrap: anywhere;
}

.location {
  display: block;
  margin-top: 2px;
  font-size: var(--text-2xs);
  color: var(--color-text-subtle);
}

.chevron {
  flex-shrink: 0;
  color: var(--color-text-subtle);
  transition: transform var(--transition-fast);
}

.card[data-expanded] .chevron {
  transform: rotate(90deg);
}

.panel {
  padding: 0 var(--space-4) var(--space-4);
  font-size: var(--text-sm);
  line-height: 1.7;
  color: var(--color-text-muted);
}

.metadata {
  display: grid;
  gap: 2px;
  margin: var(--space-3) 0 0;
  padding: var(--space-3);
  font-size: var(--text-2xs);
  background: var(--color-surface-muted);
  border-radius: var(--radius-sm);
}

.metadata div {
  display: flex;
  gap: var(--space-3);
  overflow-wrap: anywhere;
}

.metadata dt {
  flex-shrink: 0;
  width: 120px;
  color: var(--color-text-subtle);
}

.metadata dd {
  min-width: 0;
  margin: 0;
}

@media (max-width: 560px) {
  .metadata div {
    flex-direction: column;
    gap: 0;
  }
}
```

`src/features/chat/SourceList.tsx`:

```tsx
import { BookOpen } from 'lucide-react';
import type { Source } from '../../api/types';
import { SourceCard } from './SourceCard';
import styles from './SourceList.module.css';

interface SourceListProps {
  sources: Source[];
  isExpanded: (citation: number) => boolean;
  onToggle: (citation: number) => void;
}

export function SourceList({ sources, isExpanded, onToggle }: SourceListProps) {
  return (
    <section className={styles.sources} aria-labelledby="sources-title">
      <h2 id="sources-title" className={styles.title}>
        <BookOpen size={14} aria-hidden="true" /> Retrieved sources
        <span className={styles.count}>{sources.length}</span>
      </h2>
      <ol className={styles.list}>
        {sources.map((source) => (
          <li key={String(source.metadata.chunk_id ?? source.citation)}>
            <SourceCard
              source={source}
              expanded={isExpanded(source.citation)}
              onToggle={() => onToggle(source.citation)}
            />
          </li>
        ))}
      </ol>
    </section>
  );
}
```

`src/features/chat/SourceList.module.css`:

```css
.sources {
  display: grid;
  gap: var(--space-2);
}

.title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-text-muted);
}

.count {
  padding: 1px 7px;
  font-size: var(--text-2xs);
  background: var(--color-surface-muted);
  border-radius: var(--radius-pill);
}

.list {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}
```

`src/features/chat/Composer.tsx`:

```tsx
import { ArrowUp, Layers } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, type FormEvent, type KeyboardEvent } from 'react';
import styles from './Composer.module.css';

const MAX_HEIGHT_PX = 200;

interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  placeholder: string;
  categories: string[];
  category: string;
  onCategoryChange: (category: string) => void;
  categoryDisabled: boolean;
}

export function Composer({
  value,
  onChange,
  onSubmit,
  disabled,
  placeholder,
  categories,
  category,
  onCategoryChange,
  categoryDisabled,
}: ComposerProps) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const wasDisabled = useRef(disabled);
  const canSend = !disabled && value.trim().length > 0;

  useLayoutEffect(() => {
    const element = textarea.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [value]);

  // Return focus after a request finishes, except on touch devices where it pops the keyboard.
  useEffect(() => {
    if (wasDisabled.current && !disabled && !window.matchMedia('(pointer: coarse)').matches) {
      textarea.current?.focus();
    }
    wasDisabled.current = disabled;
  }, [disabled]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (canSend) onSubmit();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (canSend) onSubmit();
  };

  return (
    <form className={styles.composer} onSubmit={submit}>
      <label htmlFor="composer-input" className="visually-hidden">
        Your question
      </label>
      <textarea
        id="composer-input"
        ref={textarea}
        className={styles.input}
        rows={1}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        aria-describedby="composer-hint"
      />
      <div className={styles.toolbar}>
        <label className={styles.category}>
          <Layers size={14} aria-hidden="true" />
          <span className="visually-hidden">Document category</span>
          <select
            value={category}
            disabled={categoryDisabled}
            onChange={(event) => onCategoryChange(event.target.value)}
          >
            <option value="">All documents</option>
            {categories.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <span id="composer-hint" className={styles.hint}>
          <kbd>Enter</kbd> to send · <kbd>Shift</kbd> + <kbd>Enter</kbd> for a new line
        </span>
        <button type="submit" className={styles.send} aria-label="Send question" disabled={!canSend}>
          <ArrowUp size={19} aria-hidden="true" />
        </button>
      </div>
    </form>
  );
}
```

`src/features/chat/Composer.module.css`:

```css
.composer {
  padding: var(--space-3) var(--space-3) var(--space-2) var(--space-4);
  background: var(--color-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  transition: border-color var(--transition-fast);
}

.composer:focus-within {
  border-color: var(--color-focus);
}

.input {
  display: block;
  width: 100%;
  min-height: 44px;
  padding: var(--space-1) 0;
  font-size: var(--text-base);
  line-height: 1.6;
  resize: none;
  background: transparent;
  border: 0;
  outline: none;
}

.input::placeholder {
  color: var(--color-text-subtle);
}

.toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-top: var(--space-2);
}

.category {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  color: var(--color-text-muted);
}

.category select {
  max-width: 220px;
  padding: 4px 2px;
  font-size: var(--text-xs);
  color: inherit;
  background: transparent;
  border: 0;
  border-radius: var(--radius-sm);
}

.hint {
  margin-left: auto;
  font-size: var(--text-2xs);
  color: var(--color-text-subtle);
}

.hint kbd {
  padding: 0 4px;
  font-family: inherit;
  background: var(--color-surface-muted);
  border: 1px solid var(--color-border);
  border-radius: 4px;
}

.send {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: 34px;
  height: 34px;
  padding: 0;
  color: var(--color-on-brand);
  background: var(--color-brand);
  border: 0;
  border-radius: var(--radius-md);
  transition: background var(--transition-fast);
}

.send:hover:not(:disabled) {
  background: var(--color-brand-hover);
}

.send:disabled {
  opacity: 0.4;
}

@media (max-width: 640px), (pointer: coarse) {
  .hint {
    display: none;
  }

  .send {
    margin-left: auto;
  }
}
```

`src/features/chat/ChatView.tsx`:

```tsx
import { ChevronRight, FileText } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { Skeleton } from '../../components/Skeleton';
import { Spinner } from '../../components/Spinner';
import { scrollBehavior } from '../../lib/motion';
import type { LibraryStatus } from '../library/useLibrary';
import { ClarificationCard } from './ClarificationCard';
import { Composer } from './Composer';
import { MessageItem } from './MessageItem';
import { MessageList } from './MessageList';
import { SourceList } from './SourceList';
import { WelcomeScreen } from './WelcomeScreen';
import type { Conversation } from './useConversation';
import { useSourceFocus } from './useSourceFocus';
import styles from './ChatView.module.css';

const SUGGESTIONS = [
  'What does ISO 9001 require for document control?',
  'How do we handle a customer complaint?',
  'Which forms support supplier evaluation?',
] as const;

interface ChatViewProps {
  conversation: Conversation;
  categories: string[];
  indexedCount: number;
  libraryStatus: LibraryStatus;
  modelLabel: string;
  onOpenLibrary: () => void;
}

export function ChatView({
  conversation,
  categories,
  indexedCount,
  libraryStatus,
  modelLabel,
  onOpenLibrary,
}: ChatViewProps) {
  const { thread, busy, restoring, pendingMessage } = conversation;
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const sourceFocus = useSourceFocus(thread.sources);
  const citations = useMemo(() => new Set(thread.sources.map((source) => source.citation)), [thread.sources]);
  // Sources belong to the latest answer only, so only its citations are linked.
  const citedIndex = thread.sources.length ? thread.messages.findLastIndex((m) => m.role === 'assistant') : -1;
  const showWelcome = !restoring && !busy && thread.messages.length === 0 && !thread.pending_clarification;

  useEffect(() => {
    const behavior = scrollBehavior();
    if (!busy && !thread.pending_clarification && thread.messages.length) {
      // Show the start of the newest answer rather than the bottom of its sources.
      const articles = scrollRef.current?.querySelectorAll<HTMLElement>('article');
      articles?.[articles.length - 1]?.scrollIntoView({ behavior, block: 'start' });
    } else {
      endRef.current?.scrollIntoView({ behavior, block: 'end' });
    }
  }, [thread, busy]);

  const placeholder = restoring
    ? 'Loading conversation…'
    : thread.pending_clarification
      ? 'Reply to the clarification…'
      : 'Ask anything about your documents…';

  return (
    <div className={styles.chat}>
      <div ref={scrollRef} className={styles.scroll}>
        {showWelcome ? (
          <WelcomeScreen
            suggestions={SUGGESTIONS}
            disabled={busy || restoring || indexedCount === 0}
            onPick={(suggestion) => void conversation.send(suggestion)}
          />
        ) : (
          <div className={styles.thread} role="log" aria-label="Conversation">
            <MessageList
              messages={thread.messages}
              citedIndex={citedIndex}
              citations={citations}
              onCitation={sourceFocus.reveal}
            />
            {thread.pending_clarification && (
              <ClarificationCard
                request={thread.question}
                question={thread.clarification_question}
                history={thread.clarification_history}
              />
            )}
            {thread.sources.length > 0 && (
              <SourceList sources={thread.sources} isExpanded={sourceFocus.isExpanded} onToggle={sourceFocus.toggle} />
            )}
            {pendingMessage && <MessageItem role="user" content={pendingMessage} />}
            {restoring && <Skeleton lines={3} label="Loading conversation" />}
            {busy && (
              <p className={styles.status} role="status">
                <Spinner size={17} /> Working with your documents…
              </p>
            )}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className={styles.composerArea}>
        {libraryStatus !== 'unavailable' && indexedCount === 0 && (
          <p className={styles.indexPrompt}>
            <FileText size={15} aria-hidden="true" />
            {libraryStatus === 'loading'
              ? 'Loading document library…'
              : 'Your document library has not been indexed yet.'}
            <button type="button" onClick={onOpenLibrary}>
              Open library <ChevronRight size={13} aria-hidden="true" />
            </button>
          </p>
        )}
        <Composer
          value={conversation.draft}
          onChange={conversation.setDraft}
          onSubmit={() => void conversation.send()}
          disabled={busy || restoring}
          placeholder={placeholder}
          categories={categories}
          category={conversation.category}
          onCategoryChange={conversation.setCategory}
          categoryDisabled={busy || restoring || thread.pending_clarification}
        />
        <p className={styles.caption}>
          {modelLabel} <span aria-hidden="true">·</span> Answers can be imperfect. Review the evidence.
        </p>
      </div>
    </div>
  );
}
```

`src/features/chat/ChatView.module.css`:

```css
.chat {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.scroll {
  flex: 1;
  overflow-y: auto;
  padding: 0 var(--space-8);
}

.thread {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  max-width: var(--content-width);
  margin: 0 auto;
  padding: var(--space-8) 0 var(--space-4);
}

.status {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-muted);
}

.composerArea {
  align-self: center;
  width: 100%;
  max-width: calc(var(--content-width) + 2 * var(--space-8));
  padding: var(--space-3) var(--space-8) var(--space-4);
}

.indexPrompt {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.indexPrompt button {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-left: auto;
  padding: 4px 6px;
  font-size: var(--text-xs);
  color: var(--color-accent-text);
  background: none;
  border: 0;
  border-radius: var(--radius-sm);
}

.indexPrompt button:hover {
  background: var(--color-hover);
}

.caption {
  margin-top: var(--space-3);
  font-size: var(--text-2xs);
  text-align: center;
  color: var(--color-text-subtle);
}

@media (max-width: 640px) {
  .scroll {
    padding: 0 var(--space-4);
  }

  .composerArea {
    padding: var(--space-2) var(--space-3) var(--space-3);
  }
}
```

- [ ] **Step 4: Verify**

Run: `npx vitest run src/features/chat && npm run typecheck && npm run lint`
Expected: all chat tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(frontend): chat feature with clickable citations and accessible composer"
```

---

### Task 9: Library feature

**Files:**
- Create: `src/features/library/{LibraryView,LibraryStats,FileList,FileRow}.tsx`, matching `.module.css`, `src/features/library/LibraryView.test.tsx`

**Interfaces:**
- Consumes: `files.ts` helpers + `FileGroup`, `StatusFilter` (Task 4), `LibraryStatus` (Task 6), `Skeleton` (Task 5).
- Produces: `<LibraryView files indexedCount chunkCount status indexedAt>`.

- [ ] **Step 1: Failing test** — `src/features/library/LibraryView.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { LibraryFile } from '../../api/types';
import { LibraryView } from './LibraryView';

const files: LibraryFile[] = [
  { source: 'Manual.pdf', file_type: '.pdf' },
  { source: 'Purchasing/Broken.vsd', file_type: '.vsd', status: 'error', error: 'LibreOffice is not installed' },
  { source: 'Purchasing/OP-01 Supplier.docx', file_type: '.docx', status: 'indexed', chunks: 4 },
];

describe('LibraryView', () => {
  it('groups by category, filters by status, and searches', async () => {
    const user = userEvent.setup();
    render(<LibraryView files={files} indexedCount={1} chunkCount={4} status="ready" indexedAt={null} />);
    expect(screen.getByRole('heading', { name: /^Purchasing/ })).toBeInTheDocument();
    expect(screen.getByText('4 chunks')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Needs attention/ }));
    expect(screen.getByText('Broken.vsd')).toBeInTheDocument();
    expect(screen.getByText('LibreOffice is not installed')).toBeInTheDocument();
    expect(screen.queryByText('OP-01 Supplier.docx')).toBeNull();

    await user.click(screen.getByRole('button', { name: /^All/ }));
    await user.type(screen.getByRole('searchbox', { name: 'Search documents' }), 'manual');
    expect(screen.getByText('Manual.pdf')).toBeInTheDocument();
    expect(screen.queryByText('Broken.vsd')).toBeNull();
  });

  it('explains an empty library and a failed connection', () => {
    const { rerender } = render(
      <LibraryView files={[]} indexedCount={0} chunkCount={0} status="ready" indexedAt={null} />,
    );
    expect(screen.getByText(/No documents found/)).toBeInTheDocument();
    rerender(<LibraryView files={[]} indexedCount={0} chunkCount={0} status="unavailable" indexedAt={null} />);
    expect(screen.getByText(/library is unavailable/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/features/library/LibraryView.test.tsx`
Expected: FAIL — cannot resolve `./LibraryView`.

- [ ] **Step 3: Implement**

`src/features/library/FileRow.tsx`:

```tsx
import { FileText } from 'lucide-react';
import type { LibraryFile } from '../../api/types';
import { fileName, fileStatus } from './files';
import styles from './FileRow.module.css';

const STATUS_LABEL = { error: 'Needs attention', pending: 'Not indexed' } as const;

export function FileRow({ file }: { file: LibraryFile }) {
  const status = fileStatus(file);
  const label = status === 'indexed' ? `${file.chunks ?? 0} chunks` : STATUS_LABEL[status];
  return (
    <li className={styles.row}>
      <FileText size={20} className={styles.icon} aria-hidden="true" />
      <div className={styles.info}>
        <p className={styles.name}>{fileName(file.source)}</p>
        <p className={styles.path}>{file.source}</p>
        {file.error && <p className={styles.error}>{file.error}</p>}
      </div>
      <span className={styles.status} data-status={status}>
        {label}
      </span>
    </li>
  );
}
```

`src/features/library/FileRow.module.css`:

```css
.row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
}

.row + .row {
  border-top: 1px solid var(--color-border);
}

.icon {
  flex-shrink: 0;
  color: var(--color-text-subtle);
}

.info {
  flex: 1;
  min-width: 0;
}

.name {
  font-weight: 500;
  overflow-wrap: anywhere;
}

.path {
  margin-top: 2px;
  font-size: var(--text-2xs);
  color: var(--color-text-subtle);
  overflow-wrap: anywhere;
}

.error {
  margin-top: var(--space-1);
  font-size: var(--text-xs);
  line-height: 1.5;
  color: var(--color-danger-text);
  overflow-wrap: anywhere;
}

.status {
  flex-shrink: 0;
  padding: 3px 9px;
  font-size: var(--text-2xs);
  font-weight: 500;
  white-space: nowrap;
  color: var(--color-text-muted);
  background: var(--color-surface-muted);
  border-radius: var(--radius-pill);
}

.status[data-status='indexed'] {
  color: var(--color-success-text);
  background: var(--color-success-bg);
}

.status[data-status='error'] {
  color: var(--color-danger-text);
  background: var(--color-danger-bg);
}

@media (max-width: 480px) {
  .icon {
    display: none;
  }
}
```

`src/features/library/FileList.tsx`:

```tsx
import { Skeleton } from '../../components/Skeleton';
import { FileRow } from './FileRow';
import type { FileGroup } from './files';
import type { LibraryStatus } from './useLibrary';
import styles from './FileList.module.css';

interface FileListProps {
  status: LibraryStatus;
  groups: FileGroup[];
  emptyMessage: string;
}

export function FileList({ status, groups, emptyMessage }: FileListProps) {
  if (status === 'loading') return <Skeleton lines={6} label="Loading documents" />;
  if (status === 'unavailable') {
    return <p className={styles.empty}>The document library is unavailable. Check that the backend is running.</p>;
  }
  if (groups.length === 0) return <p className={styles.empty}>{emptyMessage}</p>;
  return (
    <div className={styles.groups}>
      {groups.map(({ category, files }) => (
        <section key={category}>
          <h2 className={styles.groupTitle}>
            {category} <span className={styles.groupCount}>{files.length}</span>
          </h2>
          <ul className={styles.list}>
            {files.map((file) => (
              <FileRow key={file.source} file={file} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
```

`src/features/library/FileList.module.css`:

```css
.groups {
  display: grid;
  gap: var(--space-6);
}

.groupTitle {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--color-text-muted);
}

.groupCount {
  font-weight: 500;
  color: var(--color-text-subtle);
}

.list {
  margin: 0;
  padding: 0;
  list-style: none;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.empty {
  padding: var(--space-10) var(--space-4);
  text-align: center;
  color: var(--color-text-muted);
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius-md);
}
```

`src/features/library/LibraryStats.tsx`:

```tsx
import styles from './LibraryStats.module.css';

interface LibraryStatsProps {
  total: number;
  indexed: number;
  chunks: number;
  loading: boolean;
}

export function LibraryStats({ total, indexed, chunks, loading }: LibraryStatsProps) {
  const stats = [
    { label: 'Source documents', value: total },
    { label: 'Indexed successfully', value: indexed },
    { label: 'Searchable chunks', value: chunks },
  ];
  return (
    <dl className={styles.stats}>
      {stats.map(({ label, value }) => (
        <div key={label} className={styles.stat}>
          <dt className={styles.label}>{label}</dt>
          <dd className={styles.value}>{loading ? '—' : value.toLocaleString()}</dd>
        </div>
      ))}
    </dl>
  );
}
```

`src/features/library/LibraryStats.module.css`:

```css
.stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-4);
  margin: var(--space-8) 0 0;
}

.stat {
  display: flex;
  flex-direction: column-reverse;
  padding: var(--space-5);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.value {
  margin: 0;
  font: 600 1.75rem/1.1 var(--font-display);
}

.label {
  margin-top: var(--space-2);
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

@media (max-width: 560px) {
  .stats {
    gap: var(--space-2);
  }

  .stat {
    padding: var(--space-3);
  }

  .value {
    font-size: 1.35rem;
  }
}
```

`src/features/library/LibraryView.tsx`:

```tsx
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { LibraryFile } from '../../api/types';
import { FileList } from './FileList';
import { LibraryStats } from './LibraryStats';
import { countByStatus, filterFiles, groupByCategory, type StatusFilter } from './files';
import type { LibraryStatus } from './useLibrary';
import styles from './LibraryView.module.css';

const FILTERS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'indexed', label: 'Indexed' },
  { value: 'error', label: 'Needs attention' },
  { value: 'pending', label: 'Not indexed' },
];

interface LibraryViewProps {
  files: LibraryFile[];
  indexedCount: number;
  chunkCount: number;
  status: LibraryStatus;
  indexedAt: string | null;
}

export function LibraryView({ files, indexedCount, chunkCount, status, indexedAt }: LibraryViewProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const counts = useMemo(() => countByStatus(files), [files]);
  const groups = useMemo(() => groupByCategory(filterFiles(files, filter, query)), [files, filter, query]);
  const lastIndexed = formatTimestamp(indexedAt);

  return (
    <section className={styles.page} aria-labelledby="library-title">
      <div className={styles.inner}>
        <p className="eyebrow">Your source of truth</p>
        <h1 id="library-title" className={styles.title}>
          Document library
        </h1>
        <p className={styles.lead}>
          Documents indexed by the ingestion command appear here.
          {lastIndexed && ` Last indexed ${lastIndexed}.`}
        </p>

        <LibraryStats total={files.length} indexed={indexedCount} chunks={chunkCount} loading={status === 'loading'} />

        <p className={styles.note}>
          PDF · Word · Excel · PowerPoint · Visio. Visio and legacy Office files need LibreOffice. Files that need
          attention show their error below.
        </p>

        <div className={styles.toolbar}>
          <label className={styles.search}>
            <Search size={15} aria-hidden="true" />
            <span className="visually-hidden">Search documents</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name or folder"
            />
          </label>
          <div className={styles.filters} role="group" aria-label="Filter by status">
            {FILTERS.map(({ value, label }) => (
              <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>
                {label} <span className={styles.filterCount}>{value === 'all' ? files.length : counts[value]}</span>
              </button>
            ))}
          </div>
        </div>

        <FileList
          status={status}
          groups={groups}
          emptyMessage={
            files.length === 0
              ? 'No documents found. Add files to DOCUMENT_DIR and run the ingestion command.'
              : 'No documents match your search and filter.'
          }
        />
      </div>
    </section>
  );
}

function formatTimestamp(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
```

`src/features/library/LibraryView.module.css`:

```css
.page {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-12) var(--space-10);
}

.inner {
  max-width: 1040px;
  margin: 0 auto;
}

.title {
  margin: var(--space-3) 0 var(--space-2);
  font: 600 var(--text-xl)/1.2 var(--font-display);
  letter-spacing: -0.03em;
}

.lead {
  color: var(--color-text-muted);
}

.note {
  margin-top: var(--space-6);
  font-size: var(--text-xs);
  line-height: 1.7;
  color: var(--color-text-muted);
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
  margin: var(--space-6) 0 var(--space-5);
}

.search {
  display: flex;
  flex: 1 1 240px;
  align-items: center;
  gap: var(--space-2);
  padding: 0 var(--space-3);
  color: var(--color-text-subtle);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.search:focus-within {
  border-color: var(--color-focus);
}

.search input {
  flex: 1;
  min-width: 0;
  padding: 10px 0;
  color: var(--color-text);
  background: none;
  border: 0;
  outline: none;
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  padding: 3px;
  background: var(--color-surface-muted);
  border-radius: var(--radius-md);
}

.filters button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  background: none;
  border: 0;
  border-radius: 7px;
}

.filters button[aria-pressed='true'] {
  font-weight: 600;
  color: var(--color-text);
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
}

.filterCount {
  font-size: var(--text-2xs);
  color: var(--color-text-subtle);
}

@media (max-width: 640px) {
  .page {
    padding: var(--space-6) var(--space-4);
  }
}
```

- [ ] **Step 4: Verify**

Run: `npx vitest run src/features/library && npm run typecheck && npm run lint`
Expected: all library tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(frontend): document library with grouping, status filter, and search"
```

---

### Task 10: Wire the app, remove the old monolith, full verification

**Files:**
- Create: `src/app/App.tsx`, `src/app/App.module.css`
- Modify: `src/main.tsx`
- Delete: `src/App.tsx`, `src/style.css`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: App** — `src/app/App.tsx`:

```tsx
import { useState } from 'react';
import { Notice } from '../components/Notice';
import { Sidebar } from '../components/Sidebar';
import { ChatView } from '../features/chat/ChatView';
import { useConversation } from '../features/chat/useConversation';
import { LibraryView } from '../features/library/LibraryView';
import { useLibrary } from '../features/library/useLibrary';
import { useHealth } from '../hooks/useHealth';
import { AppShell } from './AppShell';
import type { View } from './view';
import styles from './App.module.css';

const TITLES: Record<View, string> = { chat: 'Ask your documents', library: 'Document library' };

export default function App() {
  const [view, setView] = useState<View>('chat');
  const conversation = useConversation();
  const library = useLibrary({ paused: conversation.busy });
  const health = useHealth();
  const showGroqNotice = health !== null && !health.groq_configured;
  const hasNotices = Boolean(conversation.error || library.error || showGroqNotice);

  return (
    <AppShell
      title={TITLES[view]}
      sidebar={(closeDrawer) => (
        <Sidebar
          view={view}
          onNavigate={(next) => {
            setView(next);
            closeDrawer();
          }}
          onNewChat={() => {
            conversation.reset();
            setView('chat');
            closeDrawer();
          }}
          newChatDisabled={conversation.busy || conversation.restoring}
          fileCount={library.status === 'ready' ? library.files.length : null}
          indexedCount={library.indexedCount}
          chunkCount={library.chunkCount}
          online={library.online}
        />
      )}
    >
      {hasNotices && (
        <div className={styles.notices}>
          {conversation.error && (
            <Notice tone="error" onDismiss={conversation.dismissError}>
              {conversation.error}
            </Notice>
          )}
          {library.error && (
            <Notice tone="error" onDismiss={library.dismissError}>
              {library.error}
            </Notice>
          )}
          {showGroqNotice && (
            <Notice>Add your GROQ_API_KEY to backend/.env and restart the backend to enable answers.</Notice>
          )}
        </div>
      )}
      {view === 'library' ? (
        <LibraryView
          files={library.files}
          indexedCount={library.indexedCount}
          chunkCount={library.chunkCount}
          status={library.status}
          indexedAt={library.indexedAt}
        />
      ) : (
        <ChatView
          conversation={conversation}
          categories={library.categories}
          indexedCount={library.indexedCount}
          libraryStatus={library.status}
          modelLabel={health?.model ? `${health.model} via Groq` : 'ISO assistant'}
          onOpenLibrary={() => setView('library')}
        />
      )}
    </AppShell>
  );
}
```

`src/app/App.module.css`:

```css
.notices {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-8) 0;
}

@media (max-width: 640px) {
  .notices {
    padding: var(--space-3) var(--space-4) 0;
  }
}
```

`src/main.tsx` (global styles first so component modules override them):

```tsx
import './styles/tokens.css';
import './styles/base.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App';

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 2: Delete the monolith**

```bash
git rm -q src/App.tsx src/style.css
```

- [ ] **Step 3: Full frontend checks**

Run: `npm run typecheck && npm run lint && npm run test && npm run build`
Expected: no type errors, no lint errors, all tests pass, `dist/` built.

- [ ] **Step 4: Run both apps and check in the browser**

```bash
cd backend && cp -n .env.example .env && .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --http h11 --ws none &
cd frontend && cp -n .env.example .env && npm run dev
```

Check at 1280 px and 390 px widths, light and dark scheme:
- Welcome screen, suggestions disabled while nothing is indexed, index prompt opens Library.
- Library: stats, empty state, search + filters.
- Drawer opens/closes on mobile (button, Escape, backdrop, nav item).
- Stop the backend → error notice + red status dot; library keeps its last data.
- Groq notice when `GROQ_API_KEY` is empty.
(Chat answers need indexed documents + a Groq key; covered by tests if unavailable locally.)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor(frontend): replace monolithic App with feature-based structure"
```

---

### Task 11: README for the new layout and final verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README** (paths/commands only, no rewrite):
  - **Setup:** run from `backend/`: `uv venv .venv` / `uv pip install -r requirements.txt`; `.env` lives at `backend/.env` (copy `backend/.env.example`); Linux CPU-wheel note for torch/torchvision.
  - **Upgrading from the old layout:** move an existing root `.env`, `data/`, `.cache/`, and the document folder into `backend/`.
  - **Qdrant:** `cd backend && docker compose up -d qdrant` (project name pinned so existing data is kept).
  - **Ingest:** `python -m app.ingest [--folder ...] [--force]` from `backend/`.
  - **Backend:** `python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --http h11 --ws none` from `backend/`; entry point `app.main:app`.
  - **Frontend:** `cd frontend && cp .env.example .env && npm ci && npm run dev`; `VITE_API_PROXY_TARGET`, `VITE_DEV_PORT`.
  - **Configuration table:** add `CORS_ORIGINS`.
  - **Project structure:** new tree (backend files under `backend/`, frontend `src/app|api|components|features|hooks|lib|styles`).
  - **Verification:** `cd backend && python -m pytest -q`; `cd frontend && npm run typecheck && npm run lint && npm run test && npm run build`; opt-in model/Groq tests run from `backend/`.
  - **Troubleshooting:** "set `GROQ_API_KEY` in `backend/.env`".
  - Error text `python -m app.ingest` matches `nodes.py`.

- [ ] **Step 2: Final verification**

```bash
cd backend && .venv/bin/python -m pytest -q -p no:cacheprovider     # 66 passed, 4 skipped
cd ../frontend && npm run typecheck && npm run lint && npm run test && npm run build
cd .. && git status --short && ls -A                                 # root: README.md .gitignore backend docs frontend
grep -rn "backend\.app" --include=*.py --include=*.md --include=*.toml --include=*.txt . | grep -v node_modules   # no output
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "docs: update README for backend/ and frontend/ layout"
```
