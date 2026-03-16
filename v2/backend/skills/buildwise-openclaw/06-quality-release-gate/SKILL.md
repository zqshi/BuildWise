---
name: 06-quality-release-gate
description: Quality and release gate SOP for go-caution-block decisions. Use when BuildWise needs objective release decision, rollback guidance, and risk watchlist.
---

# 06 Quality Release Gate

## Goal
Produce a transparent release decision with clear thresholds and rollback expectations.

## Boundary
- This skill only decides release readiness and rollback expectations.
- It must not classify cross-iteration scope or generate full artifact content.
- It must not continue execution after a blocked decision; recovery must be delegated.

## Inputs
- `test_matrix`
- `acceptance`
- `risks`
- `blocking_issues`

## Outputs
- Unified contract JSON with:
  - Gate decision: `go|caution|block`
  - Decision rationale
  - Rollback guidance
  - Post-release watch items

## SOP
1. Calculate pass rate and blocking issue count.
2. Check acceptance completion and unresolved risk severity.
3. Output gate decision with rationale.
4. Add rollback and observation checklist.
5. Mark required follow-up actions.

## Decision Rules
- If any blocker exists: `block`.
- If pass rate >= 95% and no blocker: `go`.
- Otherwise: `caution`.
