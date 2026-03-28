---
name: ontology-extraction
description: 从分析结果中自动抽取本体术语、业务实体、关系和规则
---

# 本体抽取 SOP

## Goal
从分析结果中自动抽取本体术语、业务实体、业务关系、业务规则，写入 KB。用户无感。

## Stage
说清楚

## Interaction
service-layer-auto

## Inputs
- iteration_context
- user_message

## Outputs
- Contract JSON with: status, summary, artifacts, questions, risks, next_actions, evidence
