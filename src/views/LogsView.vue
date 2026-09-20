<template>
  <main class="logs-page">
    <div class="page-shell">
      <header class="site-header">
        <RouterLink to="/" class="brand">
          <span class="brand-mark">M</span>
          <span class="brand-copy">
            <span class="brand-name">MCP WORKSPACE</span>
            <span class="brand-caption">Log tracking</span>
          </span>
        </RouterLink>
        <a-tag color="green">服务就绪</a-tag>
      </header>

      <a-tabs v-model:activeKey="activeTab" class="logs-tabs" size="large">
        <a-tab-pane key="list">
          <template #tab><span class="tab-label">日志列表</span></template>

          <div class="query-card">
            <div class="query-row">
              <div class="query-item">
                <span class="query-label">类型</span>
                <a-select v-model:value="query.logType" class="query-control query-select">
                  <a-select-option value="">全部</a-select-option>
                  <a-select-option value="chat">chat</a-select-option>
                </a-select>
              </div>
              <div class="query-item">
                <span class="query-label">时间范围</span>
                <a-range-picker v-model:value="query.dateRange" value-format="YYYY-MM-DD" class="query-control query-range" @change="onListRangeChange" />
              </div>
              <div class="query-item">
                <span class="query-label">traceId</span>
                <a-input v-model:value="query.traceId" class="query-control" placeholder="精确匹配" allow-clear />
              </div>
              <div class="query-item">
                <span class="query-label">关键字</span>
                <a-input v-model:value="query.keyword" class="query-control" placeholder="匹配 userInput" allow-clear />
              </div>
              <div class="query-item">
                <span class="query-label">状态</span>
                <a-select v-model:value="query.status" class="query-control query-select">
                  <a-select-option value="">全部</a-select-option>
                  <a-select-option value="success">成功</a-select-option>
                  <a-select-option value="failed">失败</a-select-option>
                </a-select>
              </div>
              <div class="query-item">
                <span class="query-label">响应码</span>
                <a-input-number v-model:value="query.responseCode" class="query-control" :min="100" :max="599" placeholder="如 500" />
              </div>
              <div class="query-actions">
                <a-button type="primary" :loading="listLoading" @click="onSearch">查 询</a-button>
                <a-button @click="onReset">重 置</a-button>
              </div>
            </div>
          </div>

          <div class="table-card">
            <a-table
              :columns="columns"
              :data-source="rows"
              :loading="listLoading"
              :row-key="rowKeyTrace"
              :pagination="pagination"
              :scroll="{ x: 1180 }"
              v-model:expandedRowKeys="expandedRowKeys"
              :expand-row-by-click="false"
              @change="onTableChange"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'time'">{{ formatTime(record.serverReceivedAt) }}</template>

                <template v-else-if="column.key === 'logType'">
                  <a-tag class="log-type-tag">{{ record.logType }}</a-tag>
                </template>

                <template v-else-if="column.key === 'userInput'">
                  <span class="cell-ellipsis" :title="record.userInput">{{ truncateText(record.userInput, 200) }}</span>
                </template>

                <template v-else-if="column.key === 'domain'">{{ record.domain || '—' }}</template>

                <template v-else-if="column.key === 'status'">
                  <div class="status-cell">
                    <div class="status-line">
                      <a-tag :color="record.status === 'failed' ? 'error' : 'success'">
                        {{ record.status === 'failed' ? '失败' : '成功' }}
                      </a-tag>
                      <span class="resp-code" :class="{ 'is-failed': record.status === 'failed' }">{{ record.responseCode }}</span>
                    </div>
                    <div v-if="record.status === 'failed' && record.errorMessage" class="status-error" :title="record.errorMessage">
                      {{ record.errorMessage }}
                    </div>
                  </div>
                </template>
                <template v-else-if="column.key === 'durations'">
                  <a-tooltip placement="topLeft">
                    <template #title>
                      <div class="dur-tooltip">
                        <div>总 {{ formatDuration(record.durations.total) }}</div>
                        <div>前端 {{ formatDuration(record.durations.frontend) }}</div>
                        <div>总台 {{ formatDuration(record.durations.server) }}</div>
                        <div>LLM {{ formatDuration(record.durations.llm) }}</div>
                        <div>工具 {{ formatDuration(record.durations.tool) }}</div>
                        <div>队列等待 {{ formatDuration(record.durations.queueWait) }}</div>
                      </div>
                    </template>
                    <div class="dur-cell">
                      <div class="dur-total">{{ formatDuration(record.durations.total) }}</div>
                      <div class="dur-sub">
                        前端 {{ formatDuration(record.durations.frontend) }} · 总台 {{ formatDuration(record.durations.server) }} · LLM {{ formatDuration(record.durations.llm) }} · 工具 {{ formatDuration(record.durations.tool) }}
                      </div>
                    </div>
                  </a-tooltip>
                </template>

                <template v-else-if="column.key === 'tokens'">
                  <span>{{ formatTokens(record.tokens?.input ?? null) }} / {{ formatTokens(record.tokens?.output ?? null) }}</span>
                </template>

                <template v-else-if="column.key === 'action'">
                  <a-button type="link" size="small" @click="toggleExpand(record)">
                    {{ isExpanded(record.traceId) ? '收起' : '明细' }}
                  </a-button>
                </template>
              </template>

              <template #expandedRowRender="{ record }">
                <div class="detail-panel">
                  <a-spin v-if="detailOf(record.traceId)?.loading" />
                  <a-empty v-else-if="detailOf(record.traceId)?.error" :description="detailOf(record.traceId)?.error" />
                  <template v-else-if="detailOf(record.traceId)?.data">
                    <section v-if="detailOf(record.traceId)?.data?.log.answer || detailOf(record.traceId)?.data?.log.citations" class="detail-section">
                      <h4 class="detail-section-title">
                        回答
                        <a-tag v-if="hasTruncation(detailOf(record.traceId)?.data?.log.answer ?? '')" color="warning" size="small">已截断</a-tag>
                      </h4>
                      <pre class="answer-pre">{{ detailOf(record.traceId)?.data?.log.answer || '—' }}</pre>
                    </section>

                    <section v-if="detailOf(record.traceId)?.data?.log.citations" class="detail-section">
                      <h4 class="detail-section-title">
                        引用（citations）
                        <a-tag v-if="hasTruncation(detailOf(record.traceId)?.data?.log.citations ?? '')" color="warning" size="small">已截断</a-tag>
                      </h4>
                      <pre class="json-pre" v-html="highlightJson(prettyJson(detailOf(record.traceId)?.data?.log.citations ?? ''))"></pre>
                    </section>

                    <section class="detail-section">
                      <h4 class="detail-section-title">LLM 调用（{{ detailOf(record.traceId)?.data?.llmCalls.length ?? 0 }}）</h4>
                      <a-table
                        v-if="(detailOf(record.traceId)?.data?.llmCalls.length ?? 0) > 0"
                        :data-source="detailOf(record.traceId)?.data?.llmCalls"
                        :columns="llmColumns"
                        :pagination="false"
                        :row-key="rowKeySeq"
                        size="small"
                        class="sub-table"
                      >
                        <template #bodyCell="{ column, record: call }">
                          <template v-if="column.key === 'stage'">
                            <span class="llm-seq">#{{ call.seq }}</span> {{ call.stage }}
                          </template>
                          <template v-else-if="column.key === 'model'">
                            {{ call.model }}
                            <div v-if="call.finishReason" class="sub-meta">finish: {{ call.finishReason }}</div>
                          </template>
                          <template v-else-if="column.key === 'tokens'">
                            {{ formatTokens(call.promptTokens) }} / {{ formatTokens(call.completionTokens) }}
                          </template>
                          <template v-else-if="column.key === 'time'">
                            <div>{{ formatTime(call.requestAt, true) }}</div>
                            <div v-if="call.responseAt !== null" class="sub-meta">→ {{ formatTime(call.responseAt, true) }} · 耗时 {{ formatDuration(call.responseAt - call.requestAt) }}</div>
                            <div v-else class="sub-meta err-text">未返回</div>
                          </template>
                          <template v-else-if="column.key === 'status'">
                            <a-tag :color="call.status === 'failed' ? 'error' : 'success'">{{ call.status === 'failed' ? '失败' : '成功' }}</a-tag>
                            <div v-if="call.status === 'failed' && call.errorMessage" class="sub-meta err-text">{{ call.errorMessage }}</div>
                          </template>
                          <template v-else-if="column.key === 'content'">
                            <template v-if="call.requestSummary">
                              <div class="content-block">
                                <div class="content-label">
                                  请求
                                  <a-tag v-if="hasTruncation(call.requestSummary)" color="warning" size="small">已截断</a-tag>
                                </div>
                                <pre class="json-pre" v-html="highlightJson(prettyJson(call.requestSummary))"></pre>
                              </div>
                            </template>
                            <template v-if="call.responseSummary">
                              <div class="content-block">
                                <div class="content-label">
                                  响应
                                  <a-tag v-if="hasTruncation(call.responseSummary)" color="warning" size="small">已截断</a-tag>
                                </div>
                                <pre class="json-pre" v-html="highlightJson(prettyJson(call.responseSummary))"></pre>
                              </div>
                            </template>
                            <template v-if="call.toolCalls && call.toolCalls.trim() && call.toolCalls.trim() !== '[]'">
                              <div class="content-block">
                                <div class="content-label">
                                  工具声明
                                  <a-tag v-if="hasTruncation(call.toolCalls)" color="warning" size="small">已截断</a-tag>
                                </div>
                                <pre class="json-pre" v-html="highlightJson(prettyJson(call.toolCalls))"></pre>
                              </div>
                            </template>
                          </template>
                        </template>
                      </a-table>
                      <div v-else class="sub-empty">无 LLM 调用</div>
                    </section>
                    <section class="detail-section">
                      <h4 class="detail-section-title">工具调用（{{ detailOf(record.traceId)?.data?.toolCalls.length ?? 0 }}）</h4>
                      <a-table
                        v-if="(detailOf(record.traceId)?.data?.toolCalls.length ?? 0) > 0"
                        :data-source="detailOf(record.traceId)?.data?.toolCalls"
                        :columns="toolColumns"
                        :pagination="false"
                        :row-key="rowKeySeq"
                        size="small"
                        class="sub-table"
                      >
                        <template #bodyCell="{ column, record: call }">
                          <template v-if="column.key === 'tool'">
                            {{ call.mcpServer }}.{{ call.toolName }}
                          </template>
                          <template v-else-if="column.key === 'time'">
                            <div>{{ formatTime(call.callSentAt, true) }}</div>
                            <div v-if="call.callReturnedAt !== null" class="sub-meta">→ {{ formatTime(call.callReturnedAt, true) }} · 耗时 {{ formatDuration(call.callReturnedAt - call.callSentAt) }}</div>
                            <div v-else class="sub-meta err-text">未返回</div>
                          </template>
                          <template v-else-if="column.key === 'status'">
                            <a-tag :color="call.status === 'failed' ? 'error' : 'success'">{{ call.status === 'failed' ? '失败' : '成功' }}</a-tag>
                            <div v-if="call.status === 'failed' && call.errorMessage" class="sub-meta err-text">{{ call.errorMessage }}</div>
                          </template>
                          <template v-else-if="column.key === 'content'">
                            <template v-if="call.argsSummary">
                              <div class="content-block">
                                <div class="content-label">
                                  参数
                                  <a-tag v-if="hasTruncation(call.argsSummary)" color="warning" size="small">已截断</a-tag>
                                </div>
                                <pre class="json-pre" v-html="highlightJson(prettyJson(call.argsSummary))"></pre>
                              </div>
                            </template>
                            <template v-if="call.resultSummary">
                              <div class="content-block">
                                <div class="content-label">
                                  返回
                                  <a-tag v-if="hasTruncation(call.resultSummary)" color="warning" size="small">已截断</a-tag>
                                </div>
                                <pre class="json-pre" v-html="highlightJson(prettyJson(call.resultSummary))"></pre>
                              </div>
                            </template>
                          </template>
                        </template>
                      </a-table>
                      <div v-else class="sub-empty">无工具调用</div>
                    </section>
                  </template>
                </div>
              </template>
            </a-table>
          </div>
        </a-tab-pane>

        <a-tab-pane key="stats">
          <template #tab><span class="tab-label">Token 统计</span></template>

          <div class="query-card">
            <div class="query-row stats-query-row">
              <div class="query-item">
                <span class="query-label">时间段</span>
                <a-radio-group v-model:value="rangePreset" @change="onPresetChange" class="preset-radios">
                  <a-radio-button value="today">今天</a-radio-button>
                  <a-radio-button value="7d">近 7 天</a-radio-button>
                  <a-radio-button value="30d">近 30 天</a-radio-button>
                  <a-radio-button value="custom">自定义</a-radio-button>
                </a-radio-group>
                <a-range-picker v-model:value="customRange" value-format="YYYY-MM-DD" class="query-range" @change="onCustomRangeChange" />
              </div>
              <div class="query-item">
                <span class="query-label">粒度</span>
                <a-radio-group v-model:value="granularity" @change="onGranularityChange">
                  <a-radio-button value="day">按天</a-radio-button>
                  <a-radio-button value="hour">按小时</a-radio-button>
                </a-radio-group>
              </div>
              <div class="query-actions">
                <a-button type="primary" :loading="statsLoading" @click="onRefreshStats">刷 新</a-button>
              </div>
            </div>
          </div>

          <div class="stats-card">
            <div class="stats-head">
              <div class="stats-range-info">
                <span v-if="statsRangeLabel" class="stats-range-label">{{ statsRangeLabel }}</span>
                <span class="stats-granularity-hint">日界：Asia/Shanghai · 实际粒度：{{ granularity === 'day' ? '按天' : '按小时' }}</span>
              </div>
            </div>
            <a-spin :spinning="statsLoading">
              <div ref="chartEl" class="chart-canvas"></div>
            </a-spin>
            <div v-if="statsData && statsData.buckets.length === 0 && !statsLoading" class="chart-empty">
              <a-empty description="该时间段暂无 token 数据" />
            </div>
          </div>
        </a-tab-pane>
      </a-tabs>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import { init as initChart, use } from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsType } from 'echarts/core'

