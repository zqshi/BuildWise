# BuildWise

> Compile business intent into executable software delivery.

**语言 / Language:** [中文](README.md) | [English](README.en.md)

BuildWise is an AI-native delivery workbench for product managers, business owners, technical leads, and QA professionals. It doesn't just embed chat into the development process - it truly consolidates **requirements analysis, domain modeling, deliverable advancement, test validation, release review, and project knowledge accumulation** into a single project space.

## What Problems It Solves

The issue for most software teams isn't "no one can write documentation" - it's that the software delivery chain has been broken in three places for a long time:

- Requirements change, but no one knows which pages, APIs, rules, and release risks are affected;
- Before launch, no one can confidently answer "can we release now, and why?";
- Version after version, rules, boundaries, and historical decisions are scattered across chats, PRDs, prototypes, and code, forcing the team to start from scratch each time.

BuildWise fills this long-broken gap between "business intent" and "engineering delivery."

## One-Sentence Understanding

BuildWise compiles "business intent" into "executable software delivery workflows," and continuously consolidates rules, boundaries, deliverables, and release decisions from each iteration into a project-level knowledge system.

## What You'll Immediately Experience

- From "re-explaining context in every tool" to "AI always knows what this project is about" - zero context fragmentation;
- From "every project starts from zero" to "AI proactively reminds you of past pitfalls" - smarter with every use;
- From "discovering unclear requirements after coding" to "quality gates at every stage exit" - quality built into the process;
- From "release decisions by gut feeling" to "go / caution / block based on boundaries, tests, and evidence" - deliverables are traceable.

## Why It's Not Just Another AI Tool

- It focuses on complete delivery processes, not one-off generation;
- It enables business people to continuously participate in rule modeling, not just appear during PRD phase;
- It writes historical knowledge back to the project workspace, not leaving value in temporary conversations;
- It provides boundaries, tests, and evidence for release decisions, not just outputting a "looks good" answer.

## Core Values

### 1. Business People Can Directly Drive Software Delivery

BuildWise turns "product idea → requirements clarification → deliverables → testing → release" into a workbench, rather than requiring business people to first learn the language of development processes.

### 2. Projects Get Smarter Over Time — Core Differentiation

Every project has an independent workspace, and all iterations continuously write back to the same project knowledge space, accumulating: business terminology, stable rules, entity relationships, page/API/code mappings, decision logs, known risks, and change patterns. Project experience accumulates with versions, getting smarter with every use.

### 3. AI Participates in Governance, Not Just Content Generation

The current implementation uses an `Agent + Skills` pattern: AI dynamically selects skills based on the current phase, project knowledge, and user conversation, rather than rigidly running fixed processes. Each phase exit has gates, and quality is guaranteed by the process, not checked afterward.

### 4. Release Decisions No Longer Based on Gut Feeling — Deliverables Are Traceable

Every iteration goes through change boundary confirmation, test matrix, and release review. The system explicitly gives: go, caution, or block — every line of code can be traced to its requirement source, and every decision has evidence preserved.

## Product Interface Preview

These screenshots show BuildWise's product expression direction and core workbench forms.

### 1. Homepage

![BuildWise Homepage](./v2/docs/images/homepage-check.png)

### 2. Dashboard Overview

![BuildWise Dashboard Overview](./v2/docs/images/workspace-dashboard-real.png)

### 3. Project & Delivery Overview

![BuildWise Project & Delivery Overview](./v2/docs/images/workspace-projects-real.png)

### 4. Requirements to Testing & Release Decisions

![BuildWise Requirements to Testing & Release Decisions](./v2/docs/images/workspace-iteration-real.png)

### 5. Project Modeling & Domain Modeling

![BuildWise Project Modeling & Domain Modeling](./v2/docs/images/workspace-modeling-real.png)

## How BuildWise Works

```text
Configure default policies in main window
        ↓
Bind independent workspace to each project
        ↓
Create iteration and upload requirements within project
        ↓
AI completes analysis, clarification, and boundary convergence
        ↓
Generate and advance deliverables, testing, and release review
        ↓
Rules, ontology, evidence, and decisions write back to project knowledge base
```

This means:

