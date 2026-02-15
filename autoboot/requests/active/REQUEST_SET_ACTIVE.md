# Active Request Set

- 模式：单系统叠加（additive）
- 状态：ACTIVE
- 生效区间：REQ-200 ~ REQ-211
- 生成来源：`python3 autoboot/pipeline.py gen-requests --start-req 200 --overwrite`

## 使用方式

```bash
python3 autoboot/pipeline.py autoloop --from 200 --goal-req 211
```

## 禁用区间

- REQ-030 ~ REQ-041：历史多页面策略，已停用（仅保留追溯）。
