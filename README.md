# mcp-web（前厅）

基于 Vue 3 + TypeScript + Vite 的 MCP 前端层，是全部能力的统一入口：一个对话页聚合天气 / 风云三国 / 三国演义三类能力，每类能力独立接入、独立演进，互不影响。

## 产品定位

统一对话入口：首页列出已接入能力，对话页通过模式标签（天气 / 风云三国 / 三国演义）或自动路由分发请求，三类能力独立接入、独立演进、互不影响。产品介绍与迭代指引见 [PRODUCT.md](PRODUCT.md)。

| 能力 | 一句话说明 |
|------|-----------|
| 三国演义 | 只呈现原文、不评价、不编造，引用可溯源到具体回目，展示为「结论 + 参考资料」 |
| 风云三国 | 知识问答 + 随机一题（题库在 mcp-server） |
| 天气 | 预报 / 预警查询，结合出行场景给建议 |

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

开发服务器会将 `/api` 请求代理到 `http://localhost:3000`。请先启动总台（mcp-orchestrator）的 Web API，否则页面提交问题时会提示无法连接后端。

## 可用命令

```bash
npm run dev      # 启动开发服务器
npm run build    # 类型检查并构建生产包
npm run preview  # 预览生产构建
npm run lint     # 执行 ESLint 检查
```

## API 约定

统一对话接口：

```http
POST /api/chat
Content-Type: application/json
```

请求体：

```json
{
  "message": "关羽的武器是什么？",
  "domain": "sango-novel"
}
```

`domain` 可选：`weather` / `fengyunsanguo` / `sango-novel`，缺省由总台自动路由。

期望响应（信封 `{ code, data, message }`）：

```json
{
  "code": 200,
  "data": {
    "answer": "关羽的武器是青龙偃月刀。"
  },
  "message": ""
}
```

- `res.code === 200` 用 `res.data`，失败直接展示 `res.message`
- 三国演义域（feat-A006 落地后）`data` 含 `citations` 引用卡片数组，前端渲染为「结论段 + 参考资料卡片区」
- 风云三国随机一题走 `POST /api/sango/random`（会话状态由总台透传到 fengyunsanguo 子进程）

如需修改后端地址，可设置环境变量：

```bash
VITE_API_BASE_URL=http://localhost:3000/api
```

## 项目结构

```text
src/
├─ api/client.ts       Axios API 封装
├─ router/index.ts     Vue Router 配置
├─ stores/chat.ts      对话状态管理（mode / sangoService / 会话）
├─ views/HomeView.vue  工作台首页（已接入能力列表）
├─ views/WeatherView.vue 智能助手统一对话页（模式标签切换）
├─ App.vue             根组件
└─ main.ts             应用入口
```

- `/` 首页展示已接入能力；`/weather` 统一对话页（三个模式标签）
