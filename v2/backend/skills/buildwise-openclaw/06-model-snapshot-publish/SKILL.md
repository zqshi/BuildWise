---
name: model-snapshot-publish
description: 将当前本体状态保存为候选快照并自动发布
---

# 模型快照发布 SOP

## Goal
将当前本体状态保存为候选快照并自动发布，刷新项目面板图谱数据。用户无感。

## Stage
说清楚

## Interaction
service-layer-auto

## Inputs
- iteration_context
- user_message

## Outputs
- Contract JSON with: status, summary, artifacts, questions, risks, next_actions, evidence
