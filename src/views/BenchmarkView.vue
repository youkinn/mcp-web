<template>
  <main class="benchmark-page">
    <div class="page-shell">
      <header class="site-header">
        <RouterLink to="/" class="brand">
          <span class="brand-mark">M</span>
          <span class="brand-copy">
            <span class="brand-name">MCP WORKSPACE</span>
            <span class="brand-caption">Benchmark console</span>
          </span>
        </RouterLink>
        <div class="header-actions">
          <RouterLink to="/cache">
            <a-button size="small">缓存控制台</a-button>
          </RouterLink>
          <RouterLink to="/logs">
            <a-button size="small">← 返回日志</a-button>
          </RouterLink>
          <RouterLink to="/chat">
            <a-button size="small">返回聊天</a-button>
          </RouterLink>
          <a-tag color="green">服务就绪</a-tag>
        </div>
      </header>

      <div class="bench-header">
        <div class="bench-title-block">
          <h2 class="bench-title">评测执行</h2>
          <p class="bench-subtitle">十三段模板回归 · 零 LLM · 判对 = 证据段进检索 top5，6–10 兜底，其余未命中</p>
        </div>
        <div class="bench-run-block">
          <span class="bench-run-hint">完整回归约数十秒，建议联调阶段手工触发</span>
          <a-button type="primary" size="large" :loading="runLoading" :disabled="runLoading" @click="onRun">
            执行
          </a-button>
        </div>
      </div>

      <div v-if="snapshotLoading && snapshotData === null && !runLoading" class="bench-loading">
        <a-spin />
        <span class="bench-loading-text">加载中…</span>
      </div>

      <div v-else-if="!runLoading && snapshotData === null" class="bench-empty">
        <a-empty>
          <template #description>
            <p class="bench-empty-text">暂无执行结果，点击「执行」运行一次评测。</p>
            <p class="bench-empty-hint">需先启动 sango dev 服务（设置 SANGO_DEV_HTTP_PORT=8787 后启动 sango）；仅看页面效果可先用 mock 数据。</p>
          </template>
        </a-empty>
      </div>

      <template v-if="snapshotData">
        <div class="bench-current">
          <span class="bench-current-label">当前快照</span>
          <span class="bench-current-run">{{ snapshotData.runId }}</span>
          <span class="bench-current-time">{{ formatBenchmarkTime(snapshotData.time) }}</span>
          <a-tag color="green">通过 {{ snapshotData.summary.top5 }}/{{ snapshotData.summary.total }}</a-tag>
          <a-tag color="gold">兜底 {{ snapshotData.summary.tail }}</a-tag>
          <a-tag color="red">未命中 {{ snapshotData.summary.miss }}</a-tag>
        </div>

        <a-tabs v-model:activeKey="activeTab" class="bench-tabs" @change="onTabChange">
          <a-tab-pane key="summary" tab="类别汇总">
        <section class="bench-card">
          <div class="card-head">
            <h3>类别汇总</h3>
            <a-select v-model:value="filter" class="filter-select" :options="filterOptions" @change="onFilterChange" />
          </div>
          <a-table
            :columns="categoryColumns"
            :data-source="fullCategoryRows"
            :row-key="(record: { name: string }) => record.name"
            v-model:expandedRowKeys="expandedCategories"
            :pagination="false"
            :loading="snapshotLoading"
            size="middle"
            class="cat-table"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'name'">
                <span class="cat-name">{{ record.name }}</span>
              </template>
              <template v-else-if="column.key === 'total'">{{ record.total }}</template>
              <template v-else-if="column.key === 'top5'">{{ record.top5 }}</template>
              <template v-else-if="column.key === 'fail'">{{ record.tail + record.miss }}</template>
              <template v-else-if="column.key === 'passRate'">
                <span :class="rateClass(record.passRate)">{{ formatRatio(record.top5, record.total) }}</span>
              </template>
              <template v-else-if="column.key === 'hit5'">{{ record.top5 }}</template>
            </template>

            <template #summary>
              <a-table-summary>
                <a-table-summary-row>
                  <a-table-summary-cell :index="0" />
                  <a-table-summary-cell :index="1" class="sum-cell-name">合计</a-table-summary-cell>
                  <a-table-summary-cell :index="2" align="center" class="sum-cell">{{ summaryTotal?.total ?? 0 }}</a-table-summary-cell>
                  <a-table-summary-cell :index="3" align="center" class="sum-cell">{{ summaryTotal?.top5 ?? 0 }}</a-table-summary-cell>
                  <a-table-summary-cell :index="4" align="center" class="sum-cell">{{ summaryTotal?.fail ?? 0 }}</a-table-summary-cell>
                  <a-table-summary-cell :index="5" align="center" class="sum-cell">{{ summaryTotal?.top5 ?? 0 }}</a-table-summary-cell>
                  <a-table-summary-cell :index="6" align="center" class="sum-cell">
                    {{ formatRatio(summaryTotal?.top5 ?? 0, summaryTotal?.total ?? 0) }}
                  </a-table-summary-cell>
                </a-table-summary-row>
              </a-table-summary>
            </template>

            <template #expandedRowRender="{ record }">
              <div class="cat-detail">
                <div class="cat-detail-head">
                  <a-tag color="blue">{{ record.name }}</a-tag>
                  <span>共 {{ record.total }} 题，当前筛选「{{ filterLabel }}」显示 {{ detailRowsOf(record.name).length }} 题</span>
                </div>
                <div v-if="detailRowsOf(record.name).length === 0" class="cat-detail-empty">该筛选下此类别无题目</div>
                <a-table
                  v-else
                  :columns="questionColumns"
                  :data-source="detailRowsOf(record.name)"
                  :row-key="(q: BenchmarkResultItem) => q.id"
                  :pagination="false"
                  size="small"
                  table-layout="fixed"
                  class="question-table"
                >
                  <template #bodyCell="{ column, record: q }">
                    <template v-if="column.key === 'seq'">{{ questionSeq(q) }}</template>
                    <template v-else-if="column.key === 'question'">
                      <a-tooltip placement="topLeft">
                        <template #title>{{ q.question }}</template>
                        <span class="cell-ellipsis">{{ q.question }}</span>
                      </a-tooltip>
                    </template>
                    <template v-else-if="column.key === 'answer'">
                      <a-tooltip placement="topLeft">
                        <template #title>{{ q.answer }}</template>
                        <span class="cell-ellipsis">{{ q.answer }}</span>
                      </a-tooltip>
                    </template>
                    <template v-else-if="column.key === 'evidence'">
                      <a-tooltip placement="topLeft">
                        <template #title>{{ q.evidence }}</template>
                        <span class="cell-ellipsis">{{ q.evidence }}</span>
                      </a-tooltip>
                    </template>
                    <template v-else-if="column.key === 'rank'">
                      <span :class="{ 'rank-zero': q.rank === 0 }">{{ q.rank === 0 ? '未召回' : q.rank }}</span>
                    </template>
                    <template v-else-if="column.key === 'status'">
                      <a-tag :color="statusColor(q.status)">{{ statusLabel(q.status) }}</a-tag>
                    </template>
                    <template v-else-if="column.key === 'candidates'">
                      <div v-if="q.candidates.length === 0" class="cand-empty">—</div>
                      <a-button v-else type="link" size="small" @click="openCandidateModal(q)">查看</a-button>
                    </template>
                  </template>
                </a-table>
              </div>
            </template>
          </a-table>
        </section>

        <section class="bench-card">
          <div class="card-head"><h3>历史快照（点击行切换查看该次执行）</h3></div>
          <a-table
            :columns="historyColumns"
            :data-source="historyItems"
            :row-key="(item: BenchmarkHistoryItem) => item.runId"
            :loading="historyLoading"
            :pagination="false"
            size="small"
            :row-class-name="historyRowClass"
            :custom-row="historyRowHandlers"
            class="history-table"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'runId'">
                <span class="history-run">{{ record.runId }}</span>
                <a-tag v-if="record.runId === selectedRunId" class="history-current-tag" color="green">当前</a-tag>
              </template>
              <template v-else-if="column.key === 'time'">{{ formatBenchmarkTime(record.time) }}</template>
              <template v-else-if="column.key === 'summary'">{{ historySummaryText(record) }}</template>
            </template>
          </a-table>
        </section>
          </a-tab-pane>
          <a-tab-pane key="charts" tab="图表">
        <section class="bench-card">
          <div class="card-head"><h3>类别分布</h3></div>
          <div v-if="snapshotLoading" class="chart-state"><a-spin size="small" /><span>快照加载中…</span></div>
          <div v-else ref="barChartEl" class="chart-canvas" />
        </section>

        <section class="bench-card">
          <div class="card-head">
            <a-tooltip title="按 runId 依次展示历史整体对比">
              <h3>通过率趋势</h3>
            </a-tooltip>
          </div>
          <div v-if="historyLoading && historyItems.length === 0" class="chart-state"><a-spin size="small" /><span>历史加载中…</span></div>
          <div v-else-if="historyItems.length === 0" class="chart-state"><span>暂无历史执行记录</span></div>
          <div v-else ref="trendChartEl" class="chart-canvas" />
        </section>
          </a-tab-pane>
        </a-tabs>
      </template>
    </div>

    <SangoChapterReader
      v-model:open="readerOpen"
      :chapter="readerChapter"
      :chapter-title="readerChapterTitle"
      :chunk-id="readerChunkId"
    />
    <a-modal
      v-model:open="candidateModalOpen"
      :title="`候选（${candidateModalResult?.candidates.length ?? 0} 个）`"
      :footer="null"
      width="min(720px, 90vw)"
    >
      <ul class="candidate-modal-list">
        <li
          v-for="c in candidateModalResult?.candidates ?? []"
          :key="c.id"
          class="candidate-modal-item"
          @click="openReader(c)"
        >
          <span class="candidate-modal-id">{{ shortCandidateId(c.id) }}</span>
          <span class="candidate-modal-title">{{ c.title }}</span>
        </li>
      </ul>
    </a-modal>
  </main>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import { init as initChart, use } from 'echarts/core'
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsType } from 'echarts/core'
import SangoChapterReader from '../components/SangoChapterReader.vue'
import {
  getBenchmarkHistory,
  getBenchmarkLatest,
  getBenchmarkSnapshot,
  getErrorMessage,
  postBenchmarkRun,
  type BenchmarkCandidate,
  type BenchmarkData,
  type BenchmarkHistoryItem,
  type BenchmarkResultItem,
  type BenchmarkStatus,
} from '../api/client'
import { chapterFromChunkId } from '../utils/sangoChapter'

