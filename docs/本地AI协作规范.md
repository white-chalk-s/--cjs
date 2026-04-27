# 本地 AI 协作规范

本文档定义“平台 + 本地 AI Worker + 本地模型服务”的协作方式。目标是让本地 AI 在用户机器上完成推理，再把结果回传平台保存和展示。

## 1. 总原则

- 平台只负责：提供数据、提供模板、接收结果、保存结果、展示结果
- 本地 AI 负责：读取平台发来的任务包、在本地完成推理、输出结构化总结
- 二者之间只通过 HTTP API 交互，不直接共享数据库文件
- 所有输入输出都要按本文档的字段约定执行，不能靠临时口头约定
- 任务协议和结果协议都要版本化，后续字段演进必须兼容旧版本

## 2. 角色分工

### 2.1 平台

- 从 SQLite 读取某一天、某一周、某一月的记录
- 组装标准任务包
- 向前端展示任务包、已保存总结、源数据统计
- 接收本地 AI 回传的总结结果
- 将总结结果落库到 `ai_summaries`

### 2.2 本地 Worker

- 从平台拉取任务包
- 把任务包交给本地模型服务，或者在本地直接做规则生成
- 将最终总结结果 POST 回平台
- 负责重试、日志、错误上报

### 2.3 本地模型服务

- 只负责推理，不直接访问平台数据库
- 输入为任务 JSON
- 输出为总结 JSON
- 可以是 Ollama、llama.cpp、OpenAI 兼容接口、脚本，或你自定义的本地服务

## 3. 当前接口

### 3.1 获取任务

```http
GET /api/summaries/task?summaryType=daily&targetDate=2026-04-27
```

### 3.2 查询已保存总结

```http
GET /api/summaries?summaryType=daily&targetDate=2026-04-27
```

### 3.3 回传总结

```http
POST /api/summaries/ingest
Content-Type: application/json
```

推荐请求体：

```json
{
  "summaryType": "daily",
  "targetDate": "2026-04-27",
  "summary": {
    "title": "2026-04-27 总结",
    "overview": "......"
  }
}
```

## 4. 任务包协议

平台返回给本地 AI 的任务包，核心字段如下：

```json
{
  "taskId": "summary_xxx",
  "summaryType": "daily",
  "period": {
    "summaryType": "daily",
    "periodKey": "2026-04-27",
    "start": "2026-04-27",
    "end": "2026-04-28",
    "label": "2026-04-27",
    "anchorDate": "2026-04-27"
  },
  "template": "请基于当天事件节点输出结构化日总结......",
  "sourceStats": {
    "dayCount": 1,
    "entryCount": 3,
    "imageCount": 2
  },
  "sourceDays": [
    {
      "dayId": "day_xxx",
      "recordDate": "2026-04-27",
      "entryCount": 3,
      "entries": [
        {
          "entryTime": "09:30",
          "title": "上午会议",
          "content": "......",
          "mood": "平静",
          "tags": ["工作"],
          "imageCount": 1
        }
      ]
    }
  ],
  "sourceEntries": [
    {
      "recordDate": "2026-04-27",
      "entryTime": "09:30",
      "title": "上午会议",
      "content": "......",
      "mood": "平静",
      "tags": ["工作"],
      "images": [
        {
          "id": "img_xxx",
          "fileName": "meeting.png",
          "url": "/uploads/..."
        }
      ]
    }
  ],
  "generatedAt": "2026-04-27T10:00:00.000Z",
  "instructions": [
    "仅根据 sourceDays / sourceEntries / template 生成结构化总结",
    "输出结果应保留 title、overview、key_points、mood_trend、highlights、concerns、one_line",
    "如有必要，可追加 sections，但不要输出与任务无关的内容"
  ]
}
```

### 4.1 任务包约束

- `summaryType` 只能是 `daily`、`weekly`、`monthly`
- `period.start` 为包含边界
- `period.end` 为不包含边界
- `period.periodKey` 是该周期的稳定主键
- `template` 是当前设置页里的总结模板
- `sourceEntries` 是本次总结的原始事实来源，优先级高于模型的主观补充
- `images.url` 是可访问的本地图片地址，模型可选用，不是强制输入

## 5. 输出协议

本地 AI 返回给平台的总结结果，推荐使用下面的字段：

