---
name: 11-product-rd-quality-contract
description: Product R&D quality contract for high-quality end-to-end product delivery, covering UX design rules, prototype fidelity, implementation completeness, test coverage, and release readiness.
---

# 11 Product R&D Quality Contract

## Goal
Ensure BuildWise meets a high-quality product研发流程 instead of only producing stage artifacts that are present but weak.

## Boundary
- This skill only defines cross-stage quality requirements.
- It must not own artifact lifecycle transitions or business-rule linkage resolution.
- It may mark a stage as incomplete, but orchestration decides whether to block or request more input.

## Use When
- The agent is deciding whether current stage outputs are strong enough to unlock the next stage.
- The user expects complete UX design, prototype, code, and test handoff quality.
- The current workflow appears structurally complete but operationally weak.

## Inputs
- `analysis_report`
- `prd`
- `boundary_confirmation`
- `prototype_preview`
- `design_spec`
- `technical_architecture`
- `code_delivery`
- `test_matrix`
- `release_review`

## Outputs
- Unified contract JSON with:
  - stage quality verdicts
  - missing handoff details
  - blocked downstream steps
  - evidence-backed risks
  - next repair actions

## Quality Gates By Stage

### Clarification Quality
- `analysis-report` and `product-requirements-doc` must align on:
  - target user
  - problem statement
  - scope boundary
  - acceptance criteria
- If PRD acceptance criteria do not map to the analysis scope, do not unlock design or development.

### UX / Prototype Quality
- `prototype-preview` must reflect the actual target interaction, not a template shell.
- `design-spec` must be implementation-ready:
  - layout
  - typography
  - color usage
  - spacing
  - state behavior
  - responsive notes
  - motion or feedback rules when relevant
- If prototype and design-spec disagree, do not unlock code generation.

### Engineering Quality
- `technical-architecture` must expose:
  - module boundaries
  - state/data flow
  - API boundaries
  - failure handling
  - rollback point
- `code-delivery` must map back to:
  - requirements
  - UX decisions
  - business rules
- If code cannot be traced back to UX or requirements, mark quality insufficient.

### Test Quality
- `test-matrix` must cover:
  - happy path
  - edge cases
  - regression paths
  - business-rule validation
  - release-blocking failures
- If business rules changed but test cases did not, mark testing incomplete.

### Release Quality
- `release-review` must explain:
  - what ships
  - what is deferred
  - residual risk
  - rollback plan
  - watch items
- If rollback cannot be executed from current artifacts, block release.

## SOP
1. Receive all current stage artifacts and iteration context.
2. Evaluate each stage output against its quality gate criteria.
3. Cross-check alignment between connected artifacts (e.g., PRD vs analysis, prototype vs design-spec, code vs requirements).
4. For each stage, emit a verdict: pass, incomplete, or blocked with evidence.
5. Identify missing handoff details and blocked downstream steps.
6. Return unified contract JSON with stage verdicts, risks, and repair actions.

## Hard Rules
- Never unlock a downstream stage only because an artifact exists.
- UX handoff requires both interaction fidelity and design-operational detail.
- Code handoff requires requirement traceability and business-rule traceability.
- Test handoff requires explicit business-rule coverage, not only UI clicks or API success.
