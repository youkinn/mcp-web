# mcp-web — 项目规范

## 技术栈
- Vue 3（Composition API，`<script setup>`）
- Ant Design Vue
- Less（全局样式在 `src/style.less`）
- Pinia（状态管理）
- Vite（构建工具，代理 `/api` → `http://localhost:3000`）

## 代码风格
- 组件顺序：`<template>` → `<script>` → `<style scoped>`
- 页面专属样式写在对应 `.vue` 文件中，不放在 `style.less`
- `style.less` 仅包含：全局重置、共享样式（site-header、brand 等）以及 HomeView 专属样式
- 在 scoped 样式中直接使用 CSS 值（不引入 Less 变量）

## 文件结构
```
src/
├── api/          API 客户端层
├── stores/       Pinia store
├── views/        页面级组件
├── style.less    全局和共享样式
```

## 负责人：小叶

## 开发流程（以 feat-A001 为例）

1. 阅读 `dev-docs/requirements/feat-A001-xxx.md`
2. 阅读老陈的接口文档 `dev-docs/mcp-orchestrator/api/feat-A001-xxx.md`
3. 阅读 `dev-docs/mcp-orchestrator/api/response-convention.md`
4. 编写半页技术方案 → `dev-docs/mcp-web/design/feat-A001-xxx.md`
5. 等待 Coco 确认接口文档就绪后再开始编码
6. 实现前端改动
7. 编写测试（命名清晰，覆盖验收标准）

### API 客户端规范
- 所有响应使用 `{ code, data, message }` 信封
- 前端检查 `res.code === 200` 判断成功，失败时显示 `res.message`
- 按状态码区分处理：413（截断）、503（服务不可用）、500（重试）

## 交付清单
- [ ] 代码编译通过（`npm run build` 或 `vite build`）
- [ ] 技术方案已写（半页，design/feat-A001-xxx.md）
- [ ] 测试代码已写（命名清晰，覆盖验收标准）
- [ ] API 客户端使用 `{ code, data, message }` 信封
- [ ] `dev-docs/` 中文档已同步更新
- [ ] Template / script / style 顺序已保持
- [ ] 样式未泄漏到 `style.less`（除非是共享样式）


## Git
- 始终在分支上开发：`feat/feat-A001-name` 或 `fix/bug-00042-name`
- 禁止直接提交到 main
- Commit 格式：`#feat-A001 type: 中文描述`