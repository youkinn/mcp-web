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

/** 路由来源五分支（feat-A012）：label 标签 / keyword 关键词 / vector 向量 / classify 分类 / free 自由 */
export type RouteSource = 'label' | 'keyword' | 'vector' | 'classify' | 'free'

export interface LogDurations {
  frontend: number | null
  queueWait: number | null
  server: number | null
  llm: number | null
  tool: number | null
  /** 缓存判定耗时（feat-A013 验收 7）：毫秒，null=历史行无记录 */
  cacheLookupMs: number | null
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
  routeSource: RouteSource | null
  hasRetry: boolean
  /** 缓存判定结果（feat-A013）：1 命中 / 0 未命中 / null 非 sango-novel、开关关闭、降级旁路或历史行 */
  cacheHit: number | null
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
  routeSource: RouteSource | null
}

/** 输入分段 token 估算（feat-A012）：本地启发式折算，与 prompt_tokens 不对账 */
export interface InputBreakdown {
  system: number
  user: number
  injected: number
  history: number
  tools: number
}

export interface LlmCallRecord {
  seq: number
  stage: 'routing' | 'generation' | 'classify'
  model: string
  temperature: number | null
  requestAt: number
  responseAt: number | null
  requestSummary: string
  responseSummary: string
  toolCalls: string
  promptTokens: number | null
  completionTokens: number | null
  cachedTokens: number | null
  reasoningTokens: number | null
  attempt: number | null
  inputBreakdown: InputBreakdown | null
  maxTokens: number | null
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
  /** 各阶段耗时（feat-A013 验收）：毫秒；历史数据缺失，timing 整体缺失时前端不展示 */
  timing?: { bm25: number | null; vector: number | null; label: number | null; merge: number | null }
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
  caller?: 'model' | 'server' | null
  stage?: 'l3' | 'fastpath' | 'classify' | 'generation' | 'admin' | null
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
  /** 缓存判定审计（feat-A013）：cache_logs 无行时为 null */
  cache: CacheLogRecord | null
}

// ── 三国演义问答缓存（feat-A013）类型 ──

/** 命中判定 reason 枚举：命中 / 低相似 / 灰色区 / 歧义 / 焦点拒判（接口文档 §3.10） */
export type CacheMissReason = 'hit' | 'miss-low' | 'miss-gray' | 'miss-tie' | 'miss-focus'

export interface CacheLogRecord {
  hit: boolean
  hitLine: number
  /** 判定耗时（feat-A013 验收 7）：毫秒，null=历史行无记录 */
  lookupMs: number | null
  similarity: number | null
  tieHits: number | null
  userQuery: string
  nearestQuery: string | null
  reason: CacheMissReason
  marked: boolean
  createdAt: number
  /** 命中解释卡片标记误判所需（§3.9 标记接口按 cache_logs id）；§3.10 样例未含，缺失时卡片标记按钮禁用 */
  cacheLogId?: number
}

export interface CacheStatus {
  enabled: boolean
  hitLine: number
  maxEntries: number
  entryCount: number
}

export interface CacheEntryItem {
  id: number
  traceId: string | null
  queryText: string
  answerBytes: number
  embeddingBytes: number
  hitCount: number
  lastAccessAt: number
  createdAt: number
}

export interface CacheEntriesData {
  list: CacheEntryItem[]
  total: number
  pageNo: number
  pageSize: number
}

export interface CacheEntryHitItem {
  traceId: string
  userQuery: string
  similarity: number | null
  createdAt: number
  marked: boolean
}

export interface CacheEntryHitsData {
  list: CacheEntryHitItem[]
  total: number
  pageNo: number
  pageSize: number
}

export interface CacheOverview {
  enabled: boolean
  hitLine: number
  maxEntries: number
  entryCount: number
  answerBytesTotal: number
  embeddingBytesTotal: number
  approximateBytes: number
  avgAnswerBytes: number
  /** 最近一次命中线修改（feat-A013 验收）；无记录为 null */
  lastHitLineChange: { previous: number; current: number; at: number } | null
}

export interface SimilarityBucket {
  lower: number
  upper: number
  count: number
}

export interface SimilarityDistributionData {
  hitLine: number
  bucketWidth: number
  bucketCount: number
  buckets: SimilarityBucket[]
  totals: {
    lowSimilar: number
    grayZone: number
    highConfidence: number
    totalCount: number
  }
  startAt: number
  endAt: number
}

