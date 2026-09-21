import axios from 'axios'

export interface ApiResponse<T> {
  code: number
  data: T | null
  message: string
}

export interface Citation {
  text: string
  chapter: number
  title: string
}

export interface ChatData {
  answer: string
  citations: Citation[]
}

// ── 链路日志（feat-A007）类型 ──

export interface LogDurations {
  frontend: number | null
  queueWait: number | null
  server: number | null
  llm: number | null
  tool: number | null
  total: number | null
}

export interface LogListItem {
  traceId: string
  logType: string
  userInput: string
  domain: string | null
  status: 'success' | 'failed'
  responseCode: number
  errorMessage: string
  serverReceivedAt: number
  durations: LogDurations
  tokens: { input: number | null; output: number | null } | null
}

export interface LogListData {
  list: LogListItem[]
  total: number
  pageNo: number
  pageSize: number
}

export interface LogDetailMain {
  traceId: string
  logType: string
  userInput: string
  domain: string | null
  status: 'success' | 'failed'
  responseCode: number
  errorMessage: string
  clientSentAt: number | null
  serverReceivedAt: number
  handleStartedAt: number | null
  serverRespondedAt: number | null
  clientReceivedAt: number | null
  answer: string | null
  citations: string | null
  createdAt: number
}

export interface LlmCallRecord {
  seq: number
  stage: 'routing' | 'generation'
  model: string
  requestAt: number
  responseAt: number | null
  requestSummary: string
  responseSummary: string
  toolCalls: string
  promptTokens: number | null
  completionTokens: number | null
  finishReason: string | null
  status: 'success' | 'failed'
  errorMessage: string
}

// ── 检索诊断（feat-A009）类型 ──

export interface RetrievalDiagnostics {
  truncated: boolean
  truncatedCount: number
  query: {
    raw: string
    normalized: string
    tokens: string[]
  }
  env: {
    vectorScheme: string | null
    degradedBm25Only: boolean
    corpusChunks: number
    aliasCount: number
    vectorDim: number | null
  }
  funnel: {
    corpusChunks: number
    lexicalHits: number
    vectorTop50: number
    labelHits: number
    mergedCandidates: number
    topN: number
    injected: number | null
    cited: number | null
  }
  candidates: RetrievalCandidate[]
  nextRank: RetrievalNextRank | null
  deathIntent: {
    detected: boolean
    pinned: boolean
    chunkIds: string[]
  }
}

export interface RetrievalCandidate {
  rank: number
  chunkId: string
  chapter: number
  title: string
  bm25: number | null
  bm25Norm: number | null
  cosine: number | null
  labelHit: boolean
  // 命中标签原始文本（标签表按 | 拆分后的单个标签，如「人物之死-关羽之死」）；历史 trace 无该字段，故可选
  hitLabels?: string[]
  finalScore: number
  sources: string[]
  injected: boolean | null
  cited: boolean | null
}

export interface RetrievalNextRank extends RetrievalCandidate {
  gapToTopN: number
}

export interface ToolCallRecord {
  seq: number
  mcpServer: string
  toolName: string
  argsSummary: string
  callSentAt: number
  callReturnedAt: number | null
  resultSummary: string
  status: 'success' | 'failed'
  errorMessage: string
  diagnostics: RetrievalDiagnostics | null
}

export interface LogDetail {
  log: LogDetailMain
  llmCalls: LlmCallRecord[]
  toolCalls: ToolCallRecord[]
}

export interface TokenBucket {
  bucket: string
  inputTokens: number
  outputTokens: number
}

export interface TokenStatsData {
  granularity: 'day' | 'hour'
  timezone: string
  startAt: number
  endAt: number
  buckets: TokenBucket[]
}

// 导出供 node:test 单测以 mock.method 打桩；Node 测试环境无 import.meta.env，回退 /api（Vite 构建仍按 token 替换）
export const apiClient = axios.create({
  baseURL: import.meta.env?.VITE_API_BASE_URL || '/api',
  timeout: 30_000,
  headers: {
    'Content-Type': 'application/json',
  },
})

function unwrapData<T>(body: ApiResponse<T>): T {
  if (body.code !== 200 || body.data === null) {
    throw new Error(body.message || '请求失败，请稍后重试。')
  }
  return body.data
}

// ── chat 上报与补报（feat-A007）──