- `Project` is the long-term knowledge boundary;
- `Iteration` is the version context within a project;
- `Workspace` is the project runtime boundary, not a temporary conversation container.

## Who It's For

- **Product Managers**: Analyze requirements, confirm boundaries, review deliverables;
- **Technical Leads**: Review rule mappings, impact scope, and release gates;
- **QA**: Execute test matrices, verify blockers;
- **Business Owners**: View project overview, inquire about rules and risks.

Not for: Users who only want one-off content generation without delivery chains or knowledge accumulation.

## Current Implemented Capabilities

This repository is not a concept draft - it's already a fully functional frontend-backend integrated workbench.

### Project Space

- Three-tier structure: Project / Iteration / Deliverables, with project-level workspace isolation;
- Project knowledge directory `workspacePath/.buildwise/` for materialization, sharding, and retrieval;
- Multi-tenant hard isolation: DB-level `tenant_id` constraints + query-layer tenant scoping + owner branch convergence.

### Dual-Mode Delivery Engine

- **Phased Delivery Pipeline**: Requirements analysis → Clarification → Boundary convergence → Deliverables → Test matrix → Release review;
- **Agent Collaboration Desk**: Single Agent + Multi-project workspace + Project knowledge context injection;
- Release judgment provides `go / caution / block` three-state decisions with traceable evidence.

### Domain Modeling

- Project modeling and unified project model (Project / Iteration / ChangeControl / KnowledgeBase / ReleaseReview);
- Ontology (continuous-modeling): Structured accumulation of entities, rules, relationships, and constraints;
- Graph diff incrementals: Highlight new nodes + incremental merge refresh, ontology evolves with real code.

### Experience & Knowledge Accumulation

- Coding agent changes write back to ontology — code changes automatically write back to `codePaths`, ontology continuously evolves with real code;
- Project knowledge base continuously writes back: terminology, rules, relationships, decision logs, known risks;
- Experience accumulation supports sharded retrieval, reusable across iterations.

### Agent Orchestration

- Pluggable Agent execution backend: Adapter port + registry for integration, main implementation is ClaudeCodeCliAdapter, business layer doesn't depend on specific frameworks;
- Agent framework switchable: Declaration separated from runtime (adapter port + registry), framework changes don't affect business layer;
- Real Claude CLI adaptation has been end-to-end validated (dryRun execution + contract testing).

### Gates & Engineering Foundations

- Gate hardening: `policyGate` hard block + unified post-verification layer + bypass detection audit;
- Review gates: Blocking reviews must be resolved before release, release only after all resolved;
- DDD four-layer + TDD: Domain has zero external dependencies, single file ≤ 800 lines, tests first;
- SQLite storage (JSON backend deprecated, passing `json` silently downgrades to sqlite), Docker Compose one-click deployment.

## Tech Stack

| Layer | Selection |
|------|------|
| Backend | Node.js 22 · Fastify 5 · TypeScript 5 · DDD four-layer architecture |
| Data | SQLite (JSON backend deprecated, passing `json` silently downgrades to sqlite) · File-based workspace persistence |
| Frontend | React 18 · TypeScript 5 · Vite 8 · Biome · Tiptap rich text |
| AI | Zhipu GLM series (same source as backend `.env`, layered scheduling) |
| Agent | Pluggable execution backend (adapter port + registry) · Main implementation ClaudeCodeCliAdapter |
| Governance | `policyGate` hard block + unified post-verification + bypass audit · 6 quality inspection protocols · `verify:all` aggregated gates |
| Deployment | Docker Compose · Nginx · Non-root runtime |

## Project Structure

