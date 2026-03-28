---
name: ontology-collision
description: 检测新抽取本体与已有知识库的冲突并消解
---

# 碰撞检测 SOP

## Goal
检测新抽取的本体与已有知识库的冲突（同义术语、矛盾规则），自动消解或标记。用户无感。

## Stage
说清楚

## Interaction
service-layer-auto

## Inputs
- iteration_context
- user_message

## Outputs
- Contract JSON with: status, summary, artifacts, questions, risks, next_actions, evidence
