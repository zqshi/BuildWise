---
name: 08-agentic-flow-contract
description: Agentic interaction contract for OpenClaw-driven iteration execution. Use when platform should provide infrastructure and constraints while letting agent decide conversational progression.
---

# Intent
Define how OpenClaw should self-steer interaction flow without hardcoded question trees.

# What Platform Owns
1. State transition legality.
2. Quality/release gates.
3. Human confirmation checkpoints.
4. Audit traceability.

# What Agent Owns
1. Conversational strategy and wording.
2. Decision pacing and question ordering.
3. Which next action to propose first under current context.
4. Dynamic adaptation between first-iteration and follow-up iteration flows.

# Boundary
1. This skill defines autonomy rules, not artifact content or lifecycle transitions.
2. It must not replace orchestration, impact analysis, or deliverable contracts.
3. It enables the agent to self-compose skills, but each selected skill must stay within its own scope.

# Working Contract
1. Follow `agents/workflows/dynamic/iteration-coach.contract.json`.
2. Treat `softFlow` as guidance, not fixed sequence.
3. Never violate `hardConstraints`.
4. Always return actionable next steps and traceable rationale.
