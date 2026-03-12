---
name: 02-impact-analysis
description: Impact analysis SOP based on ontology and dependency propagation. Use when BuildWise needs impact scope, risk grading, and minimal executable change set.
---

# 02 Impact Analysis

## Goal
Estimate real change surface and prioritize safe implementation order.

## Inputs
- `change_events`
- `ontology_map`
- `dependency_graph`

## Outputs
- Unified contract JSON with:
  - Impacted nodes and boundaries
  - `high/medium/low` risk assessment
  - Minimal executable action list
  - Evidence references

## SOP
1. Identify changed nodes across requirement, code, and config.
2. Propagate impact through dependency graph.
3. Cluster impact by module and business capability.
4. Grade risk by breadth, criticality, and uncertainty.
5. Output smallest viable repair plan for next execution step.

## Hard Rules
- No high-confidence claim without evidence.
- If impact uncertainty is high, return `need_user_input` with targeted questions.
