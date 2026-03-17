---
name: 14-production-delivery-loop
description: Production delivery loop contract for prototype-driven implementation and test execution. Use when OpenClaw must push code-delivery and test-matrix through iterative repair until outputs are production-usable instead of one-shot drafts.
---

# 14 Production Delivery Loop

## Goal
Force OpenClaw to treat implementation and testing as a loop, not a single generation step.

The loop exists to ensure generated code is actually deliverable for production handoff:
- implementation must be grounded in the approved prototype and design decisions
- tests must validate the changed business flow and inherited regression paths
- failures must feed back into architecture, code, or test artifacts until release readiness is defensible

## Boundary
- This skill only governs prototype-driven implementation and validation loop execution.
- It does not replace artifact content requirements from `09-deliverable-content-contract`.
- It does not replace cross-stage quality gates from `11-product-rd-quality-contract`.
- It does not decide release go/block; `06-quality-release-gate` owns that final decision.

## Use When
- The active stage is `development`, `testing`, or `release`.
- The user asks for code generation, implementation, test completion, production readiness, or deployment confidence.
- A prototype or design artifact exists and downstream code/test delivery must become production-usable.
- Test results expose blockers that require iterative repair.

## Inputs
- `prototype_preview`
- `design_spec`
- `technical_architecture`
- `code_delivery`
- `test_matrix`
- `release_review`
- `business_rules`
- `project_model_view`
- `iteration_context`

## Outputs
- Unified contract JSON with:
  - `loop_state` (`need_prototype_alignment|need_arch_alignment|implementing|testing|repairing|ready_for_release`)
  - `repair_actions`
  - `blocked_by`
  - `evidence`
  - `next_actions`

## Core Loop
1. Confirm prototype fidelity:
   - changed interaction path is explicit
   - unchanged inherited path is explicit
   - primary, edge, and failure states are visible
2. Align implementation boundary:
   - architecture defines modules, state/data flow, interfaces, rollback point
   - code scope maps to changed interaction and business rules
3. Generate or revise code:
   - do not emit template-only code
   - do not ignore inherited unchanged capabilities
   - do not skip error handling, loading states, or rollback assumptions
4. Generate or revise test matrix:
   - cover happy path
   - cover business-rule path
   - cover regression path
   - cover failure and rollback-sensitive path
5. Evaluate loop result:
   - if code cannot be traced to prototype/design/rules, go back to implementation alignment
   - if tests do not cover the changed scope or regression scope, go back to test repair
   - if blockers remain, stay in loop and return concrete repair actions
6. Only when code and tests are both defensible may the workflow move toward release review

## Hard Rules
- Never treat code generation as complete only because a `code-delivery` artifact exists.
- Never generate code before the approved prototype/design path is explicit enough to implement.
- Never let `test-matrix` be UI-click-only when business rules or state transitions changed.
- Never unlock release review when blocking test failures remain unresolved.
- Always return the next repair step in natural execution language so OpenClaw can continue acting like a digital employee.

## Production Readiness Checklist
- prototype path and code path are traceable
- business rules are reflected in implementation logic
- loading, empty, error, and rollback-sensitive states are handled
- changed scope has delta tests
- inherited critical path has regression tests
- blockers and retest plan are explicit

## Reject As Incomplete
- prototype is only a shell and not the actual changed interaction
- architecture omits interfaces or rollback point
- code artifact is only narrative summary or code fragment without execution boundary
- test matrix omits regression coverage or business-rule validation
- release is requested while loop blockers still exist