export interface GrayzoneItem {
  cacheLogId: number
  traceId: string
  createdAt: number
  userQuery: string
  nearestQuery: string
  similarity: number
  hitLine: number
  marked: boolean
}

export interface GrayzoneData {
  list: GrayzoneItem[]
  total: number
  pageNo: number
  pageSize: number
}

/** 相似度分布桶明细行（bug-00027）：分布柱下钻；nearestQuery 命中=命中条目原文 / 未命中=最相近条目原文 / 池空=null；similarity 4 位小数，池空=null */
export interface SimilarityRowItem {
  cacheLogId: number
  traceId: string
  createdAt: number
  userQuery: string
  nearestQuery: string | null
  similarity: number | null
  hit: boolean
  tieHits: number | null
  hitLine: number
  marked: boolean
}

export interface SimilarityRowData {
  list: SimilarityRowItem[]
  total: number
  pageNo: number
  pageSize: number
}

export interface MisjudgeData {
  hitTotal: number
  markedMisjudge: number
  misjudgeRate: number | null
  note: string
}

export interface TokenBucket {
  bucket: string
  inputTokens: number
  outputTokens: number
  cachedTokens: number
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
  domain?: 'fengyunsanguo' | 'sango-novel',
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
  domain?: string
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

// ── 三国演义原文（feat-A010）──

export interface SangoChapterChunk {
  chunkId: string
  text: string
  type: string
  segFrom: number
  segTo: number
}

export interface SangoChapterNav {
  chapter: number
  title: string
}

export interface SangoChapterData {
  chapter: number
  title: string
  prev: SangoChapterNav | null
  next: SangoChapterNav | null
  chunks: SangoChapterChunk[]
}

// 模块级共享按回缓存：Map<chapter, Promise<data>>，聊天页匹配与阅读器渲染共用；
// 同回重复打开不重复请求，失败结果不写入缓存（接口文档 §5.5）
const sangoChapterCache = new Map<number, Promise<SangoChapterData>>()

export function fetchSangoChapter(chapter: number): Promise<SangoChapterData> {
  const cached = sangoChapterCache.get(chapter)
  if (cached) return cached
  const pending = apiClient
    .get<ApiResponse<SangoChapterData>>(`/v1/sango/chapters/${chapter}`)
    .then(({ data }) => unwrapData(data))
    .catch((error: unknown) => {
      sangoChapterCache.delete(chapter)
      throw error
    })
  sangoChapterCache.set(chapter, pending)
  return pending
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

// ── 缓存控制台（feat-A013）──

export interface CacheEntriesQuery {
  pageNo?: number
  pageSize?: number
  sortBy?: 'lastAccessAt' | 'hitCount'
  order?: 'desc' | 'asc'
}

export interface GrayzoneQuery {
  startAt: number
  endAt: number
  pageNo?: number
  pageSize?: number
  marked?: 'all' | 'marked' | 'unmarked'
  /** 相似度下限（含），仅填写时传 */
  similarityMin?: number
  /** 相似度上限（含），仅填写时传 */
  similarityMax?: number
}

export interface SimilarityRowQuery {
  startAt: number
  endAt: number
  /** 桶序号 0~49，等价相似度分布图 dataIndex */
  bucketIndex: number
  pageNo?: number
  pageSize?: number
}

export async function fetchCacheStatus(): Promise<CacheStatus> {
  const { data } = await apiClient.get<ApiResponse<CacheStatus>>('/v1/cache/status')
  return unwrapData(data)
}

export async function updateCacheStatus(enabled: boolean): Promise<CacheStatus> {
  const { data } = await apiClient.put<ApiResponse<CacheStatus>>('/v1/cache/status', { enabled })
  return unwrapData(data)
}

export async function updateHitLine(hitLine: number): Promise<{ hitLine: number }> {
  const { data } = await apiClient.put<ApiResponse<{ hitLine: number }>>('/v1/cache/hit-line', { hitLine })
  return unwrapData(data)
}

export async function updateCacheMaxEntries(maxEntries: number): Promise<{ maxEntries: number }> {
  const { data } = await apiClient.put<ApiResponse<{ maxEntries: number }>>('/v1/cache/max-entries', { maxEntries })
  return unwrapData(data)
}

export async function clearCache(): Promise<{ cleared: number }> {
  const { data } = await apiClient.post<ApiResponse<{ cleared: number }>>('/v1/cache/clear')
  return unwrapData(data)
}

export async function deleteCacheEntry(id: number): Promise<{ deleted: boolean }> {
  const { data } = await apiClient.delete<ApiResponse<{ deleted: boolean }>>(`/v1/cache/entries/${id}`)
  return unwrapData(data)
}

export async function fetchCacheEntries(query: CacheEntriesQuery = {}): Promise<CacheEntriesData> {
  const params: Record<string, string | number> = {}
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params[key] = value
  })
  const { data } = await apiClient.get<ApiResponse<CacheEntriesData>>('/v1/cache/entries', { params })
  return unwrapData(data)
}

