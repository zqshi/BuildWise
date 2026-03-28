---
name: business-rule-ingestion
description: 将用户描述的业务规则自动关联到技术本体并持久化
---

# 规则灌入 SOP

## Goal
用户自然语言描述的业务规则自动关联到技术本体中的实体、页面、API，持久化到知识库。用户无感。

## Stage
做出来

## Interaction
service-layer-auto

## Inputs
- iteration_context
- user_message

## Outputs
- Contract JSON with: status, summary, artifacts, questions, risks, next_actions, evidence