```json
{
  "title": "2026-04-27 总结",
  "overview": "本日主要完成了......",
  "key_points": [
    "09:30 完成上午会议",
    "13:00 处理了待办事项"
  ],
  "mood_trend": "整体偏平静",
  "highlights": [
    "上午会议推进顺利"
  ],
  "concerns": [
    "下午存在时间碎片化"
  ],
  "one_line": "今天最值得延续的是稳定推进。",
  "sections": [
    {
      "title": "工作",
      "items": ["......"]
    }
  ],
  "generator": {
    "provider": "local-ai-endpoint",
    "model": "qwen2.5",
    "mode": "endpoint"
  },
  "source_stats": {
    "dayCount": 1,
    "entryCount": 3,
    "imageCount": 2
  }
}
```

### 5.1 输出强约束

- 必须是结构化 JSON
- 必须包含 `title`、`overview`、`key_points`、`mood_trend`、`highlights`、`concerns`、`one_line`
- `key_points`、`highlights`、`concerns` 必须是数组
- 文本必须来自任务事实，不能凭空杜撰未出现的事件
- 可以总结、归纳、重写，但不能编造
- 如果信息不足，明确写“暂无明显重点”或同义表达，不要硬凑内容

## 6. 平台接收规则

- 如果请求体里有 `summary`，优先读取 `summary`
- 如果只有 `content_json`，平台也会兼容读取
- 其余字段会尽量兼容，但不建议依赖
- 平台会按 `summaryType + periodKey` 做幂等保存
- 同一周期再次回传时，会覆盖旧结果，而不是新建一条重复记录

## 7. Worker 执行流程

### 7.1 默认流程

1. Worker 读取环境变量
2. Worker 请求平台任务接口
3. Worker 将任务交给本地模型服务，或者在本地直接生成
4. Worker 得到总结 JSON
5. Worker 将结果回传平台
6. 平台保存结果并刷新前端展示

### 7.2 当前可用命令

```bash
npm run summary:worker
```

### 7.3 推荐环境变量

- `DIARY_PLATFORM_URL`：平台地址，默认 `http://127.0.0.1:3011`
- `SUMMARY_TYPE`：`daily` / `weekly` / `monthly`
- `TARGET_DATE`：目标日期，格式 `YYYY-MM-DD`
- `LOCAL_AI_ENDPOINT`：本地模型服务地址，可选

### 7.4 本地模型服务返回约定

如果你给 `LOCAL_AI_ENDPOINT` 配置了自己的接口，建议返回下面其中一种：

```json
{
  "summary": {
    "title": "2026-04-27 总结",
    "overview": "......"
  }
}
```

或者直接返回总结对象：

```json
{
  "title": "2026-04-27 总结",
  "overview": "......"
}
```

## 8. 错误处理

- 拉取任务失败：Worker 直接退出并打印错误
- 本地模型服务失败：Worker 记录错误，不要向平台提交空结果
- 总结 JSON 不合法：Worker 必须先修正或重试，再回传
- 平台回传失败：Worker 应记录失败原因，稍后可重试
- 如果某天没有记录，仍然允许生成空总结，但内容应明确说明“当天没有记录”

## 9. 数据版本管理

- 任务协议和输出协议都要保留版本字段
- 目前建议使用：
  - `taskId` 作为任务唯一标识
  - `prompt_version` 作为平台侧模板版本
  - `generator.model` 作为生成模型版本
- 将来新增字段时，先加字段，不要删旧字段
- 如果要破坏兼容，必须升级协议版本并同步修改平台和 worker

## 10. 验收标准

以下条件全部满足，才算这套协作流程可用：

- 平台可以返回任务包
- Worker 可以在本地读取任务包
- Worker 可以输出符合协议的总结 JSON
- 平台可以接收并入库
- 前端可以展示总结结果
- 同一周期重复提交时，平台会稳定覆盖旧结果

## 11. 推荐实施顺序

1. 先固定任务包字段
2. 再固定输出 JSON 字段
3. 再接本地模型服务
4. 最后补自动化重试、定时执行和日志归档

## 12. 维护规则

- 新增字段前先更新本文档
- 新增接口前先更新 README
- 新增模型接入前先确认输入输出仍然满足本文档
- 任何“临时兼容”都必须写成明确规则，不能只口头说明

