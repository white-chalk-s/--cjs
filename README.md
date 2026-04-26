# 日记记录平台

本项目是一个本地优先的日记记录平台，技术栈为 `Node.js + Express + SQLite + 原生 HTML/CSS/JS + Electron`。

## 当前进度

- 已完成第一阶段基础工程骨架
- 已接入 SQLite 初始化与 migrations
- 已提供健康检查、应用概览、设置读写接口
- 已搭建首页、时间轴、写记录、AI 总结、设置五个主 Tab 页面壳

## 运行

```bash
npm install
npm run dev
```

默认端口为 `3011`，浏览器打开 `http://localhost:3011`。

Electron 桌面运行：

```bash
npm run electron
```
