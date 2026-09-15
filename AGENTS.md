# mcp-web — 项目规范

> 前端负责人：小叶。团队级规则（编号 / Commit / 分支 / 交付 / 审查）见 `dev-docs/AGENTS.md`，本文件只列本项目特有约束。

## 技术栈

- Vue 3（Composition API，`<script setup>`）
- Ant Design Vue + Tailwind CSS v4
- Less（全局样式在 `src/style.less`）
- Pinia（状态管理）
- Vite（构建工具，dev server 代理 `/api` → `http://localhost:3000`）

## 代码风格

- 组件顺序：`<template>` → `<script>` → `<style scoped>`。
- 页面专属样式写在对应 `.vue` 文件内，不放 `style.less`。
- `style.less` 只放全局重置、共享样式（site-header、brand 等）及其 Less 变量；scoped 样式里直接写 CSS 值，不引 Less 变量。
- 运行时配置走 `VITE_*` 环境变量（如 `VITE_API_BASE_URL`），不硬编码后端地址。

## 文件结构

```
src/
├── api/          API 客户端层（client.ts）
├── components/   通用组件
├── router/       路由配置
├── stores/       Pinia store
├── views/        页面级组件
└── style.less    全局和共享样式
```

## API 客户端

- 统一信封与字段语义见 `dev-docs/mcp-orchestrator/api/response-convention.md`；字段级契约以各特性接口文档为准。
- 判断成功用 `res.code === 200`，失败展示 `res.message`。
- 状态码分支：413 输入超长 / 503 工具服务不可用 / 500 重试。
