# mcp-web

基于 Vue 3 + TypeScript + Vite 的 MCP Web 层，负责接收用户输入，并通过 `mcp-client` 的 HTTP API 获取回答。

## 技术栈

- Vue 3 + TypeScript + Vite
- Vue Router
- Tailwind CSS v4
- Less
- Ant Design Vue
- Axios
- Pinia
- ESLint

## 开发环境

```bash
npm install
npm run dev
```

默认访问地址：`http://localhost:8001`

开发服务器会将 `/api` 请求代理到 `http://localhost:3000`。请先启动 `mcp-client` 的 Web API，否则页面提交问题时会提示无法连接后端。

## 可用命令

```bash
npm run dev      # 启动开发服务器
npm run build    # 类型检查并构建生产包
npm run preview  # 预览生产构建
npm run lint     # 执行 ESLint 检查
```

## API 约定

页面当前调用：

```http
POST /api/chat
Content-Type: application/json
```

请求体：

```json
{
  "message": "纽约今天适合地铁通勤吗？"
}
```

期望响应：

```json
{
  "code": 200,
  "data": {
    "answer": "天气助手的回答"
  },
  "message": ""
}
```

失败时返回 `{ code: 非200, data: null, message: "错误原因" }`，前端检查 `code === 200` 后使用 `data`，失败直接展示 `message`。

如需修改后端地址，可设置环境变量：

```bash
VITE_API_BASE_URL=http://localhost:3000/api
```

## 项目结构

```text
src/
├─ api/client.ts       Axios API 封装
├─ router/index.ts     Vue Router 配置
├─ stores/chat.ts      对话状态管理
├─ views/HomeView.vue  MCP 工作台首页
├─ views/WeatherView.vue 天气助手页面
├─ App.vue             根组件
└─ main.ts             应用入口
```

首页是 MCP 工具工作台，天气助手位于 `/weather`，后续功能可以按独立路由接入。
