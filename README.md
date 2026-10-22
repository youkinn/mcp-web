# mcp-web

天枢项目群的前端（别名：前厅）。基于 Vue 3 + TypeScript + Vite 的 MCP 工作台，提供问答、链路日志、缓存管理与评测页面，通过 HTTP `/api` 调用 `mcp-orchestrator`。

## 目录结构

```text
src/
├── api/          HTTP 客户端与类型
├── assets/       静态资源
├── components/   通用组件
├── router/       路由
├── stores/       Pinia 状态
├── types/        共享类型
├── utils/        工具函数
├── views/        页面组件
├── App.vue       根组件
├── main.ts       应用入口
└── style.less    全局样式
```

## 开发

```bash
npm install
npm run dev      # http://localhost:8001，/api 代理到 http://localhost:3000
npm run build    # 类型检查 + 生产构建
npm run test     # 单元测试
npm run lint
```

先启动 `mcp-orchestrator`，否则页面请求会提示无法连接后端。后端地址可用 `VITE_API_BASE_URL` 覆盖。

## 页面

| 路由 | 页面 |
|---|---|
| `/` | 工作台首页 |
| `/chat` | 对话与引用展示 |
| `/logs` | 链路日志与检索诊断 |
| `/cache` | 语义缓存管理 |
| `/benchmark` | RAG 评测 |

接口契约见 `D:\workplace\dev-docs\mcp-orchestrator\api\`，团队约定见 `D:\workplace\dev-docs\AGENTS.md`。
