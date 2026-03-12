---
name: 01-ontology-mapping
description: Ontology mapping SOP for requirement-component-code-test traceability. Use when BuildWise needs structured domain mapping and missing-link detection before impact analysis.
---

# 01 Ontology Mapping

## Goal
Build a trace map from business requirement to implementation and verification units.

## Inputs
- `requirements`
- `code_index`
- `repo_metadata`

## Outputs
- Unified contract JSON with:
  - Traceability summary
  - Missing mapping list
  - Confidence notes
  - Evidence links

## SOP
1. Extract requirement entities, rules, and constraints.
2. Build component and code-node candidates from repository metadata.
3. Map chain: `requirement -> component -> code_path -> test_case`.
4. Detect missing or low-confidence links.
5. Produce artifact-ready summary for downstream impact analysis.

## Quality Rules
- Do not infer critical links without evidence.
- Mark uncertain links as questions instead of conclusions.
- Keep mapping minimal and non-redundant.
