# 日记记录平台

这是一个本地优先的日记记录平台，技术栈为 `Node.js + Express + SQLite + 原生 HTML/CSS/JS + Electron`。

## 当前进度

- 已完成第一阶段基础架构
- 已接入 SQLite 初始化与 migrations
- 已提供健康检查、应用概览、设置读写接口
- 已搭建首页、时间轴、写记录、AI 总结、设置五个主 Tab 页面

## 运行

```bash
npm install
npm run dev
```

默认端口是 `3011`，浏览器打开 `http://localhost:3011`。

Electron 桌面运行：

```bash
npm run electron
```

本地总结 worker：

```bash
npm run summary:worker
```

worker 会先从本地平台拉取总结任务 JSON，处理后再回传到平台。如果你有自己的本地模型服务，可以设置 `LOCAL_AI_ENDPOINT` 让 worker 调用它。

## 本地 AI 协作规范

如果你想让本地模型和平台协同工作，请先阅读 [docs/本地AI协作规范.md](docs/本地AI协作规范.md)。

这份文档定义了：

- 平台应该提供什么格式的任务包
- Worker 应该如何读取任务包
- 本地模型应该如何返回总结结果
- 失败时应该怎么处理