use([BarChart, LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])

// ── 常量 ──

type BenchmarkFilter = 'all' | 'top5' | 'top10' | 'top10+'

const STATUS_LABELS: Record<BenchmarkStatus, string> = {
  top5: '通过',
  tail: '兜底',
  miss: '未命中',
}

const STATUS_COLORS: Record<BenchmarkStatus, string> = {
  top5: 'success',
  tail: 'gold',
  miss: 'error',
}

const filterOptions = [
  { value: 'all', label: '全部' },
  { value: 'top5', label: 'top5（rank 1–5）' },
  { value: 'top10', label: 'top10（rank 6–10）' },
  { value: 'top10+', label: 'top10+（rank>10 或未召回）' },
]

const SERIES_DEFS = [
  { key: 'top5', name: '通过', color: '#2e6d56' },
  { key: 'tail', name: '兜底', color: '#b17837' },
  { key: 'miss', name: '未命中', color: '#c25b4e' },
] as const

const BAR_GRID = { left: 56, right: 64, top: 56, bottom: 48 } as const
const TREND_GRID = { left: 56, right: 24, top: 36, bottom: 44 } as const

// ── 状态 ──

const snapshotData = ref<BenchmarkData | null>(null)
const snapshotLoading = ref(false)
const selectedRunId = ref<string | null>(null)
const historyItems = ref<BenchmarkHistoryItem[]>([])
const historyLoading = ref(false)
const runLoading = ref(false)
const filter = ref<BenchmarkFilter>('all')
const expandedCategories = ref<string[]>([])
const ACTIVE_TAB_KEY = 'benchmark-active-tab'

