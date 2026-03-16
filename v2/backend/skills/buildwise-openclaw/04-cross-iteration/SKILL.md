---
name: 04-cross-iteration
description: Cross-iteration governance SOP for inheritance and diffs. Use when BuildWise needs carry-over decisions, regression awareness, and explicit unchanged scope.
---

# 04 Cross Iteration

## Goal
Maintain continuity across iterations while making diffs explicit and auditable.

## Boundary
- This skill only handles inheritance and delta classification.
- It must not own first-iteration baseline analysis.
- It must not decide release gates or produce recovery execution plans.

## Inputs
- `current_iteration`
- `baseline_iteration`
- `carry_over_context`

## Outputs
- Unified contract JSON with:
  - `inherited/new/changed/removed` classification
  - Regression risk and verification hints
  - User-facing confirmation message
  - Evidence links

## SOP
1. Compare current iteration with baseline snapshot.
2. Classify items into inherited, new, changed, and removed.
3. Generate regression focus list and validation suggestions.
4. Draft user confirmation message for boundary acceptance.
5. Append cross-version evidence and decision notes.

## Hard Rules
- Always output explicit `unchanged` scope.
- If baseline is missing, return `need_user_input` with fallback path.
