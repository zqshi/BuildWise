---
name: 05-exception-recovery
description: Exception detection and recovery SOP for runtime, sync, and test failures. Use when BuildWise must stop unsafe flow, present recovery options, and resume with user-approved path.
---

# 05 Exception Recovery

## Goal
Convert failure signals into controlled recovery decisions without losing iteration continuity.

## Boundary
- This skill only operates when an exception or unsafe state exists.
- It must not perform normal-stage planning.
- It must not overrule audit, release, or artifact content contracts outside the recovery context.

## Inputs
- `runtime_signals`
- `sync_status`
- `test_status`
- `dependency_health`

## Outputs
- Unified contract JSON with:
  - Exception summary
  - Recovery option A/B
  - User decision request
  - Resume action and evidence

## SOP
1. Detect exception type and affected stage.
2. Build at least two recovery paths with trade-offs.
3. Ask user to choose path and record decision.
4. Execute selected recovery and return to orchestrator.
5. Add trace record for post-mortem and audit.

## Hard Rules
- Never auto-release under exception state.
- If no safe recovery exists, return `blocked`.
