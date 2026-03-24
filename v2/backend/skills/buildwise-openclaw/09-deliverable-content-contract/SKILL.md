---
name: 09-deliverable-content-contract
description: Content contract for stage deliverables. Use when BuildWise needs PRD, design specification, technical architecture, code delivery, test, and release artifacts to be complete enough for downstream execution instead of placeholder summaries.
---

# 09 Deliverable Content Contract

## Goal
Force every stage deliverable to contain actionable business and engineering content that can drive the next stage.

## Boundary
- This skill only defines what a deliverable must contain.
- It must not own lifecycle transitions, cross-iteration diffing, release gate decisions, or exception recovery.
- It may declare an artifact incomplete, but orchestration decides what to do next.

## Use When
- The agent is generating or revising stage deliverables.
- The user asks for more complete artifact content.
- The current artifact is structurally present but operationally empty.

## Inputs
- `iteration_type` (`first` or `follow_up`)
- `current_stage`
- `baseline_iteration`
- `change_scope`
- `impact_analysis`
- `artifact_workflow`

## Outputs
- Unified contract JSON with:
  - `artifacts[]` enriched with content completeness notes
  - `questions` only for truly missing mandatory decisions
  - `risks` tied to specific downstream work
  - `next_actions` that name the next artifact or execution step
  - `evidence` pointing to user input, baseline, impacted area, or prior artifact

## Core Rule
An artifact is invalid if it cannot directly guide the next stage's work.

## Required Content By Deliverable

### `analysis-report`
Must answer what this iteration is doing and why.

For `first` iteration, include:
- business goal
- target users or business objects
- in-scope and out-of-scope
- critical constraints
- unresolved decisions needing confirmation
- recommended next stage

For `follow_up` iteration, include:
- inherited capabilities from baseline
- new / changed / removed scope
- unchanged scope explicitly listed
- impacted pages, modules, APIs, and tests
- regression risks
- rollback boundary if the delta fails

Reject as incomplete if it only contains generic summary text.

### `product-requirements-doc`
Use when scope is large enough that a standalone PRD is needed beyond `analysis-report`.

Must include:
- problem statement
- user scenarios
- functional requirements
- non-functional requirements
- exclusions
- acceptance criteria
- dependency or external system assumptions

Reject as incomplete if it does not define acceptance criteria.

### `boundary-confirmation`
Must convert analysis into an execution boundary.

Must include:
- included work
- excluded work
- impacted components
- impacted code paths or service areas
- acceptance boundary
- human confirmation result or pending question

Reject as incomplete if scope and exclusion are not both explicit.

### `prototype-preview`
Must show the actual affected interaction outcome, not a generic mock shell.

Must include:
- affected page or surface
- layout or interaction change
- primary action path
- state changes
- preserved unchanged UI areas for follow-up iterations

Reject as incomplete if it does not reflect the actual changed interaction.

### `design-spec`
Use alongside `prototype-preview` whenever UI changes are non-trivial.

Must include:
- visual direction
- layout rules
- typography
- color and emphasis rules
- spacing and component behavior
- responsive notes
- interaction or motion expectations

Reject as incomplete if it only says "modern", "clean", or other non-operational adjectives.

### `technical-architecture`
Use when implementation affects multiple modules, services, or interfaces.

Must include:
- module or service responsibilities
- data flow
- interface or API boundary
- dependency changes
- migration or compatibility notes
- failure handling and rollback point

Reject as incomplete if it lacks data flow or interface boundary.

### `code-delivery`
Must explain what was implemented and what remains inherited.

Must include:
- changed modules or files
- newly added capabilities
- inherited unchanged capabilities
- feature flags or rollout assumptions
- known limitations
- direct relation to requirements or design decisions

Reject as incomplete if it is only a code diff summary without business mapping.

### `test-matrix`
Must prove the current increment is safe enough for release review.

Must include:
- delta tests for new or changed scope
- regression tests for inherited critical paths
- execution result per case
- blocking issues
- retest requirements after rollback or fix

Reject as incomplete if there are no regression cases for follow-up iterations.

### `release-review`
Must explain the release decision in operational terms.

Must include:
- gate result (`go|caution|block`)
- blockers or residual risks
- rollback plan
- post-release watch items
- what is included in this release and what is deferred

Reject as incomplete if rollback guidance is missing.

### `delivery-package`
Must become the next iteration's baseline input.

Must include:
- final accepted scope
- shipped artifacts
- deferred items
- baseline references for next iteration
- post-mortem or follow-up watchlist when applicable

Reject as incomplete if next iteration cannot inherit from it.

## Stage Mapping
- `clarification`: `analysis-report`, optional `product-requirements-doc`
- `scope`: `boundary-confirmation`
- `interaction`: `prototype-preview`, optional `design-spec`
- `development`: optional `technical-architecture`, required `code-delivery`
- `testing`: `test-matrix`, optional `acceptance-checklist`
- `release`: `release-review`
- `archive`: `delivery-package`

## SOP
1. Receive current stage deliverable and iteration context.
2. Match deliverable type to required content checklist from Stage Mapping.
3. Evaluate each required section for presence and operational completeness.
4. If iteration is `follow_up`, verify inherited/unchanged scope is explicit.
5. Mark deliverable as complete, incomplete, or `need_user_input` with missing decision list.
6. Return enriched contract JSON with content completeness notes, questions, risks, next actions, and evidence.

## Hard Rules
- Never emit placeholder prose to satisfy artifact presence.
- Never omit `unchanged` scope for follow-up iterations.
- Never let UI or architecture artifacts become style-only or code-only fragments without execution guidance.
- If required content is missing, return `need_user_input` with the minimum missing decision list.
