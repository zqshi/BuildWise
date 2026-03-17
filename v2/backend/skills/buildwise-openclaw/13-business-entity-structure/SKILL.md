---
name: 13-business-entity-structure
description: Build structured business entities, relations, and capabilities from business input and ontology-confirmed terms.
---

# 13 Business Entity Structure

## Goal

Convert confirmed business meaning into candidate entities, relations, fields, and capability structure.

## Boundary

- This skill only structures business objects.
- It must not define release gates or override ontology confirmation.
- It must not force business users to provide code-level object names.

## Inputs

- `project_model_snapshot`
- `ontology_updates`
- `business_rule_input`
- `current_iteration_artifacts`

## Outputs

- Unified contract JSON with:
  - `summary`
  - `model_updates`
  - `questions`
  - `risks`
  - `evidence`

## SOP

1. Read confirmed ontology terms and current iteration business input.
2. Identify candidate entities, fields, relations, and business capabilities.
3. Flag any ambiguous structure as confirmation questions.
4. Emit only structure-ready updates with supporting evidence.
