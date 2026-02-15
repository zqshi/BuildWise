# Requests Active Profile

当前推荐执行：`REQ-200 ~ REQ-211`（单系统叠加）

不推荐执行：`REQ-030 ~ REQ-041`（历史多页面策略）

快速执行：

```bash
cd /Users/zqs/Downloads/project/BuildWise
python3 autoboot/pipeline.py autoloop --from 200 --goal-req 211
```

默认会跳过 deprecated 请求；如需包含历史请求，显式加 `--include-deprecated`。
