---
name: 12-model-snapshot-reconcile
description: Reconcile the current iteration input against the baseline model snapshot and emit candidate snapshot updates, conflicts, and review tasks.
---

# 12 Model Snapshot Reconcile

## Goal

Turn iteration input into structured candidate model changes against the latest published snapshot.

## Boundary

- This skill only compares and reconciles snapshots.
- It must not decide release readiness or final business approval.
- It must not bypass missing evidence with narrative guesswork.

## Inputs

- `project_model_snapshot`
- `baseline_model_snapshot`
- `iteration_context`
- `candidate_changes`

## Outputs

- Unified contract JSON with:
  - `summary`
  - `model_updates`
  - `review_tasks`
  - `risks`
  - `evidence`

## SOP

1. Load the latest published baseline snapshot.
2. Compare current candidate changes to baseline terms, entities, relations, and rules.
3. Classify each change as `new`, `inherited`, `changed`, or `conflicting`.
4. Emit candidate snapshot updates and blocking review tasks.
5. Mark any evidence gaps instead of inventing conclusions.