function restoreActiveTab(): 'summary' | 'charts' {
  try {
    const saved = sessionStorage.getItem(ACTIVE_TAB_KEY)
    return saved === 'summary' || saved === 'charts' ? saved : 'summary'
  } catch {
    return 'summary'
  }
}

const activeTab = ref<'summary' | 'charts'>(restoreActiveTab())

const candidateModalOpen = ref(false)
const candidateModalResult = ref<BenchmarkResultItem | null>(null)

const barChartEl = ref<HTMLElement | null>(null)
const trendChartEl = ref<HTMLElement | null>(null)
let barChart: EChartsType | null = null
let trendChart: EChartsType | null = null
// zr 点击处理器只在图表首次初始化时绑定一次（setOption notMerge 不影响 zr 事件）
let barChartClickBound = false

const readerOpen = ref(false)
const readerChapter = ref(1)
const readerChapterTitle = ref('')
const readerChunkId = ref<string | undefined>(undefined)

// ── 格式化 ──

function formatPercent(ratio: number | null): string {
  if (ratio === null || !Number.isFinite(ratio)) return '—'
  return `${(ratio * 100).toFixed(1)}%`
}

function formatRatio(numerator: number, denominator: number): string {
  if (!denominator) return '—'
  return formatPercent(numerator / denominator)
}

