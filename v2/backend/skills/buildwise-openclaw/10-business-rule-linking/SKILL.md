---
name: 10-business-rule-linking
description: Business rule linking SOP for connecting domain knowledge, policy constraints, and natural-language rule input to engineering ontology after prototype or implementation exists.
---

# 10 Business Rule Linking

## Goal
Let business users inject domain knowledge and business rules without editing code, while keeping those rules traceable to pages, components, APIs, states, tests, and release constraints.

## Boundary
- This skill only links business knowledge to engineering objects.
- It must not replace ontology mapping, impact analysis, release gates, or artifact lifecycle control.
- It may declare ambiguity or conflict, but orchestration decides whether to block or continue.

## Use When
- The user adds or revises domain knowledge in natural language.
- Prototype, design, frontend, backend, or test artifacts already exist and need business-rule association.
- Business rules need to be mapped to execution boundaries without requiring developers to rewrite implementation first.

## Inputs
- `business_rule_input`
- `project_knowledge_base`
- `engineering_ontology`
- `current_iteration_artifacts`
- `baseline_iteration`

## Outputs
- Unified contract JSON with:
  - linked business rules
  - affected engineering objects
  - unresolved conflicts
  - downstream artifact updates required
  - evidence references

## SOP
1. Parse business rule input into:
   - terms
   - constraints
   - conditions
   - exceptions
   - acceptance signals
2. Resolve whether each rule is:
   - new
   - inherited
   - changed
   - contradictory
3. Link rules to:
   - pages or surfaces
   - components
   - APIs or data structures
   - state transitions
   - test cases
4. Emit required downstream updates:
   - PRD
   - design-spec
   - technical-architecture
   - code-delivery
   - test-matrix
5. Write back reusable project knowledge candidates for future iterations.

## Hard Rules
- Never leave a confirmed business rule unlinked to engineering objects if implementation already exists.
- If a rule changes release behavior, test scope, or state legality, mark it as high impact.
- If a rule conflicts with current implementation and no safe mapping exists, return `need_user_input`.
- Business users should only confirm business meaning; they must not be forced to handwrite code paths.
