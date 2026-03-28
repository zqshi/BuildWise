---
name: baseline-evolution
description: 将本轮迭代本体快照标记为基线，继承到下一迭代
---

# 基线演进 SOP

## Goal
将本轮迭代的本体快照标记为基线，继承到下一迭代作为起点。用户无感。

## Stage
交出去

## Interaction
service-layer-auto

## Inputs
- iteration_context
- user_message

## Outputs
- Contract JSON with: status, summary, artifacts, questions, risks, next_actions, evidence
