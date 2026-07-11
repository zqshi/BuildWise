# BuildWise v2

BuildWise v2 is the current main implementation version.  

**语言 / Language:** [中文](README.md) | [English](README.en.md)  
It consolidates the homepage entry, login, dashboard, project workbench, project/domain modeling, deliverable drawers, Agent collaboration desk, real LLM analysis pipeline, and project-level workspace isolation into a single frontend-backend engineering stack.

## 1. Current Capabilities

- Homepage & login entry: `#/` & `#/login`
- Dashboard: Project overview, risks & recent activities
- Project workbench: Project/iteration management, requirements upload, analysis, boundaries, deliverables, testing, release review
- Project modeling & domain modeling: Supports structured summaries, node relationship graphs, business entity cards, rule mappings & relationship narratives
- Code deliverable drawers: View by file structure instead of stacked blocks
- Agent collaboration desk: Single Agent, multi-project workspace, project knowledge context injection
- Project knowledge directory: Written to `workspacePath/.buildwise/` per project

## 2. Requirements

- Node.js `>= 22`
- npm `>= 10`

## 3. Installation

```bash
cd v2
npm run install:all
```

## 4. Local Development

Recommended to start the dev stack directly:

```bash
cd v2
npm run dev:stack:start
```

Stop:

```bash
cd v2
npm run dev:stack:stop
```

Start frontend only:

```bash
cd v2
npm run dev
```

Start backend only:

```bash
cd v2/backend
npm run dev
```

Default entries:

- Homepage: `http://localhost:5173/#/`
- Login: `http://localhost:5173/#/login`
- Dashboard: `http://localhost:5173/#/dashboard`
- Backend: `http://127.0.0.1:5055`

Dev integration notes:

- Frontend proxies to backend via same-origin `/api` locally to avoid CORS issues.
- When `VITE_API_BASE` is not explicitly set, Vite dev/preview proxies to local backend.
- If `VITE_API_BASE` is explicitly set to a local cross-port, build-time CSP automatically allows the corresponding API origin; when not set, falls back to same-origin `/api`.

## 5. Quality Gates

Recommended execution:

```bash
cd v2
npm run verify:all
```

Current scripts include:

- `npm run check:hygiene`
- `npm run check:boundaries`
- `npm run typecheck`
- `npm run build`
- `npm run report:readiness`
- `npm --prefix backend run check:boundaries`
- `npm --prefix backend run typecheck`
- `npm --prefix backend run build`
- `npm --prefix backend run test:contract`
- `npm --prefix backend run verify:prod-release`

CI additionally runs:

- `npm audit --audit-level=high --registry=https://registry.npmjs.org` (frontend)
- `npm audit --audit-level=high --registry=https://registry.npmjs.org` (backend)

Additional scripts:

- `npm test`
- `npm run seed:agentic:flow`
- `npm run e2e:creative-generator:rc`
- `npm run reset:business-env`
- `npm run clean:workspace`

## 6. Demo Data & Real Pipeline

Rebuild current demo data:

```bash
cd v2
npm run seed:agentic:flow
```

This command synchronously generates:

- `v2/backend/data.json`
- `v2/backend/data.runtime.json`
- `v2/backend/continuous-modeling.runtime.json`

Restore to clean production-ready initial business environment:

```bash
cd v2
npm run reset:business-env
```

This command:

- Rebuilds `v2/backend/data.json` and `v2/backend/data.runtime.json` as initial seed store
- Clears `v2/backend/continuous-modeling.runtime.json`
- Deletes `.artifacts/`, `memory/`, `index/`, `shards/`, `workspace.json`, `.buildwise/`, `tmp/e2e-reports/`

Demo project currently contains:

- 1 project
- 2 iterations (`V1` / `V1.1`)
- Project knowledge base
- continuous-modeling snapshot
- Business-friendly entities, rules, relationships and review tasks

Related documentation:

- [agentic-flow-mock-dataset.md](./docs/agentic-flow-mock-dataset.md)
- [Real LLM Demo Pipeline](./docs/openclaw-real-llm-demo.md)
- [Agent Dynamic Orchestration Governance](./docs/openclaw-agentic-flow-governance.md)
- [creative-generator-demo-requirement.md](./docs/creative-generator-demo-requirement.md)

## 7. Build & Production

Frontend build:

```bash
cd v2
npm run build
```

Backend build & start:

```bash
cd v2/backend
npm run build
npm run start
```

Build artifacts:

- Frontend: `v2/dist`
- Backend: `v2/backend/dist`

Production requirements:

- Explicitly configure `VITE_API_BASE`
- Bind independent `workspacePath` per project
- Keep read/write permissions for `workspacePath/.buildwise/` and include in backups
- Do not include `.buildwise/` in Git

## 8. Key Environment Variables

Backend reads from `v2/backend/.env`:

```bash
cd v2/backend
cp .env.example .env
```

Production template:

```bash
cd v2/backend
cp .env.production.example .env
```

Key items:

- `HOST` / `PORT`
- `NODE_ENV`
- `CORS_ORIGINS`
- `AUTH_MODE=off | token | jwt`
- `AUTH_TOKENS_JSON`
- `JWT_SECRET`
- `STORAGE_BACKEND=sqlite` (JSON backend deprecated, passing `json` silently downgrades to sqlite)
- `WORKSPACE_DB_FILE`
- `WORKSPACE_DATA_FILE`
- `LLM_PROVIDER`
- `LLM_API_BASE`
- `LLM_API_KEY`
- `LLM_MODEL`
- `LLM_REQUIRED`
- `GITHUB_TOKEN`
- `PROJECT_REPO_ROOT`

Controlled release verification:

```bash
cd v2/backend
npm run verify:prod-release
```

Project workspace binding constraints:

- API: `POST /api/v1/projects/:id/workspace/bind`
- `workspacePath` recommends absolute path
- Same path cannot bind multiple projects, conflict returns `409 workspace_path_already_bound`
- Project knowledge index, daily memory & shard documents default written to `workspacePath/.buildwise/`

## 9. API & Repository Governance

Backend currently uses `/api/v1` prefix. Common APIs include:

- `GET /api/v1/status`
- `GET /api/v1/projects`
- `POST /api/v1/projects`
- `GET /api/v1/projects/:id/iterations`
- `POST /api/v1/projects/:id/iterations`
- `GET /api/v1/projects/:id/model-view`
- `GET /api/v1/projects/:id/model/business-summary`
- `POST /api/v1/projects/:id/workspace/bind`
- `POST /api/v1/projects/:id/repository/bootstrap`
- `GET /api/v1/projects/:id/repository/status`
- `POST /api/v1/iterations/:id/publish`

Repository modes:

- `external_git`
- `managed_local`
- `hybrid`

## 10. Current Status

BuildWise v2 is currently a runnable, demonstrable, and continuously governable main implementation.  
The current release candidate branch has passed local `check:boundaries`, `verify:all`, and `verify:prod-readiness`, and can be used for review, demonstration, and controlled production candidates.

Still need to note:

- Final production release depends on `verify:prod-release` (including contract verification) in real environment, deployment configuration, and operations checks
- README describes current implementation and operation method, not a replacement for formal launch SOP
- Production configuration, keys, domains, backups, and workspace permissions must still be confirmed item by item according to backend production documentation

## 11. Continue Reading

- [v2/backend/README.md](./backend/README.md)
- [docs/README.md](../docs/README.md)