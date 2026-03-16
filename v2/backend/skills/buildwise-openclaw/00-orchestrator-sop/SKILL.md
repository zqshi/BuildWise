---
name: 00-orchestrator-sop
description: Single-agent orchestration SOP for iteration lifecycle governance. Use when BuildWise needs to route stage execution, apply confirmation gates, and return a unified skill contract with evidence.
---

# 00 Orchestrator SOP

## Goal
Drive one iteration end-to-end with one agent, enforce gates, and produce one unified contract.

## Boundary
- This skill owns orchestration only.
- It may choose, order, and combine downstream skills dynamically.
- It must not replace the specialized work of child skills with generic summaries.
- It must not skip a needed child skill when that skill owns the required concern.

## Inputs
- `iteration_context`
- `runtime_config`
- `previous_iteration`
- `user_message`

## Outputs
- Unified contract JSON:
  - `status`
  - `summary`
  - `artifacts`
  - `questions`
  - `risks`
  - `next_actions`
  - `evidence`

## SOP
1. Validate preconditions.
2. Resolve current stage: `clarification -> scope -> development -> testing -> release -> archive`.
3. Select and invoke downstream skills for the stage.
4. Aggregate child skill results into one contract draft.
5. Apply gate rules and finalize status.
6. Return contract and append evidence pointers.

## Gate Rules
- If first-iteration Git analysis report is not confirmed, block `scope`.
- If any child skill returns `error`, downgrade to `need_user_input`.
- If mandatory artifact confirmation is missing, return `blocked`.

## Failure Handling
- On missing input: return `need_user_input` with explicit question list.
- On runtime/tool failure: return `error` with one recovery action.
- Never output conclusion without `evidence`.
