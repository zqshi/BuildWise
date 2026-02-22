# Repository Mode Design

## Goal

Provide a dual-track repository strategy:

- Git-first for production governance.
- Managed local repository for fast bootstrap/offline development.

## Repository Modes

- `external_git`
  - External Git is the primary source of truth.
  - Recommended for enterprise projects.
- `managed_local`
  - Local managed repository is primary.
  - Suitable for PoC/sandbox and offline scenarios.
- `hybrid`
  - Local managed repository + remote binding.
  - Recommended migration path from PoC to production.

## Governance Policy

Repository governance is stored per project:

- `requireRemoteForProduction` (default `true`)
- `requireRemoteForStaging` (default `false`)

Deployment gate uses these policies with repository health:

- If remote is required and repo mode is `managed_local`, block deployment.
- If remote is required and remote is not configured, block deployment.
- If remote is required and remote is unreachable, block deployment.

## Health Model

Repository health is refreshed by status API and repository operations.

- `remoteConfigured`
- `remoteReachable`
- `remoteSynced`
- `lastCheckedAt`
- `lastError`

Health derivation:

- Local workspace check: `.git` existence and git initialization.
- Remote configuration check: `git remote get-url origin`.
- Remote reachability check: `git ls-remote --heads origin`.
- Sync check: `git rev-list --left-right --count origin/<defaultBranch>...HEAD`.

## APIs

- `GET /api/projects/:id/repository`
- `POST /api/projects/:id/repository/bootstrap`
- `POST /api/projects/:id/repository/mode`
- `GET /api/projects/:id/repository/status`
- `POST /api/projects/:id/repository/provision`
- `POST /api/projects/:id/repository/scaffold`

## Publish Policy

- Dry-run publish is allowed in all modes.
- Non-dry-run publish in `managed_local` mode is blocked until remote binding exists.