use([BarChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])
import {
  fetchLogDetail,
  fetchLogList,
  fetchTokenStats,
  getErrorMessage,
  type LogDetail,
  type LogListItem,
  type LogListQuery,
  type TokenStatsData,
} from '../api/client'

// ── 通用格式化 ──

const TRUNCATION_MARK = '…（已截断）'
const DAY_MS = 24 * 60 * 60 * 1000
const SHANGHAI_UTC_OFFSET_MS = 8 * 60 * 60 * 1000

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function pad3(n: number): string {
  return String(n).padStart(3, '0')
}

function formatTime(ms: number, withMillis = false): string {
  const d = new Date(ms)
  const base = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
  return withMillis ? `${base}.${pad3(d.getMilliseconds())}` : base
}

function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—'
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${parseFloat((ms / 1000).toFixed(1))}s`
}

function formatTokens(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  if (n >= 1000) return `${parseFloat((n / 1000).toFixed(1))}k`
  return String(n)
}

function truncateText(text: string, max: number): string {
  if (text.length <= max || text.includes(TRUNCATION_MARK)) return text
  return `${text.slice(0, max)}${TRUNCATION_MARK}`
}

function hasTruncation(text: string): boolean {
  return text.includes(TRUNCATION_MARK)
}
// ── JSON 内容展示：格式化 + 轻量语法高亮（不引额外库）──

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const JSON_TOKEN_RE = /("(?:\\.|[^"\\])*")(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g

function highlightJson(raw: string): string {
  let html = ''
  let lastIndex = 0
  JSON_TOKEN_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = JSON_TOKEN_RE.exec(raw)) !== null) {
    html += escapeHtml(raw.slice(lastIndex, match.index))
    const token = match[0]
    const isKey = match[2] !== undefined
    const cls = isKey
      ? 'json-key'
      : match[1] !== undefined
        ? 'json-string'
        : /true|false|null/.test(token)
          ? 'json-literal'
          : 'json-number'
    html += `<span class="${cls}">${escapeHtml(token)}</span>`
    lastIndex = match.index + token.length
  }
  html += escapeHtml(raw.slice(lastIndex))
  return html
}

function prettyJson(raw: string): string {
  if (!raw) return ''
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

// ── 日志列表 ──

const columns = [
  { key: 'time', title: '时间', width: 165 },
  { key: 'logType', title: '类型', width: 90 },
  { key: 'userInput', title: '用户输入', minWidth: 220 },
  { key: 'domain', title: '域', width: 110 },
  { key: 'status', title: '状态', width: 240 },
  { key: 'durations', title: '耗时', width: 158 },
  { key: 'tokens', title: 'Token（输入/输出）', width: 130 },
  { key: 'action', title: '操作', width: 80, fixed: 'right' },
]

const llmColumns = [
  { key: 'stage', title: '阶段', width: 120 },
  { key: 'model', title: '模型', width: 170 },
  { key: 'tokens', title: 'Token（输入/输出）', width: 130 },
  { key: 'time', title: '时间', width: 240 },
  { key: 'status', title: '状态', width: 140 },
  { key: 'content', title: '内容', minWidth: 360 },
]

const toolColumns = [
  { key: 'tool', title: '工具', width: 210 },
  { key: 'time', title: '时间', width: 240 },
  { key: 'status', title: '状态', width: 140 },
  { key: 'content', title: '内容', minWidth: 360 },
]

function rowKeyTrace(record: LogListItem): string {
  return record.traceId
}

function rowKeySeq(item: { seq: number }): number {
  return item.seq
}

const rows = ref<LogListItem[]>([])
const total = ref(0)
const pageNo = ref(1)
const pageSize = ref(20)
const listLoading = ref(false)

const query = reactive<{
  logType: string
  dateRange: string[]
  traceId: string
  keyword: string
  status: string
  responseCode: number | null
}>({
  logType: '',
  dateRange: [],
  traceId: '',
  keyword: '',
  status: '',
  responseCode: null,
})

const expandedRowKeys = ref<string[]>([])
const detailState = reactive<Record<string, { loading: boolean; error: string; data: LogDetail | null }>>({})

function detailOf(traceId: string) {
  return detailState[traceId]
}

function isExpanded(traceId: string): boolean {
  return expandedRowKeys.value.includes(traceId)
}

function toggleExpand(record: LogListItem) {
  const index = expandedRowKeys.value.indexOf(record.traceId)
  if (index >= 0) {
    expandedRowKeys.value.splice(index, 1)
    return
  }
  expandedRowKeys.value.push(record.traceId)
  void ensureDetail(record.traceId)
}

async function ensureDetail(traceId: string) {
  if (detailState[traceId]) return
  detailState[traceId] = { loading: true, error: '', data: null }
  try {
    const data = await fetchLogDetail(traceId)
    detailState[traceId].data = data
  } catch (err) {
    detailState[traceId].error = getErrorMessage(err)
  } finally {
    detailState[traceId].loading = false
  }
}

function resetExpansion() {
  expandedRowKeys.value = []
  Object.keys(detailState).forEach((key) => {
    delete detailState[key]
  })
}

function onListRangeChange(_dates: unknown, dateStrings: [string, string]) {
  query.dateRange = dateStrings[0] && dateStrings[1] ? [dateStrings[0], dateStrings[1]] : []
}

function buildListQuery(): LogListQuery {
  const listQuery: LogListQuery = { pageNo: pageNo.value, pageSize: pageSize.value }
  if (query.logType) listQuery.logType = query.logType
  if (query.traceId.trim()) listQuery.traceId = query.traceId.trim()
  if (query.keyword.trim()) listQuery.keyword = query.keyword.trim()
  if (query.status) listQuery.status = query.status
  if (query.responseCode !== null) listQuery.responseCode = query.responseCode
  if (Array.isArray(query.dateRange) && query.dateRange.length === 2 && query.dateRange[0] && query.dateRange[1]) {
    listQuery.startAt = parseShanghaiDate(query.dateRange[0])
    listQuery.endAt = parseShanghaiDate(query.dateRange[1]) + DAY_MS - 1
  }
  return listQuery
}

async function loadList() {
  listLoading.value = true
  try {
    const data = await fetchLogList(buildListQuery())
    rows.value = data.list
    total.value = data.total
  } catch (err) {
    message.error(getErrorMessage(err))
  } finally {
    listLoading.value = false
  }
}

function onSearch() {
  pageNo.value = 1
  resetExpansion()
  void loadList()
}

function onReset() {
  query.logType = ''
  query.dateRange = []
  query.traceId = ''
  query.keyword = ''
  query.status = ''
  query.responseCode = null
  pageNo.value = 1
  resetExpansion()
  void loadList()
}

function onTableChange(pagination: { current?: number; pageSize?: number }) {
  pageNo.value = pagination.current ?? 1
  pageSize.value = pagination.pageSize ?? 20
  resetExpansion()
  void loadList()
}

const pagination = computed(() => ({
  current: pageNo.value,
  pageSize: pageSize.value,
  total: total.value,
  showSizeChanger: true,
  showTotal: (t: number) => `共 ${t} 条`,
}))
// ── Token 统计（Asia/Shanghai 日界）──

function shanghaiDateParts(ms: number): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(ms))
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0)
  return { year: value('year'), month: value('month'), day: value('day') }
}

function shanghaiDayStartMs(ms: number): number {
  const { year, month, day } = shanghaiDateParts(ms)
  return Date.UTC(year, month - 1, day) - SHANGHAI_UTC_OFFSET_MS
}

function shanghaiDateString(ms: number): string {
  const { year, month, day } = shanghaiDateParts(ms)
  return `${year}-${pad2(month)}-${pad2(day)}`
}

function parseShanghaiDate(dateStr: string): number {
  const [year, month, day] = dateStr.split('-').map(Number)
  return Date.UTC(year, month - 1, day) - SHANGHAI_UTC_OFFSET_MS
}

function defaultGranularity(startAt: number, endAt: number): 'day' | 'hour' {
  const start = shanghaiDateParts(startAt)
  const end = shanghaiDateParts(endAt)
  const sameDay = start.year === end.year && start.month === end.month && start.day === end.day
  return sameDay ? 'hour' : 'day'
}

const activeTab = ref<'list' | 'stats'>('list')
const rangePreset = ref<'today' | '7d' | '30d' | 'custom'>('today')
const customRange = ref<string[]>([])
const granularity = ref<'day' | 'hour'>('day')
const statsData = ref<TokenStatsData | null>(null)
const statsLoading = ref(false)
const chartEl = ref<HTMLElement | null>(null)
let chart: EChartsType | null = null

function isValidCustomRange(): boolean {
  return Array.isArray(customRange.value) && customRange.value.length === 2 && !!customRange.value[0] && !!customRange.value[1]
}

function currentStatsRange(): { startAt: number; endAt: number } {
  const now = Date.now()
  const todayStart = shanghaiDayStartMs(now)
  if (rangePreset.value === 'today') return { startAt: todayStart, endAt: now }
  if (rangePreset.value === '7d') return { startAt: todayStart - 6 * DAY_MS, endAt: now }
  if (rangePreset.value === '30d') return { startAt: todayStart - 29 * DAY_MS, endAt: now }
  if (isValidCustomRange()) {
    return {
      startAt: parseShanghaiDate(customRange.value[0]!),
      endAt: parseShanghaiDate(customRange.value[1]!) + DAY_MS - 1,
    }
  }
  return { startAt: todayStart, endAt: now }
}

const statsRangeLabel = computed(() => {
  const range = currentStatsRange()
  const start = shanghaiDateParts(range.startAt)
  const end = shanghaiDateParts(range.endAt)
  return `${start.year}-${pad2(start.month)}-${pad2(start.day)} ~ ${end.year}-${pad2(end.month)}-${pad2(end.day)}`
})

function onPresetChange() {
  if (rangePreset.value === 'custom') {
    if (isValidCustomRange()) {
      const startAt = parseShanghaiDate(customRange.value[0]!)
      const endAt = parseShanghaiDate(customRange.value[1]!) + DAY_MS - 1
      granularity.value = defaultGranularity(startAt, endAt)
    } else {
      rangePreset.value = 'today'
      const range = currentStatsRange()
      granularity.value = defaultGranularity(range.startAt, range.endAt)
    }
    void loadStats()
    return
  }
  const range = currentStatsRange()
  granularity.value = defaultGranularity(range.startAt, range.endAt)
  void loadStats()
}

function onCustomRangeChange(_dates: unknown, dateStrings: [string, string]) {
  if (!dateStrings[0] || !dateStrings[1]) {
    message.warning('请选择完整的起止日期')
    return
  }
  rangePreset.value = 'custom'
  customRange.value = [dateStrings[0], dateStrings[1]]
  const startAt = parseShanghaiDate(dateStrings[0])
  const endAt = parseShanghaiDate(dateStrings[1]) + DAY_MS - 1
  granularity.value = defaultGranularity(startAt, endAt)
  void loadStats()
}

function onGranularityChange() {
  void loadStats()
}

function onRefreshStats() {
  void loadStats()
}

function renderChart(data: TokenStatsData) {
  if (!chartEl.value) return
  chart ??= initChart(chartEl.value)
  const labels = data.buckets.map((bucket) => bucket.bucket.replace('T', ' '))
  chart.setOption(
    {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: {
        data: ['输入 Token', '输出 Token'],
        top: 0,
        textStyle: { color: '#40544a' },
      },
      grid: { left: 56, right: 20, top: 44, bottom: 46 },
      xAxis: {
        type: 'category',
        data: labels,
        axisLabel: { rotate: labels.length > 10 ? 45 : 0, color: '#718078' },
        axisLine: { lineStyle: { color: '#d7e0d7' } },
        axisTick: { alignWithLabel: true },
      },
      yAxis: {
        type: 'value',
        name: 'Token',
        nameTextStyle: { color: '#849189' },
        axisLabel: { color: '#718078' },
        splitLine: { lineStyle: { color: '#edf0eb' } },
      },
      series: [
        {
          name: '输入 Token',
          type: 'bar',
          barMaxWidth: 26,
          data: data.buckets.map((bucket) => bucket.inputTokens),
          itemStyle: { color: '#163c32', borderRadius: [4, 4, 0, 0] },
        },
        {
          name: '输出 Token',
          type: 'bar',
          barMaxWidth: 26,
          data: data.buckets.map((bucket) => bucket.outputTokens),
          itemStyle: { color: '#b17837', borderRadius: [4, 4, 0, 0] },
        },
      ],
    },
    { notMerge: true },
  )
}

async function loadStats() {
  const range = currentStatsRange()
  statsLoading.value = true
  try {
    const data = await fetchTokenStats({ startAt: range.startAt, endAt: range.endAt, granularity: granularity.value })
    statsData.value = data
    // 区间过大等服务端会降级粒度，前端以响应为准
    granularity.value = data.granularity
    await nextTick()
    renderChart(data)
    chart?.resize()
  } catch (err) {
    message.error(getErrorMessage(err))
  } finally {
    statsLoading.value = false
  }
}

function onWindowResize() {
  chart?.resize()
}

watch(activeTab, async (tab) => {
  await nextTick()
  if (tab !== 'stats') return
  if (statsData.value) {
    renderChart(statsData.value)
    chart?.resize()
  } else {
    void loadStats()
  }
})

onMounted(() => {
  const today = shanghaiDateString(Date.now())
  customRange.value = [today, today]
  window.addEventListener('resize', onWindowResize)
  void loadList()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onWindowResize)
  chart?.dispose()
  chart = null
})
</script>
<style scoped>
.logs-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #f5f7f2 0%, #eef3eb 55%, #f7f4ed 100%);
  color: #1d2924;
}

.page-shell {
  display: flex;
  flex-direction: column;
  max-width: 1280px;
  min-height: 100vh;
  margin: 0 auto;
  padding: 20px 48px;
}

.site-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 20px;
  border-bottom: 1px solid #d7e0d7;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #163c32;
  text-decoration: none;
}

.brand-mark {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  border-radius: 12px;
  background: #163c32;
  color: #f8d27a;
  font-size: 18px;
}

.brand-copy {
  display: flex;
  flex-direction: column;
}

.brand-name {
  color: #163c32;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.18em;
}

.brand-caption {
  color: #718078;
  font-size: 12px;
}

.logs-tabs {
  margin-top: 4px;
}

.tab-label {
  font-weight: 600;
  letter-spacing: 0.04em;
}

.query-card {
  padding: 16px 18px;
  border: 1px solid #d9e1d8;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.9);
}

.query-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 18px;
}

.stats-query-row {
  align-items: center;
}

.query-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.query-label {
  flex: 0 0 auto;
  color: #718078;
  font-size: 12px;
}

.query-control {
  width: 190px;
}

.query-select {
  width: 120px;
}

.query-range {
  width: 232px;
}

.query-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

.preset-radios {
  margin-right: 4px;
}

.table-card,
.stats-card {
  margin-top: 16px;
  padding: 16px 18px;
  border: 1px solid #d9e1d8;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.9);
}

.log-type-tag {
  border-radius: 6px;
  font-size: 12px;
}

.cell-ellipsis {
  display: block;
  max-width: 420px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-line {
  display: flex;
  align-items: center;
  gap: 6px;
}

.resp-code {
  color: #718078;
  font-family: 'SFMono-Regular', Consolas, monospace;
  font-size: 12px;
}

.resp-code.is-failed {
  color: #cf1322;
  font-weight: 700;
}

.status-error {
  max-width: 280px;
  margin-top: 2px;
  overflow: hidden;
  color: #cf1322;
  font-size: 12px;
  line-height: 1.5;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dur-total {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.dur-sub {
  margin-top: 2px;
  color: #8a9990;
  font-size: 11px;
  line-height: 1.5;
  white-space: nowrap;
}

/* ── 行展开明细 ── */

.detail-panel {
  min-height: 120px;
  padding: 14px 16px 4px;
}

.detail-section {
  margin-bottom: 18px;
}

.detail-section-title {
  margin: 0 0 10px;
  color: #163c32;
  font-size: 13px;
  font-weight: 600;
}

.sub-empty {
  padding: 14px 0 4px;
  color: #9aa69e;
  font-size: 12px;
}

.sub-table {
  border: 1px solid #e3e9e2;
  border-radius: 12px;
  overflow: hidden;
}

.sub-meta {
  margin-top: 2px;
  color: #94a099;
  font-size: 11px;
  line-height: 1.5;
}

.err-text {
  color: #cf1322;
}

.llm-seq {
  color: #b17837;
  font-weight: 600;
}

.answer-pre {
  margin: 0;
  padding: 12px 14px;
  border: 1px solid #e3e9e2;
  border-radius: 10px;
  background: #fbfdfa;
  color: #40544a;
  font-family: 'Noto Sans SC', 'Segoe UI', sans-serif;
  font-size: 13px;
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-word;
}

.content-block {
  margin-bottom: 8px;
}

.content-block:last-child {
  margin-bottom: 0;
}

.content-label {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
  color: #849189;
  font-size: 11px;
  font-weight: 600;
}

.json-pre {
  max-height: 260px;
  margin: 0;
  padding: 10px 12px;
  overflow: auto;
  border: 1px solid #e3e9e2;
  border-radius: 10px;
  background: #0f1c17;
  color: #cfe3d8;
  font-family: 'SFMono-Regular', Consolas, 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}

.json-pre :deep(.json-key) {
  color: #e8b76a;
}

.json-pre :deep(.json-string) {
  color: #7fd4a8;
}

.json-pre :deep(.json-number) {
  color: #7fb3f5;
}

.json-pre :deep(.json-literal) {
  color: #ef8b6f;
}

/* ── Token 统计 ── */

.stats-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.stats-range-label {
  color: #40544a;
  font-size: 13px;
  font-weight: 600;
}

.stats-granularity-hint {
  margin-left: 10px;
  color: #94a099;
  font-size: 11px;
}

.chart-canvas {
  width: 100%;
  height: 380px;
}

.chart-empty {
  display: grid;
  place-items: center;
  margin-top: -380px;
  pointer-events: none;
}

@media (max-width: 900px) {
  .page-shell {
    padding: 20px 24px;
  }
  .query-actions {
    margin-left: 0;
  }
}

@media (max-width: 560px) {
  .page-shell {
    padding: 16px;
  }
  .brand-name {
    font-size: 12px;
  }
  .query-control,
  .query-range {
    width: 100%;
  }
}
</style>

<style>
.dur-tooltip {
  font-size: 12px;
  line-height: 1.9;
}

.dur-tooltip div span {
  font-variant-numeric: tabular-nums;
}
</style>