```text
BuildWise/
├── v2/                          # Current main implementation (frontend-backend integrated)
│   ├── src/                     # Frontend: React + Vite
│   │   ├── app/                 #   Application orchestration (AppController context)
│   │   ├── pages/               #   Pages (homepage / login / dashboard / project workbench)
│   │   ├── components/           #   UI components & deliverable rendering
│   │   ├── contexts/             #   React Context
│   │   ├── hooks/                #   Custom Hooks
│   │   ├── domain/               #   Frontend domain model
│   │   ├── infrastructure/       #   API client & runtime adaptation
│   │   └── shared/               #   Shared utilities
│   ├── backend/src/              # Backend: Fastify + TypeScript
│   │   ├── domain/               #   Pure business model (zero external dependencies, aggregate root boundaries)
│   │   ├── application/          #   Use case orchestration (calls domain + infrastructure)
│   │   ├── infrastructure/       #   Technical implementation (DB / LLM / Agent adaptation)
│   │   ├── interfaces/          #   Entry adaptation (routes / contract validation)
│   │   └── shared/               #   Shared utilities
│   ├── scripts/                  # Quality inspection, seeding, operation scripts
│   ├── tests/                    # Frontend unit tests
│   ├── docker-compose.yml        # Integrated orchestration
│   ├── Dockerfile / nginx.conf   # Image & reverse proxy
│   └── docs/                     # Demos & mechanism explanations
├── docs/                        # Execution version product & architecture baseline
│   └── versions/                 #   Version snapshots + backlog (archived per version)
├── CLAUDE.md                    # Engineering standards (automatically injected into Agent context)
├── CONTRIBUTING.md               # Contribution & documentation alignment standards
├── CHANGELOG.md                  # Change log
└── README.md                     # External positioning & overview
```

## Quick Start

Requirements: Node.js `>= 22` · npm `>= 10`.

### 1. Install Dependencies

```bash
cd v2
npm run install:all      # Install frontend + backend at once
```

### 2. Start Dev Stack

```bash
cd v2
npm run dev:stack:start  # Start frontend + backend simultaneously
```

### 3. Access Entries

- Homepage: `http://localhost:5173/#/`
- Dashboard: `http://localhost:5173/#/dashboard`
- Backend: `http://127.0.0.1:5055`

### 4. Prepare Demo Data (Optional)

```bash
cd v2
npm run seed:agentic:flow   # Rebuild demo data (includes 1 project / 2 iterations / project knowledge base)
```

## Pre-Launch Configuration

The backend reads configuration from `v2/backend/.env`. For production, each item must be confirmed:

```bash
cd v2/backend
cp .env.production.example .env

# Authentication (required for production)
AUTH_MODE=jwt                       # Use jwt for production, not off
JWT_SECRET=<openssl rand -hex 32>   # Must be explicitly set

# Network & Frontend
CORS_ORIGINS=https://your-domain
VITE_API_BASE=https://your-api      # Frontend explicitly points to backend

# Storage
STORAGE_BACKEND=sqlite              # JSON backend deprecated, passing json will be silently downgraded

# Each project binds to an independent workspacePath (absolute path), .buildwise/ must be readable/writable and included in backups
```

Controlled release verification:

```bash
cd v2/backend
npm run verify:prod-release   # Includes verify:prod-readiness + contract verification
```

## Common Commands

```bash
cd v2
npm run dev:stack:start              # Start frontend-backend dev stack
npm run dev:stack:stop               # Stop dev stack
npm run dev                          # Start frontend only
npm run build:all                    # Build frontend + backend together

npm run verify:all                   # Aggregated gates (hygiene/lint/boundaries/version/typecheck/build/test/readiness/backend production)
cd backend && npm run dev            # Start backend only
cd backend && npm run test:contract  # Contract testing (in-process + subprocess dual mode)

npm run seed:agentic:flow            # Rebuild demo data
npm run reset:business-env           # Restore clean production-ready initial business environment
npm run clean:workspace              # Clear workspace runtime artifacts
```

## Quality Gates

```bash
cd v2
npm run verify:all              # Frontend-backend aggregated verification

cd v2/backend
npm run verify:prod-readiness   # Backend production readiness gate
```

Notes:

- `verify:all` is the frontend-backend aggregated verification (hygiene / lint / boundaries / version discipline / typecheck / build / test / readiness report / backend production);
- `verify:prod-readiness` is the backend production readiness gate, including contract testing;
- The current branch has passed local release candidate gates, but final production release still depends on production configuration, SQLite chain, and deployment environment verification.

## Current Status

The current `main` branch can be considered **controlled production candidate**:

- Core boundary gates, build, type checking, and contract tests have passed;
- Project-level workspace isolation, project knowledge directory, and pluggable Agent execution backend have been implemented;
- Runtime semantics, health checks, readiness checks, authentication default behavior, and documentation have been finalized.

This does not mean "skip the launch process." Before actual production release, you must still confirm `AUTH_MODE=jwt`, `JWT_SECRET`, `CORS_ORIGINS`, `VITE_API_BASE`, independent `workspacePath`, and `.buildwise/` backup strategy according to the backend production documentation.

## Version History

Versions are archived as snapshots in `docs/versions/`. Each version passes 6 quality inspection protocols and `verify:all` before archiving. Currently archived to v0.32.0, v0.33.0 placeholder activated (pending project initiation).

| Version | Milestone | Status |
|------|--------|------|
| v0.6.0–v0.6.1 | V1 — Iteration declaration discipline established + Skill dead code cleanup | done |
| v0.7.0 | V2.1 — Agent adapter abstraction + registry | done |
| v0.8.0–v0.8.1 | V2.2 — ClaudeCodeCliAdapter + codeRewrite async + coding agent integration | done |
| v0.9.0 | V3 — Gate policyGate hard block + unified post-verification layer | done |
| v0.10.0 | V4 — Domain model/graph continuous accumulation + coding agent changes write back to ontology | done |
| v0.11.0 | dryRun real pipeline execution: ClaudeCodeCliAdapter end-to-end usable | done |
| v0.12.0 | Contract script rewrite: Restore production gate verify:prod-release | done |
| v0.13.0 | Backlog version ownership interaction optimization + three gates strengthened | done |
| v0.14.0–v0.16.0 | Fluency technical debt cleanup + health check remediation + policyGate/dual-state/changeImpact integration | done |
| v0.17.0–v0.19.0 | Multi-tenant data leakage fix + orchestration intent recognition + fullCycle integrates real codingAgent/OpenHands | done |
| v0.20.0–v0.22.0 | Specification drift correction + frontend side effect unit tests + owner branch convergence redesign | done |
| v0.23.0 | Multi-tenant DB-level tenant_id hard isolation | done |
| v0.24.0 | Highlight core values, solidify mainline increments (Set A meta-capability gates activated) | done |
| v0.25.0 | Ontology review resolution flow (Review gates upgraded to blocking reviews must be resolved before release) | done |
| v0.26.0 | Unified legacy item closure (Ontology chain + multi-tenant + frontend test debt) | done |
| v0.27.0 | Remaining technical debt unified closure (Write-back naming + oversized file splitting + Props Drilling evaluation) | done |
| v0.28.0 | Remaining technical debt cleanup (analysisService splitting + biome-ignore evaluation + frontend oversized + placeholder deletion) | done |
| v0.29.0 | Target platform dimension MVP closure (Release review aggregated by platform, gates block "false go") | done |
| v0.30.0 | Per-platform quality data + LLM per-platform review (Test matrix grouped by platform + code paths per-platform whitelist) | done |
| v0.31.0 | Per-platform display end-to-end execution verification (Real analysis output perPlatform + frontend DOM testing) | done |
| v0.32.0 | Pre-production hygiene closure (Backend lint warnings 12→0 type guard replacement ! + DEPLOY.md deployment runbook) | done |
| Future | v0.33.0 pending (candidates: frontend 181 lint cleanup / synthesizeTestMatrixOp repair loop / async full-cycle job) | planned |

## Documentation Navigation

- External positioning & overview: [README.md](./README.md)
- Frontend / Workbench operation & demos: [v2/README.md](./v2/README.md)
- Backend API, environment variables & production standards: [v2/backend/README.md](./v2/backend/README.md) · [v2/backend/docs/](./v2/backend/docs/)
- Documentation index & reading order: [docs/README.md](./docs/README.md)
- Version snapshots & backlog: [docs/versions/](./docs/versions/)
- Engineering standards (automatically injected into Agent context): [CLAUDE.md](./CLAUDE.md)
- Contribution & documentation alignment standards: [CONTRIBUTING.md](./CONTRIBUTING.md)
- Change log: [CHANGELOG.md](./CHANGELOG.md)

## License

[MIT](https://opensource.org/licenses/MIT)