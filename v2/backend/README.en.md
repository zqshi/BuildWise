# BuildWise v2 Backend

BuildWise backend is responsible for:

**语言 / Language:** [中文](README.md) | [English](README.en.md)

- Project / iteration data management
- Unified view for project modeling & domain modeling
- Deliverables, test matrices & release review
- Project-level workspace binding & knowledge materialization
- Pluggable Agent execution backend integration
- Repository governance, release & rollback pipeline

## 1. Quick Start

```bash
cd v2/backend
npm install
npm run build
npm run start
```

Development mode:

```bash
npm run dev
```

## 2. Environment Variables

Automatically read at startup:

- `v2/backend/.env`

Copy from template:

```bash
cp .env.example .env
```

Key variables:

- `HOST` / `PORT`
- `NODE_ENV`
- `CORS_ORIGINS`
- `AUTH_MODE=off | token | jwt`
- `AUTH_TOKENS_JSON`
- `JWT_SECRET`
- `JWT_ACCESS_TTL_SEC`
- `JWT_REFRESH_TTL_SEC`
- `AUTH_PUBLIC_PATH_PREFIXES`
- `STORAGE_BACKEND=sqlite` (JSON backend deprecated, passing `json` silently downgrades to sqlite)
- `WORKSPACE_DB_FILE`
- `WORKSPACE_DATA_FILE`
- `LLM_PROVIDER`
- `LLM_API_BASE`
- `LLM_API_KEY`
- `LLM_MODEL`
- `LLM_REQUIRED`
- `DEPENDENCY_REQUIRED`
- `GITHUB_TOKEN`
- `PROJECT_REPO_ROOT`

Notes:

- Production environment recommends `AUTH_MODE=jwt`
- Production environment recommends `STORAGE_BACKEND=sqlite`
- Each project must use independent `workspacePath`
- Project knowledge directory written to `workspacePath/.buildwise/`

## 3. Quality Gates

```bash
npm run check:hygiene
npm run check:boundaries
npm run check:prompts
npm run check:prompts:replay
npm run check:agents
npm run check:skills
npm run typecheck
npm run build
npm run test
npm run test:contract
npm run verify:prod-readiness
npm run verify:prod-readiness:sqlite
```

Additional:

- `npm run ops:preflight`
- `npm run ops:llm-check`
- `npm run ops:alerts`
- `PROJECT_ID=1 npm run ops:rollback`
- `STORAGE_BACKEND=sqlite npm run ops:backup-drill`

## 4. Key APIs

Backend currently uses unified `/api/v1` prefix.

Core runtime APIs:

- `GET /health`
- `GET /ready`
- `GET /api/v1/status`
- `GET /api/v1/ops/runtime`

Projects & iterations:

- `GET /api/v1/projects`
- `POST /api/v1/projects`
- `GET /api/v1/projects/:id/iterations`
- `POST /api/v1/projects/:id/iterations`

Project modeling:

- `GET /api/v1/projects/:id/model-view`
- `GET /api/v1/projects/:id/model/business-summary`

Workspace binding:

- `POST /api/v1/projects/:id/workspace/bind`
- `POST /api/v1/projects/:id/policies/restore-initial`
- `POST /api/v1/governance/orchestration/policies/restore-initial`

Repository governance & release:

- `GET /api/v1/projects/:id/repository`
- `POST /api/v1/projects/:id/repository/bootstrap`
- `GET /api/v1/projects/:id/repository/status`
- `GET /api/v1/projects/:id/repository/migration-plan`
- `POST /api/v1/projects/:id/repository/mode`
- `POST /api/v1/projects/:id/repository/provision`
- `POST /api/v1/projects/:id/repository/scaffold`
- `POST /api/v1/iterations/:id/publish`
- `GET /api/v1/projects/:id/code-trace?ref=<branch|tag|commit|path>`

Change control:

- `GET /api/v1/iterations/:id/change-control`
- `POST /api/v1/iterations/:id/change-control/confirm`
- `POST /api/v1/iterations/:id/change-control/boundary`
- `POST /api/v1/iterations/:id/change-control/test-matrix/execution`
- `POST /api/v1/iterations/:id/change-control/test-artifacts/generate`
- `GET /api/v1/iterations/:id/release-review`

## 5. Runtime Semantics

- `/health`
  - liveness
  - Only indicates if process is alive
  - Returns `503` during graceful shutdown
- `/ready`
  - readiness
  - Reflects storage probes, model files, and LLM connectivity
- `/api/v1/status`
  - View runtime summary

Notes:

- LLM is probed asynchronously once during startup, no longer blocks listening
- `runtime.llmRequired` indicates whether LLM hard dependency gate is enabled
- `runtime.dependencyRequired` indicates whether dependency probe hard gate is enabled

## 6. Agent Execution Backend & Project Workspace

Current design:

1. Single Agent
2. One independent workspace per project
3. All iterations continuously accumulate into the same project workspace
4. BuildWise only handles knowledge materialization, retrieval, and context injection, doesn't depend on specific Agent framework kernel

Constraints:

- `workspacePath` recommends absolute path
- Same path cannot bind multiple projects
- Binding conflict returns `409 workspace_path_already_bound`
- Project knowledge directory located at:
  - `workspacePath/.buildwise/workspace.json`
  - `workspacePath/.buildwise/memory/`
  - `workspacePath/.buildwise/shards/`
  - `workspacePath/.buildwise/index/`

## 7. Production Notes

Current production & operations main documents:

- [production-operations.md](./docs/production-operations.md)
- [production-readiness.md](./docs/production-readiness.md)
- [release-candidate-checklist.md](./docs/release-candidate-checklist.md)

Notes:

- Current branch has passed local `check:boundaries` and `verify:prod-readiness`
- Final production release still depends on real environment's `verify:prod-release` (including contract verification), key configuration, domain configuration, and operations checks