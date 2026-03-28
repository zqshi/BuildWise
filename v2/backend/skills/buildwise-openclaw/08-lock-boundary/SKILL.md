---
name: lock-boundary
description: 与用户确认本轮迭代范围，锁定验收标准
---

# 边界锁定 SOP

## Goal
与用户确认本轮迭代的范围（做什么、不做什么），产出边界确认（boundary-confirmation artifact），锁定验收标准。

## Stage
定边界

## Interaction
dialogue+card

## Inputs
- iteration_context
- user_message

## Outputs
- Contract JSON with: status, summary, artifacts, questions, risks, next_actions, evidence