function categoryOf(item: BenchmarkResultItem): string {
  return item.id.split('#')[0]?.trim() || item.id
}

function shortRunId(runId: string): string {
  return runId.replace(/^feat-A015-/, '')
}

/** 快照时间展示：ISO 串去 T/Z 后缀（UTC 直显），其余原样（sango 后端格式未定契约） */
function formatBenchmarkTime(raw: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(raw)
  return m ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}` : raw
}

const filterLabel = computed(() => filterOptions.find((o) => o.value === filter.value)?.label ?? '')

function statusLabel(status: unknown): string {
  return STATUS_LABELS[status as BenchmarkStatus] ?? String(status)
}

function statusColor(status: unknown): string {
  return STATUS_COLORS[status as BenchmarkStatus] ?? 'default'
}

// ── 汇总表（固定口径：summary.category）──

interface CategoryRow {
  name: string
  total: number
  top5: number
  tail: number
  miss: number
  passRate: number | null
}

const categoryColumns = [
  { key: 'name', title: '类别' },
  { key: 'total', title: '总题数', align: 'center', width: 90 },
  { key: 'top5', title: '通过数', align: 'center', width: 90 },
  { key: 'fail', title: '失败数', align: 'center', width: 90 },
  { key: 'hit5', title: 'Top5命中数', align: 'center', width: 110 },
  { key: 'passRate', title: '通过率', align: 'center', width: 110 },
]

const fullCategoryRows = computed<CategoryRow[]>(() => {
  const summary = snapshotData.value?.summary
  if (!summary) return []
  return Object.entries(summary.category).map(([name, cat]) => ({
    name,
    total: cat.total,
    top5: cat.top5,
    tail: cat.tail,
    miss: cat.miss,
    passRate: cat.total > 0 ? cat.top5 / cat.total : null,
  }))
})

const summaryTotal = computed(() => {
  const summary = snapshotData.value?.summary
  if (!summary) return null
  return {
    total: summary.total,
    top5: summary.top5,
    fail: summary.tail + summary.miss,
  }
})

function rateClass(ratio: number | null): string {
  if (ratio === null) return ''
  if (ratio >= 0.7) return 'rate-high'
  if (ratio >= 0.5) return 'rate-mid'
  return 'rate-low'
}

// ── 明细（跟随筛选）──

const visibleResults = computed<BenchmarkResultItem[]>(() => {
  const results = snapshotData.value?.results ?? []
  if (filter.value === 'top5') return results.filter((r) => r.rank >= 1 && r.rank <= 5)
  if (filter.value === 'top10') return results.filter((r) => r.rank >= 6 && r.rank <= 10)
  if (filter.value === 'top10+') return results.filter((r) => r.rank > 10 || r.rank === 0)
  return results
})

const questionColumns = [
  { key: 'seq', title: '序号', width: 56, align: 'center' },
  { key: 'question', title: '问题', width: 260 },
  { key: 'answer', title: '参考答案', width: 150 },
  { key: 'evidence', title: '期望命中', width: 220 },
  { key: 'rank', title: '排名', width: 80, align: 'center' },
  { key: 'status', title: '状态', width: 90, align: 'center' },
  { key: 'candidates', title: '候选', width: 90 },
]

function detailRowsOf(category: string): BenchmarkResultItem[] {
  return visibleResults.value.filter((r) => categoryOf(r) === category)
}

function questionSeq(item: BenchmarkResultItem): number {
  const idx = snapshotData.value?.results.findIndex((r) => r.id === item.id) ?? -1
  return idx >= 0 ? idx + 1 : 0
}

function shortCandidateId(id: string): string {
  const i = id.indexOf(':')
  return i >= 0 ? id.slice(i + 1) : id
}

function openCandidateModal(item: BenchmarkResultItem): void {
  candidateModalResult.value = item
  candidateModalOpen.value = true
}

function onFilterChange(): void {
  expandedCategories.value = []
}

// ── 图表 ──

interface ChartRow {
  name: string
  total: number
  top5: number
  tail: number
  miss: number
}

const chartCategoryRows = computed<ChartRow[]>(() => {
  const map = new Map<string, ChartRow>()
  for (const item of visibleResults.value) {
    const name = categoryOf(item)
    let row = map.get(name)
    if (!row) {
      row = { name, total: 0, top5: 0, tail: 0, miss: 0 }
      map.set(name, row)
    }
    row.total += 1
    if (item.status === 'top5') row.top5 += 1
    else if (item.status === 'tail') row.tail += 1
    else row.miss += 1
  }
  const order = snapshotData.value ? Object.keys(snapshotData.value.summary.category) : []
  return [...map.values()].sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name))
})

function renderBarChart(): void {
  const el = barChartEl.value
  if (!el || !snapshotData.value) return
  if (barChart && barChart.getDom() !== el) {
    barChart.dispose()
    barChart = null
    barChartClickBound = false
  }
  barChart ??= initChart(el)
  if (!barChartClickBound) {
    barChart.getZr().on('click', onBarChartClick)
    barChartClickBound = true
  }
  const rows = chartCategoryRows.value
  barChart.setOption(
    {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { top: 12, data: SERIES_DEFS.map((d) => d.name) },
      grid: BAR_GRID,
      xAxis: {
        type: 'category',
        data: rows.map((r) => r.name),
        axisLabel: {
          rotate: rows.length > 6 ? 30 : 0,
          interval: 0,
          color: '#718078',
        },
        axisLine: { lineStyle: { color: '#d7e0d7' } },
        axisTick: { alignWithLabel: true },
      },
      yAxis: [
        {
          type: 'value',
          name: '题数',
          minInterval: 1,
          axisLabel: { color: '#718078' },
          splitLine: { lineStyle: { color: '#edf0eb' } },
        },
        {
          type: 'value',
          name: '通过率 %',
          min: 0,
          max: 100,
          axisLabel: { color: '#718078' },
          splitLine: { show: false },
        },
      ],
      series: [
        ...SERIES_DEFS.map((def) => ({
          name: def.name,
          type: 'bar' as const,
          stack: 'benchmark',
          barMaxWidth: 26,
          itemStyle: { color: def.color },
          data: rows.map((r) => r[def.key]),
        })),
        {
          name: '通过率',
          type: 'line' as const,
          yAxisIndex: 1,
          smooth: true,
          symbolSize: 6,
          lineStyle: { color: '#163c32', width: 2 },
          itemStyle: { color: '#163c32' },
          data: rows.map((r) => (r.total > 0 ? (r.top5 / r.total) * 100 : null)),
        },
      ],
    },
    { notMerge: true },
  )
}

function renderTrendChart(): void {
  const el = trendChartEl.value
  if (!el) return
  if (trendChart && trendChart.getDom() !== el) {
    trendChart.dispose()
    trendChart = null
  }
  trendChart ??= initChart(el)
  // 接口按时间倒序返回，折线按 runId 从早到晚依次展示
  const items = [...historyItems.value].reverse()
  if (items.length === 0) {
    trendChart.clear()
    return
  }
  trendChart.setOption(
    {
      tooltip: {
        trigger: 'axis',
        formatter: (params: unknown) => {
          const array = Array.isArray(params) ? params : [params]
          const first = array[0] as { dataIndex?: number } | undefined
          const item = items[first?.dataIndex ?? 0]
          return item ? `${shortRunId(item.runId)}：<b>${formatRatio(item.summary.top5, item.summary.total)}</b>` : ''
        },
      },
      grid: TREND_GRID,
      xAxis: {
        type: 'category',
        data: items.map((i) => shortRunId(i.runId)),
        axisLabel: {
          rotate: items.length > 6 ? 30 : 0,
          color: '#718078',
        },
        axisLine: { lineStyle: { color: '#d7e0d7' } },
        axisTick: { alignWithLabel: true },
      },
      yAxis: {
        type: 'value',
        name: '通过率 %',
        min: 0,
        max: 100,
        axisLabel: { color: '#718078' },
        splitLine: { lineStyle: { color: '#edf0eb' } },
      },
      series: [
        {
          name: '通过率',
          type: 'line' as const,
          smooth: true,
          symbolSize: 7,
          lineStyle: { color: '#2e6d56', width: 2 },
          itemStyle: { color: '#2e6d56' },
          areaStyle: { color: 'rgba(46,109,86,0.08)' },
          data: items.map((i) => (i.summary.total > 0 ? (i.summary.top5 / i.summary.total) * 100 : null)),
        },
      ],
    },
    { notMerge: true },
  )
}

function onBarChartClick(event: unknown): void {
  const chart = barChart
  if (!chart || !snapshotData.value) return
  const ev = event as { offsetX?: number; offsetY?: number }
  if (typeof ev.offsetX !== 'number' || typeof ev.offsetY !== 'number') return
  const inGrid =
    ev.offsetX >= BAR_GRID.left &&
    ev.offsetX < chart.getWidth() - BAR_GRID.right &&
    ev.offsetY >= BAR_GRID.top &&
    ev.offsetY < chart.getHeight() - BAR_GRID.bottom
  if (!inGrid) return
  const mapped = chart.convertFromPixel({ gridIndex: 0 }, [ev.offsetX, ev.offsetY])
  const index = Array.isArray(mapped) ? Math.round(mapped[0]) : NaN
  const rows = chartCategoryRows.value
  if (Number.isNaN(index) || index < 0 || index >= rows.length) return
  const row = rows[index]
  if (row) expandCategory(row.name)
}

function expandCategory(name: string): void {
  activeTab.value = 'summary'
  if (!expandedCategories.value.includes(name)) {
    expandedCategories.value = [...expandedCategories.value, name]
  }
  void nextTick(() => {
    document.querySelector(`.cat-table [data-row-key="${name}"]`)?.scrollIntoView({ block: 'center' })
  })
}

function disposeCharts(): void {
  barChart?.dispose()
  barChart = null
  barChartClickBound = false
  trendChart?.dispose()
  trendChart = null
}

function onTabChange(key: string | number): void {
  // echarts 在隐藏 tab 中容器尺寸为 0，切回「图表」时 dispose 重建后重绘
  if (String(key) !== 'charts') return
  disposeCharts()
  void nextTick(() => {
    renderBarChart()
    renderTrendChart()
    barChart?.resize()
    trendChart?.resize()
  })
}

function onWindowResize(): void {
  barChart?.resize()
  trendChart?.resize()
}

// ── 数据加载 ──

async function loadInitial(): Promise<void> {
  snapshotLoading.value = true
  try {
    const latest = await getBenchmarkLatest()
    snapshotData.value = latest
    selectedRunId.value = latest?.runId ?? null
  } catch (err) {
    message.error(getErrorMessage(err))
  } finally {
    snapshotLoading.value = false
  }
}

async function loadHistory(): Promise<void> {
  historyLoading.value = true
  try {
    historyItems.value = await getBenchmarkHistory()
  } catch (err) {
    message.error(getErrorMessage(err))
  } finally {
    historyLoading.value = false
  }
}

async function onRun(): Promise<void> {
  if (runLoading.value) return
  runLoading.value = true
  try {
    const data = await postBenchmarkRun()
    snapshotData.value = data
    selectedRunId.value = data.runId
    expandedCategories.value = []
    candidateModalOpen.value = false
    message.success(
      `评测完成：通过 ${data.summary.top5}/${data.summary.total}（${formatRatio(data.summary.top5, data.summary.total)}）`,
    )
    await loadHistory()
  } catch (err) {
    message.error(getErrorMessage(err))
  } finally {
    runLoading.value = false
  }
}

// ── 历史切换 ──

const historyColumns = [
  { key: 'runId', title: 'runId', width: 230 },
  { key: 'time', title: '时间', width: 210 },
  { key: 'summary', title: '摘要' },
]

function historySummaryText(item: BenchmarkHistoryItem): string {
  const s = item.summary
  return `通过 ${s.top5}/${s.total}（${formatRatio(s.top5, s.total)}） · 兜底 ${s.tail} · 未命中 ${s.miss}`
}

function historyRowClass(record: BenchmarkHistoryItem): string {
  return record.runId === selectedRunId.value ? 'history-row-current' : ''
}

function historyRowHandlers(record: BenchmarkHistoryItem): { onClick: () => void } {
  return { onClick: () => void onHistoryClick(record) }
}

async function onHistoryClick(item: BenchmarkHistoryItem): Promise<void> {
  if (item.runId === selectedRunId.value || runLoading.value) return
  snapshotLoading.value = true
  try {
    const data = await getBenchmarkSnapshot(item.runId)
    if (!data) {
      message.warning(`快照 ${item.runId} 不存在或已被清理`)
      return
    }
    snapshotData.value = data
    selectedRunId.value = item.runId
    expandedCategories.value = []
    candidateModalOpen.value = false
  } catch (err) {
    message.error(getErrorMessage(err))
  } finally {
    snapshotLoading.value = false
  }
}

// ── 原文查看 ──

function openReader(candidate: BenchmarkCandidate): void {
  const chapter = chapterFromChunkId(candidate.id)
  if (Number.isNaN(chapter)) {
    message.warning(`无法解析候选 chunkId（${candidate.id}）的回号`)
    return
  }
  readerChapter.value = chapter
  readerChapterTitle.value = candidate.title
  readerChunkId.value = candidate.id
  readerOpen.value = true
}

// ── 生命周期 ──

// 标签页选择跨刷新 / 重进保持（sessionStorage 持久化，隐私模式等异常静默降级）
watch(activeTab, (key) => {
  try {
    sessionStorage.setItem(ACTIVE_TAB_KEY, key)
  } catch {
    // 持久化失败不影响本次会话内标签切换
  }
})

watch(
  [snapshotData, snapshotLoading, filter, historyItems],
  async () => {
    await nextTick()
    // 图表 tab 未激活时容器尺寸为 0，跳过绘制；切到「图表」由 onTabChange 重建
    if (activeTab.value !== 'charts') return
    renderBarChart()
    renderTrendChart()
  },
  { immediate: true },
)

onMounted(() => {
  window.addEventListener('resize', onWindowResize)
  void Promise.all([loadInitial(), loadHistory()])
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onWindowResize)
  barChart?.dispose()
  trendChart?.dispose()
  barChart = null
  trendChart = null
})
</script>

<style scoped>
.benchmark-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #f5f7f2 0%, #eef3eb 55%, #f7f4ed 100%);
  color: #1d2924;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.bench-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  padding: 28px 0 8px;
}

.bench-title {
  margin: 0;
  color: #163c32;
  font-size: 24px;
}

.bench-subtitle {
  margin: 6px 0 0;
  color: #718078;
  font-size: 13px;
}

.bench-run-block {
  display: flex;
  align-items: center;
  gap: 12px;
}

.bench-run-hint {
  color: #8b9990;
  font-size: 12px;
}

.bench-loading {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: center;
  padding: 180px 0;
  color: #718078;
}

.bench-empty {
  display: flex;
  justify-content: center;
  padding: 140px 0;
}

.bench-empty-text {
  margin: 0 0 6px;
  color: #718078;
}

.bench-empty-hint {
  margin: 0;
  color: #8b9990;
  font-size: 12px;
}

.bench-current {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 16px;
  padding: 10px 14px;
  border: 1px solid #d7e0d7;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.6);
  font-size: 13px;
}

.bench-current-label {
  color: #718078;
}

.bench-current-run {
  font-weight: 700;
  color: #163c32;
}

.bench-current-time {
  color: #8b9990;
  font-size: 12px;
}

.bench-card {
  margin-top: 16px;
  padding: 18px 20px;
  border: 1px solid #d9e1d8;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.85);
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.card-head h3 {
  margin: 0;
  color: #163c32;
  font-size: 16px;
}

.filter-select {
  width: 230px;
}

.bench-tabs :deep(.ant-tabs-nav) {
  margin-bottom: 0;
}

.cat-table :deep(.ant-table-thead > tr > th) {
  background: #f2f6f1;
}

.cat-name {
  font-weight: 600;
  color: #163c32;
}

.rate-high {
  color: #2e6d56;
  font-weight: 600;
}

.rate-mid {
  color: #b17837;
  font-weight: 600;
}

.rate-low {
  color: #c25b4e;
  font-weight: 600;
}

.sum-cell-name {
  font-weight: 700;
  color: #163c32;
}

.sum-cell {
  font-weight: 600;
  color: #163c32;
}

.cat-detail {
  padding: 4px 8px 8px;
  border-radius: 10px;
  background: #fafcf8;
}

.cat-detail-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  color: #718078;
  font-size: 12px;
}

.cat-detail-empty {
  padding: 18px 0;
  color: #8b9990;
  font-size: 13px;
  text-align: center;
}

.chart-canvas {
  width: 100%;
  height: 320px;
}

.chart-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  height: 320px;
  color: #8b9990;
  font-size: 13px;
}

.cell-ellipsis {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
}

.rank-zero {
  color: #c25b4e;
}

.cand-empty {
  color: #8b9990;
}

.candidate-modal-list {
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 60vh;
  overflow-y: auto;
}

.candidate-modal-item {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
}

.candidate-modal-item:hover {
  background: #f0f5f2;
}

.candidate-modal-id {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
  font-size: 12px;
  color: #1d2924;
  flex-shrink: 0;
}

.history-run {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
  color: #163c32;
}

.history-current-tag {
  margin-left: 6px;
}

.history-row-current > td {
  background: #eef4ec !important;
}
</style>