export async function fetchEntryHits(
  entryId: number,
  pageNo?: number,
  pageSize?: number,
): Promise<CacheEntryHitsData> {
  const params: Record<string, string | number> = {}
  if (pageNo !== undefined && pageNo > 0) params.pageNo = pageNo
  if (pageSize !== undefined && pageSize > 0) params.pageSize = pageSize
  const { data } = await apiClient.get<ApiResponse<CacheEntryHitsData>>(`/v1/cache/entries/${entryId}/hits`, { params })
  return unwrapData(data)
}

export async function fetchCacheOverview(): Promise<CacheOverview> {
  const { data } = await apiClient.get<ApiResponse<CacheOverview>>('/v1/cache/overview')
  return unwrapData(data)
}

export async function fetchSimilarityDistribution(
  startAt: number,
  endAt: number,
): Promise<SimilarityDistributionData> {
  const { data } = await apiClient.get<ApiResponse<SimilarityDistributionData>>(
    '/v1/cache/stats/similarity-distribution',
    { params: { startAt, endAt } },
  )
  return unwrapData(data)
}

export async function fetchGrayzone(query: GrayzoneQuery): Promise<GrayzoneData> {
  const params: Record<string, string | number> = { startAt: query.startAt, endAt: query.endAt }
  if (query.pageNo !== undefined && query.pageNo > 0) params.pageNo = query.pageNo
  if (query.pageSize !== undefined && query.pageSize > 0) params.pageSize = query.pageSize
  if (query.marked && query.marked !== 'all') params.marked = query.marked
  if (query.similarityMin !== undefined && query.similarityMin !== null) params.similarityMin = query.similarityMin
  if (query.similarityMax !== undefined && query.similarityMax !== null) params.similarityMax = query.similarityMax
  const { data } = await apiClient.get<ApiResponse<GrayzoneData>>('/v1/cache/grayzone', { params })
  return unwrapData(data)
}

export async function fetchSimilarityRows(query: SimilarityRowQuery): Promise<SimilarityRowData> {
  const params: Record<string, string | number> = {
    startAt: query.startAt,
    endAt: query.endAt,
    bucketIndex: query.bucketIndex,
  }
  if (query.pageNo !== undefined && query.pageNo > 0) params.pageNo = query.pageNo
  if (query.pageSize !== undefined && query.pageSize > 0) params.pageSize = query.pageSize
  const { data } = await apiClient.get<ApiResponse<SimilarityRowData>>('/v1/cache/stats/similarity-rows', { params })
  return unwrapData(data)
}

// 标记类写接口响应只需 code 校验（幂等 200，data 形状未承诺非 null）
function unwrapOk(body: ApiResponse<unknown>): void {
  if (body.code !== 200) {
    throw new Error(body.message || '请求失败，请稍后重试。')
  }
}

export async function markMisjudge(cacheLogId: number, markedBy?: string): Promise<void> {
  const { data } = await apiClient.post<ApiResponse<unknown>>(`/v1/cache/records/${cacheLogId}/mark`, {
    markedBy: markedBy || '控制台',
  })
  unwrapOk(data)
}

export async function unmarkMisjudge(cacheLogId: number): Promise<void> {
  const { data } = await apiClient.post<ApiResponse<unknown>>(`/v1/cache/records/${cacheLogId}/unmark`)
  unwrapOk(data)
}

export async function fetchMisjudge(startAt: number, endAt: number): Promise<MisjudgeData> {
  const { data } = await apiClient.get<ApiResponse<MisjudgeData>>('/v1/cache/misjudge', {
    params: { startAt, endAt },
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
