---
name: 07-audit-trace
description: Audit and trace SOP for full-chain replayability. Use when BuildWise needs evidence-complete logs for decisions, artifacts, and skill executions.
---

# 07 Audit Trace

## Goal
Guarantee every output in iteration flow can be traced, explained, and replayed.

## Inputs
- `skill_calls`
- `decisions`
- `artifacts`
- `conversation_refs`

## Outputs
- Unified contract JSON with:
  - Audit summary
  - Replay index (`iterationId`, `messageId`, `artifactId`)
  - Evidence completeness result
  - Follow-up repair actions for missing traces

## SOP
1. Record each skill call input/output snapshot.
2. Link each decision to explicit evidence.
3. Build replay index for iteration, message, and artifact.
4. Flag missing evidence and generate repair actions.
5. Return final audit trace contract.

## Hard Rules
- No conclusion without traceable evidence.
- If key evidence is missing, return `need_user_input` or `blocked`.
