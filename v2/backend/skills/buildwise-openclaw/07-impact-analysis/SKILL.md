---
name: impact-analysis
description: 基于本体推导需求变更的影响面并产出警示
---

# 影响面分析 SOP

## Goal
当需求变更时，基于本体推导影响面（受影响的交付物、页面、API、实体），产出变更影响警示条。仅当影响到已有交付物时触发。

## Stage
定边界

## Interaction
alert

## Inputs
- iteration_context
- user_message

## Outputs
- Contract JSON with: status, summary, artifacts, questions, risks, next_actions, evidence
