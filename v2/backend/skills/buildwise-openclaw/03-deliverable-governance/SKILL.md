---
name: 03-deliverable-governance
description: Deliverable lifecycle governance SOP for draft-commit-confirm-chat flow. Use when BuildWise needs controlled artifact progression and conversational visibility.
---

# 03 Deliverable Governance

## Goal
Ensure each required deliverable is actionable, confirmable, and traceable in conversation.

## Inputs
- `artifact_workflow`
- `iteration_stage`
- `artifact_states`

## Outputs
- Unified contract JSON with:
  - Deliverable state transitions
  - Confirmation requirements
  - Chat insertion actions
  - Evidence list

## SOP
1. Create or update deliverable as `draft`.
2. Commit deliverable with `summary`, `source`, and `evidence`.
3. Request `confirm` when confirmation is mandatory.
4. Add confirmed or reviewable items to chat as clickable references.
5. Record unresolved items in `questions` and `next_actions`.

## Required Deliverables
- `analysis-report`
- `boundary-confirmation`
- `test-matrix`
- `release-review`

## Hard Rules
- Required deliverables cannot skip `draft -> committed`.
- Mandatory confirmation missing means `blocked`.