// 会话级变量承载当前 /api/chat 请求的链路 ID：一次逻辑请求生成一次，
// 同一请求重试沿用同一值（服务端按 trace_id 幂等去重）。
let chatTraceId: string | null = null

// 会话级变量承载当前 /api/sango/random 请求的链路 ID，口径与 chat 一致（feat-A008）
let sangoRandomTraceId: string | null = null

/** 收到 /api/chat 响应后补报前端接收时刻 t6；fire-and-forget，失败静默不影响主流程。 */
function reportFrontendEnd(traceId: string, clientReceivedAt: number): void {
  void apiClient
    .post(`/v1/logs/${encodeURIComponent(traceId)}/frontend-end`, { clientReceivedAt })
    .catch(() => {
      /* 补报失败静默，旁路原则 */
    })
}

async function postChatForAnswer(
  payload: Record<string, string>,
  traceId: string,
  clientSentAt: number,
): Promise<ChatData> {
  const { data, headers } = await apiClient.post<ApiResponse<ChatData>>('/chat', payload, {
    headers: {
      'X-Trace-Id': traceId,
      'X-Client-Sent-At': String(clientSentAt),
    },
  })
  // 兜底场景（请求头缺失由服务端生成）以响应头 X-Trace-Id 为准
  reportFrontendEnd(String(headers['x-trace-id'] ?? traceId), Date.now())
  if (data.code !== 200 || !data.data) {
    throw new Error(data.message || '请求失败，请稍后重试。')
  }
  return data.data
}

export function sendChatMessage(
  message: string,
  domain?: 'fengyunsanguo' | 'sango-novel' | 'weather',
): Promise<ChatData> {
  const payload: Record<string, string> = { message }
  if (domain) payload.domain = domain
  chatTraceId = crypto.randomUUID()
  const traceId = chatTraceId
  return postChatForAnswer(payload, traceId, Date.now()).finally(() => {
    if (chatTraceId === traceId) chatTraceId = null
  })
}

export function sendSangoRandom(message: string, sessionId?: string): Promise<ChatData> {
  const payload: Record<string, string> = { message }
  if (sessionId) payload.sessionId = sessionId
  sangoRandomTraceId = crypto.randomUUID()
  const traceId = sangoRandomTraceId
  return apiClient
    .post<ApiResponse<ChatData>>('/sango/random', payload, {
      headers: {
        'X-Trace-Id': traceId,
        'X-Client-Sent-At': String(Date.now()),
      },
    })
    .then(({ data, headers }) => {
      // 兜底场景（请求头缺失由服务端生成）以响应头 X-Trace-Id 为准
      reportFrontendEnd(String(headers['x-trace-id'] ?? traceId), Date.now())
      return unwrapData(data)
    })
    .finally(() => {
      if (sangoRandomTraceId === traceId) sangoRandomTraceId = null
    })
}

// ── 日志查询（feat-A007）──

export interface LogListQuery {
  pageNo?: number
  pageSize?: number
  logType?: string
  traceId?: string
  startAt?: number
  endAt?: number
  status?: string
  responseCode?: number
  keyword?: string
}

export async function fetchLogList(query: LogListQuery = {}): Promise<LogListData> {
  const params: Record<string, string | number> = {}
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params[key] = value
  })
  const { data } = await apiClient.get<ApiResponse<LogListData>>('/v1/logs', { params })
  return unwrapData(data)
}

export async function fetchLogDetail(traceId: string): Promise<LogDetail> {
  const { data } = await apiClient.get<ApiResponse<LogDetail>>(`/v1/logs/${encodeURIComponent(traceId)}`)
  return unwrapData(data)
}

export interface TokenStatsQuery {
  startAt: number
  endAt: number
  granularity?: 'day' | 'hour'
}

export async function fetchTokenStats(query: TokenStatsQuery): Promise<TokenStatsData> {
  const { data } = await apiClient.get<ApiResponse<TokenStatsData>>('/v1/logs/token-stats', {
    params: {
      startAt: query.startAt,
      endAt: query.endAt,
      granularity: query.granularity,
    },
  })
  return unwrapData(data)
}

export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.response?.data?.message) return error.response.data.message
    if (error.code === 'ECONNABORTED') return '请求超时，请稍后重试。'
    if (!error.response) return '无法连接到 mcp-orchestrator，请确认后端服务已启动。'
  }
  if (error instanceof Error && error.message) return error.message
  return '请求失败，请稍后重试。'
}
