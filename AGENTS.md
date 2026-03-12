# BuildWise Agent Workflow

## Default Execution Rule (Mandatory)
For any new request without sufficient context, the agent must complete the following steps before implementation:

1. Read project history and current state
- Check relevant git history (`git log`, recent commits, current branch status, and local uncommitted changes).
- Read related existing docs/code/tests before proposing changes.

2. Scope framing
- Define in-scope and out-of-scope explicitly.
- Confirm assumptions, constraints, and acceptance criteria.

3. Impact detection
- Analyze impact on: code modules, APIs/contracts, data/schema, config/env, deployment/runtime, and tests.
- Identify cross-module dependencies and potential regressions.

4. Risk assessment
- Provide risk level (low/medium/high) with concrete risk points.
- Provide mitigation, verification plan, and rollback approach.

5. Implement and validate
- Only start implementation after steps 1-4 are complete.
- Run targeted validation/tests and summarize results.

## Change Safety
- Prefer minimal, reversible changes.
- Do not use destructive git/file operations unless explicitly requested.
- If unexpected unrelated workspace changes are detected, stop and ask how to proceed.

## Applicability
- This workflow applies to every new conversation in this repository by default.

## Highest Declaration (Top Priority, Mandatory)
The following principles override all routine preferences and must always be enforced:

1. Development paradigm
- Use DDD + TDD as the default engineering paradigm.
- Any behavior change must include corresponding automated tests in the same change set.
- Keep domain boundaries explicit and avoid cross-layer leakage.

2. File size and boundary governance
- Any document/code/script file must stay under 1000 lines.
- Existing legacy files over 1000 lines must be tracked explicitly and continuously reduced.
- New over-limit files are forbidden.
- Keep each file focused on a single, clear responsibility; avoid redundant logic.

3. Redundancy elimination
- Do not keep redundant docs/scripts/code.
- When introducing a new artifact, verify no existing artifact already covers the same responsibility.
- Prefer extraction/reuse over copy-paste.

4. Systemic impact thinking for every change
- Before editing, analyze impact on architecture, contracts, data, runtime, tests, and operations.
- After editing, run relevant quality gates and verify no regressions.
- Keep docs, scripts, and checks synchronized with implementation changes immediately.

5. Timeliness and consistency
- Every completed change must update related docs and validation scripts in the same round.
- Do not leave “update later” gaps for governance-critical content.
