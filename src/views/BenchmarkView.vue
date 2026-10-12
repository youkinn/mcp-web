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
          <p class="bench-subtitle">{{ subtitleText }}</p>
        </div>
        <div class="bench-run-block">
          <a-select v-model:value="setId" class="set-select" :options="setOptions" :loading="setsLoading"
            :disabled="runLoading || setSwitching" @change="onSetChange" />
          <span class="bench-run-hint">完整回归约数十秒，建议联调阶段手工触发</span>
          <a-button type="primary" size="large" :loading="runLoading" :disabled="runLoading" @click="onRun">
            执行
          </a-button>
          <a-button danger size="large" :loading="runAborting" :disabled="!runLoading || runAborting"
            @click="onAbortRun">
            停止
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
          <span class="bench-current-run" title="点击复制快照 Id" @click="copyRunId(snapshotData.runId)">{{ snapshotData.runId
            }}</span>
          <span class="bench-current-time">{{ formatBenchmarkTime(snapshotData.time) }}</span>
          <template v-if="isGroup">
            <a-tag color="green">cover@5 {{ groupRateText(groupMetricsOf.cover5) }}</a-tag>
            <a-tag color="blue">hit@5 {{ groupCountRateText(groupMetricsOf.hit5, groupMetricsOf.total) }}</a-tag>
            <a-tag color="red">未进池 {{ groupCountText(groupMetricsOf.miss) }}</a-tag>
          </template>
          <template v-else>
            <a-tag color="green">通过 {{ snapshotData.summary.top5 }}/{{ judgedOf(snapshotData.summary) }}</a-tag>
            <a-tag color="gold">兜底 {{ snapshotData.summary.tail }}</a-tag>
            <a-tag color="red">未命中 {{ snapshotData.summary.miss }}</a-tag>
          </template>
        </div>

        <a-tabs v-model:activeKey="activeTab" class="bench-tabs" @change="onTabChange">
          <a-tab-pane key="summary" tab="类别汇总">
            <section v-if="isGroup" class="bench-card">
              <div class="card-head">
                <h3>组判分指标</h3>
                <span class="bench-hint">主判据 cover@5；hit@10 只作「不得下降」红线</span>
              </div>
              <div class="metric-grid">
                <a-tooltip v-for="row in groupMetricRowsOf" :key="row.key" :title="row.tip" placement="topLeft">
                  <div class="metric-item" :class="{ 'metric-primary': row.key === 'cover5' }">
                    <span class="metric-label">{{ row.label }}</span>
                    <span class="metric-value">{{ row.text }}</span>
                  </div>
                </a-tooltip>
              </div>
            </section>

            <a-tabs v-if="isGroup" v-model:activeKey="groupTab" class="bench-subtabs">
              <a-tab-pane key="category" tab="分类汇总">
                <section class="bench-card">
                  <a-table :columns="groupCategoryColumns" :data-source="groupCategoryRows" row-key="name"
                    :pagination="false" :loading="snapshotLoading || runLoading" size="middle" class="cat-table">
                    <template #bodyCell="{ column, record }">
                      <template v-if="column.key === 'name'">
                        <span class="cat-name">{{ record.name }}</span>
                      </template>
                      <template v-else-if="column.key === 'cover5'">{{ groupRateText(record.cover5) }}</template>
                      <template v-else>{{ record[column.key] }}</template>
                    </template>
                  </a-table>

                  <h4 class="bucket-title">总分档</h4>
                  <a-table :columns="groupCategoryColumns" :data-source="groupBucketRows" row-key="name"
                    :pagination="false" :loading="snapshotLoading || runLoading" size="middle" class="cat-table">
                    <template #bodyCell="{ column, record }">
                      <template v-if="column.key === 'name'">
                        <span class="cat-name">{{ record.name }}</span>
                      </template>
                      <template v-else-if="column.key === 'cover5'">{{ groupRateText(record.cover5) }}</template>
                      <template v-else>{{ groupCountText(record[column.key]) }}</template>
                    </template>
                  </a-table>
                </section>

              </a-tab-pane>
              <a-tab-pane key="detail" tab="题目明细">
                <section class="bench-card">
                  <div class="card-head card-head-end">
                    <a-select v-model:value="groupFilter" class="filter-select" :options="groupFilterOptions" />
                  </div>
                  <a-table :columns="groupDetailColumns" :data-source="groupDetailRows" row-key="id"
                    :pagination="{ pageSize: 20, showSizeChanger: false, showTotal: (t: number) => `共 ${t} 题` }"
                    size="small" :loading="snapshotLoading || runLoading" class="question-table">
                    <template #bodyCell="{ column, record }">
                      <template v-if="column.key === 'id'">{{ record.id }}</template>
                      <template v-else-if="column.key === 'question'">
                        <a-tooltip placement="topLeft">
                          <template #title>{{ record.question }}</template>
                          <span class="cell-ellipsis">{{ record.question }}</span>
                        </a-tooltip>
                      </template>
                      <template v-else-if="column.key === 'status'">
                        <a-tag :color="groupBucketColor(record)">{{ groupBucketLabel(groupBucketOf(record)) }}</a-tag>
                      </template>
                      <template v-else-if="column.key === 'firstRank'">{{ firstRankText(firstRankOf(record))
                        }}</template>
                      <template v-else-if="column.key === 'hits5'">{{ groupCountText(record.hits5) }}</template>
                      <template v-else-if="column.key === 'hits10'">{{ groupCountText(record.hits10) }}</template>
                      <template v-else-if="column.key === 'cover'">{{ groupRateText(cover5OfItem(record)) }}</template>
                      <template v-else-if="column.key === 'bridgeHit'">
                        <a-tag :color="bridgeHitColor(record)">{{ bridgeHitLabel(record) }}</a-tag>
                      </template>
                      <template v-else-if="column.key === 'category'">
                        <span class="cat-name">{{ record.category }}</span>
                      </template>
                      <template v-else-if="column.key === 'sources'">
                        <a-button type="link" size="small" @click="openSourceModal(record)">查看</a-button>
                      </template>
                    </template>
                  </a-table>
                </section>

              </a-tab-pane>
              <a-tab-pane key="miss" tab="未进池清单">
                <section class="bench-card">
                  <div class="card-head card-head-end">
                    <span class="bench-hint">共 {{ groupMissSplit.noBridge.length + groupMissSplit.dropped.length }}
                      题（与快照
                      summary.miss 一致）</span>
                  </div>
                  <div class="miss-group">
                    <h4 class="miss-group-title">桥未命中（bridgeHit = false）· {{ groupMissSplit.noBridge.length }} 题</h4>
                    <a-table :columns="missColumns" :data-source="groupMissSplit.noBridge" row-key="id"
                      :pagination="false" size="small" class="miss-table">
                      <template #bodyCell="{ column, record }">
                        <template v-if="column.key === 'id'">{{ record.id }}</template>
                        <template v-else-if="column.key === 'question'">
                          <a-tooltip placement="topLeft">
                            <template #title>{{ record.question }}</template>
                            <span class="cell-ellipsis">{{ record.question }}</span>
                          </a-tooltip>
                        </template>
                        <template v-else-if="column.key === 'category'">
                          <span class="cat-name">{{ record.category }}</span>
                        </template>
                        <template v-else-if="column.key === 'segCount'">{{ groupCountText(record.segCount) }}</template>
                        <template v-else-if="column.key === 'bridgeGroups'">{{ groupCountText(record.bridgeGroups)
                          }}</template>
                        <template v-else-if="column.key === 'sources'">
                          <a-button type="link" size="small" @click="openSourceModal(record)">查看</a-button>
                        </template>
                      </template>
                    </a-table>
                  </div>
                  <div class="miss-group">
                    <h4 class="miss-group-title">并池后掉窗（bridgeHit = true）· {{ groupMissSplit.dropped.length }} 题</h4>
                    <a-table :columns="missColumns" :data-source="groupMissSplit.dropped" row-key="id"
                      :pagination="false" size="small" class="miss-table">
                      <template #bodyCell="{ column, record }">
                        <template v-if="column.key === 'id'">{{ record.id }}</template>
                        <template v-else-if="column.key === 'question'">
                          <a-tooltip placement="topLeft">
                            <template #title>{{ record.question }}</template>
                            <span class="cell-ellipsis">{{ record.question }}</span>
                          </a-tooltip>
                        </template>
                        <template v-else-if="column.key === 'category'">
                          <span class="cat-name">{{ record.category }}</span>
                        </template>
                        <template v-else-if="column.key === 'segCount'">{{ groupCountText(record.segCount) }}</template>
                        <template v-else-if="column.key === 'bridgeGroups'">{{ groupCountText(record.bridgeGroups)
                          }}</template>
                        <template v-else-if="column.key === 'sources'">
                          <a-button type="link" size="small" @click="openSourceModal(record)">查看</a-button>
                        </template>
                      </template>
                    </a-table>
                  </div>
                </section>
              </a-tab-pane>
            </a-tabs>

            <section v-if="!isGroup" class="bench-card">
              <div class="card-head">
                <h3>类别汇总</h3>
                <a-select v-model:value="filter" class="filter-select" :options="filterOptions"
                  @change="onFilterChange" />
              </div>
              <a-table :columns="categoryColumns" :data-source="fullCategoryRows"
                :row-key="(record: { name: string }) => record.name" v-model:expandedRowKeys="expandedCategories"
                :pagination="false" :loading="snapshotLoading || runLoading" size="middle" class="cat-table">
                <template #bodyCell="{ column, record }">
                  <template v-if="column.key === 'name'">
                    <span class="cat-name">{{ record.name }}</span>
                  </template>
                  <template v-else-if="column.key === 'total'">{{ record.total }}</template>
                  <template v-else-if="column.key === 'noAnchor'">
                    <span :class="record.noAnchor > 0 ? 'no-anchor-num' : ''">{{ record.noAnchor }}</span>
                  </template>
                  <template v-else-if="column.key === 'top5'">{{ record.top5 }}</template>
                  <template v-else-if="column.key === 'fail'">{{ record.tail + record.miss }}</template>
                  <template v-else-if="column.key === 'passRate'">
                    <span :class="rateClass(record.passRate)">{{ formatRatio(record.top5, record.judged) }}</span>
                  </template>
                  <template v-else-if="column.key === 'hit5'">{{ record.top5 }}</template>
                </template>

                <template #summary>
                  <a-table-summary>
                    <a-table-summary-row>
                      <a-table-summary-cell :index="0" />
                      <a-table-summary-cell :index="1" class="sum-cell-name">合计</a-table-summary-cell>
                      <a-table-summary-cell :index="2" align="center" class="sum-cell">{{ summaryTotal?.total ?? 0
                        }}</a-table-summary-cell>
                      <a-table-summary-cell :index="3" align="center" class="sum-cell">{{ summaryTotal?.top5 ?? 0
                        }}</a-table-summary-cell>
                      <a-table-summary-cell :index="4" align="center" class="sum-cell">{{ summaryTotal?.fail ?? 0
                        }}</a-table-summary-cell>
                      <a-table-summary-cell :index="5" align="center" class="sum-cell">{{ summaryTotal?.top5 ?? 0
                        }}</a-table-summary-cell>
                      <a-table-summary-cell :index="6" align="center" class="sum-cell no-anchor-num">{{
                        summaryTotal?.noAnchor ?? 0 }}</a-table-summary-cell>
                      <a-table-summary-cell :index="7" align="center" class="sum-cell">
                        {{ formatRatio(summaryTotal?.top5 ?? 0, summaryTotal?.judged ?? 0) }}
                      </a-table-summary-cell>
                    </a-table-summary-row>
                  </a-table-summary>
                </template>

                <template #expandedRowRender="{ record }">
                  <div class="cat-detail">
                    <div class="cat-detail-head">
                      <a-tag color="blue">{{ record.name }}</a-tag>
                      <span>
                        共 {{ record.total }} 题，当前筛选「{{ filterLabel }}」显示 {{ detailRowsOf(record.name).length }} 题
                        <template v-if="noAnchorInFilter(record.name) > 0">，未参与评分 {{ noAnchorInFilter(record.name) }}
                          题</template>
                      </span>
                    </div>
                    <div v-if="detailRowsOf(record.name).length === 0" class="cat-detail-empty">该筛选下此类别无题目</div>
                    <a-table v-else :columns="questionColumns" :data-source="detailRowsOf(record.name)"
                      :row-key="(q: BenchmarkResultItem) => q.id" :pagination="false" size="small" table-layout="fixed"
                      :row-class-name="questionRowClass" class="question-table">
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
                          <span v-if="isNoAnchor(q)" class="no-anchor-rank">—</span>
                          <span v-else :class="{ 'rank-zero': q.rank === 0 }">{{ q.rank === 0 ? '未召回' : q.rank }}</span>
                        </template>
                        <template v-else-if="column.key === 'status'">
                          <a-tag v-if="isNoAnchor(q)" class="no-anchor-tag">未参与评分</a-tag>
                          <a-tag v-else :color="statusColor(q.status)">{{ statusLabel(q.status) }}</a-tag>
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
              <div class="card-head">
                <a-tooltip title="鼠标移入展示 点击行切换查看该次执行">
                  <h3>历史快照</h3>
                </a-tooltip>
              </div>
              <a-table :columns="historyColumns" :data-source="historyItems"
                :row-key="(item: BenchmarkHistoryItem) => item.runId"
                :loading="historyLoading || snapshotLoading || runLoading" :pagination="{ pageSize: 5 }" size="small"
                :row-class-name="historyRowClass" :custom-row="historyRowHandlers" class="history-table">
                <template #bodyCell="{ column, record }">
                  <template v-if="column.key === 'time'">{{ formatBenchmarkTime(record.time) }}</template>
                  <template v-else-if="column.key === 'rerank'">
                    <a-tooltip>
                      <template #title>
                        <div class="rerank-tip">
                          <div v-for="(line, i) in rerankTip(record)" :key="i">{{ line }}</div>
                        </div>
                      </template>
                      <span class="rerank-badge" :class="{ 'rerank-badge-warn': rerankWarn(record) }">
                        {{ rerankText(record) }}
                      </span>
                    </a-tooltip>
                  </template>
                  <template v-else-if="column.key === 'rerankWindow'">
                    <span :class="{ 'rerank-window-warn': rerankWarn(record) }">{{ rerankWindowText(record) }}</span>
                  </template>
                  <template v-else-if="column.key === 'elapsed'">{{ formatElapsedText(record.summary.elapsedMs)
                    }}</template>
                  <template v-else-if="column.key === 'summary'">{{ historySummaryText(record) }}</template>
                  <template v-else-if="column.key === 'actions'">
                    <a-button type="link" size="small" :disabled="runLoading"
                      @click.stop="openCompare(record)">比较</a-button>
                  </template>
                </template>
              </a-table>
            </section>
          </a-tab-pane>
          <a-tab-pane key="charts" tab="图表">
            <section class="bench-card">
              <div class="card-head">
                <h3>类别分布</h3>
              </div>
              <div v-if="snapshotLoading" class="chart-state"><a-spin size="small" /><span>快照加载中…</span></div>
              <div v-else ref="barChartEl" class="chart-canvas" />
            </section>

            <section class="bench-card">
              <div class="card-head">
                <a-tooltip title="按 runId 依次展示历史整体对比">
                  <h3>{{ isGroup ? 'cover@5 趋势' : '通过率趋势' }}</h3>
                </a-tooltip>
              </div>
              <div v-if="historyLoading && historyItems.length === 0" class="chart-state"><a-spin
                  size="small" /><span>历史加载中…</span></div>
              <div v-else-if="historyItems.length === 0" class="chart-state"><span>暂无历史执行记录</span></div>
              <div v-else ref="trendChartEl" class="chart-canvas" />
            </section>
          </a-tab-pane>
        </a-tabs>
      </template>
    </div>

    <SangoChapterReader v-model:open="readerOpen" :chapter="readerChapter" :chapter-title="readerChapterTitle"
      :chunk-id="readerChunkId" />
    <BenchmarkCompareModal v-model:open="compareOpen" :history-items="historyItems" :base-run-id="compareBaseRunId"
      :set-id="setId" @open-chapter="openReader" />
    <CandidateListModal v-model:open="candidateModalOpen" :result="candidateModalResult"
      :highlight-id="candidateModalHighlightId" @open-chapter="openReader" />
    <GroupSourceModal v-model:open="sourceModalOpen" :item="sourceModalItem" @open-chapter="openChapterChunk" />
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
import BenchmarkCompareModal from '../components/BenchmarkCompareModal.vue'
import CandidateListModal from '../components/CandidateListModal.vue'
import GroupSourceModal from '../components/GroupSourceModal.vue'
import SangoChapterReader from '../components/SangoChapterReader.vue'
import { isNoAnchor, judgedOf, noAnchorCountOf } from '../utils/benchmarkJudged'
import {
  DEFAULT_BENCHMARK_SET_ID,
  abortBenchmarkRun,
  getBenchmarkHistory,
  getBenchmarkLatest,
  getBenchmarkSets,
  getBenchmarkSnapshot,
  getBenchmarkRunStatus,
  getErrorMessage,
  startBenchmarkRun,
  type BenchmarkData,
  type BenchmarkGroupBucketSummary,
  type BenchmarkHistoryItem,
  type BenchmarkResultItem,
  type BenchmarkRunStatus,
  type BenchmarkSetInfo,
  type BenchmarkStatus,
  type BenchmarkSummary,
} from '../api/client'
import { chapterFromChunkId } from '../utils/sangoChapter'
import {
  cover5OfItem,
  firstRankOf,
  firstRankText,
  groupBucketLabel,
  groupBucketOf,
  groupCountRateText,
  groupCountText,
  groupMetricRows,
  groupMetrics,
  groupRateText,
  isGroupSummary,
  splitMisses,
  summaryCover5,
  type GroupStatusBucket,
} from '../utils/benchmarkGroup'

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
  { key: 'tail', name: '兜底', color: '#7caf9b' },
  { key: 'miss', name: '未命中', color: '#d9d9d9' },
] as const

/** 组集柱图系列：组内首段进 1–5 / 6–10 / 11–50 / 未进池 */
const GROUP_SERIES_DEFS = [
  { key: 'hit5', name: 'hit@5', color: '#2e6d56' },
  { key: 'hit10', name: 'hit@10', color: '#7caf9b' },
  { key: 'hit50', name: 'hit@50', color: '#c9b981' },
  { key: 'miss', name: '未进池', color: '#d9d9d9' },
] as const

const BAR_GRID = { left: 56, right: 64, top: 56, bottom: 48 } as const
const TREND_GRID = { left: 56, right: 24, top: 36, bottom: 44 } as const

// ── 状态 ──

/** 评测集注册表（GET /sets）：顺序即服务端注册顺序，默认选中 first（standard） */
const sets = ref<BenchmarkSetInfo[]>([])
const setsLoading = ref(false)
const setId = ref<string>(DEFAULT_BENCHMARK_SET_ID)
/** 切换集重拉在途：期间锁下拉，避免连点串集 */
const setSwitching = ref(false)
/** 组集明细筛选（全部 / 各分档） */
const groupFilter = ref<GroupStatusBucket | 'all'>('all')

const snapshotData = ref<BenchmarkData | null>(null)
const snapshotLoading = ref(false)
const selectedRunId = ref<string | null>(null)
const historyItems = ref<BenchmarkHistoryItem[]>([])
const historyLoading = ref(false)
const runLoading = ref(false)
/** 停止请求在途：防重复点击（此时仍属执行中，runLoading 未清） */
const runAborting = ref(false)
const compareOpen = ref(false)
const compareBaseRunId = ref<string | null>(null)
const filter = ref<BenchmarkFilter>('all')
const expandedCategories = ref<string[]>([])

// ── 评测集口径 ──

/** 当前集注册信息（注册表未到时为 null） */
const currentSet = computed(() => sets.value.find((s) => s.id === setId.value) ?? null)
/** 是否组判分集：以注册表为准，注册表未到时以快照 summary.judge 兜底（A015 老快照按锚集显示） */
const isGroup = computed(() =>
  currentSet.value ? currentSet.value.judge === 'group' : isGroupSummary(snapshotData.value?.summary),
)
const setOptions = computed(() => sets.value.map((s) => ({ value: s.id, label: s.name })))
const subtitleText = computed(() =>
  isGroup.value
    ? '组判分 · 组内首段进 1–5 / 6–10 / 11–50 计数 · 主判据 cover@5，未进池分「桥未命中 / 并池后掉窗」'
    : '十三段模板回归 · 零 LLM · 判对 = 证据段进检索 top5，6–10 兜底，其余未命中',
)

function setNameOf(id: string): string {
  return sets.value.find((s) => s.id === id)?.name ?? id
}

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

/** 组集「类别汇总」页内的二级 tab：分类汇总 / 题目明细 / 未进池清单（三类块改为分页展示，不再纵向堆叠） */
const groupTab = ref<'category' | 'detail' | 'miss'>('category')

const candidateModalOpen = ref(false)
const candidateModalResult = ref<BenchmarkResultItem | null>(null)
/** 弹框高亮：当前所点行 rank 对应召回池（candidates 按 rank 1 起有序）位置候选的 id；rank 无效 / 越池为 null */
const candidateModalHighlightId = ref<string | null>(null)

const sourceModalOpen = ref(false)
const sourceModalItem = ref<BenchmarkResultItem | null>(null)

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

/** 快照时间展示：ISO UTC 串按本地时区（Asia/Shanghai）显示；非 ISO / 无法解析原样（sango 后端格式兼容） */
function formatBenchmarkTime(raw: string): string {
  if (!raw) return raw
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return raw
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 整体耗时展示：<60s 显示 X.Xs，≥60s 显示 Xm Ys（口径：点击执行 → 执行结束） */
function formatRunElapsed(ms: number): string {
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const minutes = Math.floor(seconds / 60)
  const restSeconds = Math.round(seconds % 60)
  return `${minutes}m ${restSeconds}s`
}

/** 快照记录耗时展示：无值（老快照 / 未记录）显示「—」，口径统一取 summary.elapsedMs */
function formatElapsedText(ms: number | undefined): string {
  return typeof ms === 'number' && Number.isFinite(ms) ? formatRunElapsed(ms) : '—'
}

/** 「重排」列展示：off → 关；on → 开（wired=false 附「未接入」警示）；无 rerank 字段（老快照）→ — */
function rerankText(item: BenchmarkHistoryItem): string {
  const rerank = item.summary?.rerank
  if (!rerank) return '—'
  if (rerank.mode !== 'on') return '关'
  return rerank.wired === false ? '开(未接入)' : '开'
}

function rerankWarn(item: BenchmarkHistoryItem): boolean {
  const rerank = item.summary?.rerank
  return Boolean(rerank) && rerank?.mode === 'on' && rerank.wired === false
}

/** 「重排」列 tooltip：每行「中文含义：实际值（说明）」，不暴露 env 键名；老快照无字段则说明未记录 */
function rerankTip(item: BenchmarkHistoryItem): string[] {
  const rerank = item.summary?.rerank
  if (!rerank) return ['该快照早于字段追加，未记录重排配置']
  const switchLine =
    rerank.mode !== 'on'
      ? '重排总开关：关'
      : rerank.wired === false
        ? '重排总开关：开（未接入：权重缺失，实际退回规则序）'
        : '重排总开关：开（本次已接入 cross-encoder 重排）'
  return [
    switchLine,
    `重排窗口：${rerank.window}（规则序前 ${rerank.window} 名参与重排打分）`,
    `截断档位：${rerank.maxTokens}（单条文本 token 上限）`,
    `桶内批量：${rerank.batch}（单次推理批量）`,
    `单会话线程：${rerank.intraThreads ?? 'null'}（推理线程数）`,
  ]
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
  noAnchor: number
  judged: number
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
  { key: 'noAnchor', title: '未参与评分', align: 'center', width: 100 },
  { key: 'passRate', title: '通过率', align: 'center', width: 110 },
]

/** 各类别零锚题数（全量 results，与汇总表 total 的服务端类别口径配套，不随筛选变化） */
const noAnchorByCategory = computed<Map<string, number>>(() => {
  const map = new Map<string, number>()
  for (const item of snapshotData.value?.results ?? []) {
    if (!isNoAnchor(item)) continue
    const name = categoryOf(item)
    map.set(name, (map.get(name) ?? 0) + 1)
  }
  return map
})

const fullCategoryRows = computed<CategoryRow[]>(() => {
  const summary = snapshotData.value?.summary
  if (!summary) return []
  return Object.entries(summary.category).map(([name, cat]) => {
    const noAnchor = noAnchorByCategory.value.get(name) ?? 0
    const judged = Math.max(0, cat.total - noAnchor)
    return {
      name,
      total: cat.total,
      noAnchor,
      judged,
      top5: cat.top5,
      tail: cat.tail,
      miss: cat.miss,
      passRate: judged > 0 ? cat.top5 / judged : null,
    }
  })
})

const summaryTotal = computed(() => {
  const summary = snapshotData.value?.summary
  if (!summary) return null
  return {
    total: summary.total,
    noAnchor: noAnchorCountOf(summary),
    judged: judgedOf(summary),
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

// ── 组判分展示（judge=group，feat-A018）──

const groupMetricsOf = computed(() => groupMetrics(snapshotData.value?.summary, snapshotData.value?.results ?? []))
const groupMetricRowsOf = computed(() => groupMetricRows(snapshotData.value?.summary, snapshotData.value?.results ?? []))
const groupMissSplit = computed(() => splitMisses(snapshotData.value?.results ?? []))

interface GroupCategoryRow {
  name: string
  total: number
  hit5: number
  hit10: number
  hit50: number
  miss: number
  cover5: number | null
}

/** 分类 / 分档桶同口径行映射（缺字段由 groupCountText / groupRateText 兜底成「—」） */
function toGroupRow(name: string, bucket: BenchmarkGroupBucketSummary): GroupCategoryRow {
  return {
    name,
    total: bucket.total,
    hit5: bucket.hit5,
    hit10: bucket.hit10,
    hit50: bucket.hit50,
    miss: bucket.miss,
    cover5: summaryCover5(bucket),
  }
}

/** 分类汇总：取快照 byCategory（L1 / L2 / 典故）；缺字段时为「—」（老快照 / 异集快照） */
const groupCategoryRows = computed<GroupCategoryRow[]>(() => {
  const byCategory = snapshotData.value?.summary.byCategory ?? {}
  return Object.entries(byCategory).map(([name, bucket]) => toGroupRow(name, bucket))
})

/** 分档顺序（契约 §7）：单段 / 多段(2-10) / 大组(>10)；服务端多出的档位按原顺序追加 */
const GROUP_BUCKET_ORDER = ['单段', '多段(2-10)', '大组(>10)']

const groupBucketRows = computed<GroupCategoryRow[]>(() => {
  const byBucket = snapshotData.value?.summary.byBucket ?? {}
  const names = [
    ...GROUP_BUCKET_ORDER.filter((name) => name in byBucket),
    ...Object.keys(byBucket).filter((name) => !GROUP_BUCKET_ORDER.includes(name)),
  ]
  return names.map((name) => toGroupRow(name, byBucket[name]))
})

const groupCategoryColumns = [
  { key: 'name', title: '分类' },
  { key: 'total', title: '题数', align: 'center', width: 90 },
  { key: 'hit5', title: 'hit@5', align: 'center', width: 90 },
  { key: 'hit10', title: 'hit@10', align: 'center', width: 90 },
  { key: 'hit50', title: 'hit@50', align: 'center', width: 90 },
  { key: 'miss', title: '未进池', align: 'center', width: 90 },
  { key: 'cover5', title: 'cover@5', align: 'center', width: 110 },
]

const groupFilterOptions = [
  { value: 'all', label: '全部' },
  { value: 'hit5', label: 'hit@5（组内首段 1–5）' },
  { value: 'hit10', label: 'hit@10（组内首段 6–10）' },
  { value: 'hit50', label: 'hit@50（组内首段 11–50）' },
  { value: 'miss', label: '未进池（首段未进 50 路池）' },
]

/** 组集题目明细：按分档筛选（口径与 status @ firstRank 一致） */
const groupDetailRows = computed<BenchmarkResultItem[]>(() => {
  const results = snapshotData.value?.results ?? []
  if (groupFilter.value === 'all') return results
  return results.filter((item) => groupBucketOf(item) === groupFilter.value)
})

const groupDetailColumns = [
  { key: 'id', title: '题号', width: 120 },
  { key: 'question', title: '问题', width: 300 },
  { key: 'category', title: '分类', width: 80, align: 'center' },
  { key: 'status', title: '状态', width: 100, align: 'center' },
  { key: 'firstRank', title: '首段名次', width: 100, align: 'center' },
  { key: 'hits5', title: 'hits5', width: 80, align: 'center' },
  { key: 'hits10', title: 'hits10', width: 80, align: 'center' },
  { key: 'cover', title: 'cover', width: 90, align: 'center' },
  { key: 'bridgeHit', title: '桥命中', width: 90, align: 'center' },
  { key: 'sources', title: '原文', width: 90 },
]

const missColumns = [
  { key: 'id', title: '题号', width: 120 },
  { key: 'question', title: '问题', width: 320 },
  { key: 'category', title: '分类', width: 80, align: 'center' },
  { key: 'segCount', title: '组内段数', width: 100, align: 'center' },
  { key: 'bridgeGroups', title: '桥分组数', width: 100, align: 'center' },
  { key: 'sources', title: '原文', width: 90 },
]

function groupBucketColor(item: BenchmarkResultItem): string {
  const bucket = groupBucketOf(item)
  if (bucket === 'hit5') return 'green'
  if (bucket === 'hit10') return 'blue'
  if (bucket === 'hit50') return 'gold'
  if (bucket === 'miss') return 'red'
  return 'default'
}

/** 桥命中列：true / false / 缺字段（老快照）三态分明 */
function bridgeHitLabel(item: BenchmarkResultItem): string {
  if (item.bridgeHit === true) return '命中'
  if (item.bridgeHit === false) return '未命中'
  return '—'
}

function bridgeHitColor(item: BenchmarkResultItem): string {
  if (item.bridgeHit === true) return 'green'
  if (item.bridgeHit === false) return 'default'
  return 'default'
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
  { key: 'candidates', title: '召回列表', width: 90, align: 'center' },
]

function detailRowsOf(category: string): BenchmarkResultItem[] {
  return visibleResults.value.filter((r) => categoryOf(r) === category)
}

/** 当前筛选下某类别零锚题数（与展开列表可见行配套） */
function noAnchorInFilter(category: string): number {
  return visibleResults.value.filter((r) => categoryOf(r) === category && isNoAnchor(r)).length
}

/** 明细行样式：零锚题整行灰显，一眼可辨「未参与评分」 */
function questionRowClass(item: BenchmarkResultItem): string {
  return isNoAnchor(item) ? 'question-row-no-anchor' : ''
}

function questionSeq(item: BenchmarkResultItem): number {
  const idx = snapshotData.value?.results.findIndex((r) => r.id === item.id) ?? -1
  return idx >= 0 ? idx + 1 : 0
}

function openCandidateModal(item: BenchmarkResultItem): void {
  candidateModalResult.value = item
  // 按 rank 定位（非数组下标）：rank 1 起对应池位置；rank 无效（0 / 越出 50 条池）→ 不高亮、不报错
  const index = item.rank - 1
  candidateModalHighlightId.value =
    index >= 0 && index < item.candidates.length ? item.candidates[index].id : null
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

interface GroupChartRow {
  name: string
  total: number
  hit5: number
  hit10: number
  hit50: number
  miss: number
  cover5: number | null
}

/** 组集柱图行：按 byCategory（L1 / L2 / 典故）取全量计数，cover@5 取桶内读数 */
const groupChartRows = computed<GroupChartRow[]>(() => {
  const byCategory = snapshotData.value?.summary.byCategory ?? {}
  return Object.entries(byCategory).map(([name, bucket]) => ({
    name,
    total: bucket.total,
    hit5: bucket.hit5,
    hit10: bucket.hit10,
    hit50: bucket.hit50,
    miss: bucket.miss,
    cover5: summaryCover5(bucket),
  }))
})

interface BarDatum {
  name: string
  total: number
  values: number[]
  /** 折线读数（百分比）：锚集 = 通过率，组集 = cover@5 */
  rate: number | null
}

/** 柱图数据：锚集按 通过 / 兜底 / 未命中，组集按 hit@5 / hit@10 / hit@50 / 未进池 */
const barData = computed<BarDatum[]>(() => {
  if (isGroup.value) {
    return groupChartRows.value.map((r) => ({
      name: r.name,
      total: r.total,
      values: [r.hit5, r.hit10, r.hit50, r.miss],
      rate: r.cover5 === null ? null : r.cover5 * 100,
    }))
  }
  return chartCategoryRows.value.map((r) => ({
    name: r.name,
    total: r.total,
    values: [r.top5, r.tail, r.miss],
    rate: r.total > 0 ? (r.top5 / r.total) * 100 : null,
  }))
})

const barSeriesDefs = computed(() => (isGroup.value ? GROUP_SERIES_DEFS : SERIES_DEFS))
const barRateName = computed(() => (isGroup.value ? 'cover@5 %' : '通过率 %'))

/** 趋势折线读数（百分比）：组集 = cover@5，锚集 = 通过率；缺字段 null（断点） */
function trendRateOf(summary: BenchmarkSummary): number | null {
  if (isGroupSummary(summary)) {
    const cover = summaryCover5(summary)
    return cover === null ? null : cover * 100
  }
  return summary.total > 0 ? (summary.top5 / summary.total) * 100 : null
}

/** 趋势 tooltip 摘要行：组集 cover@5 / hit@5 / 未进池，锚集通过 / 兜底 / 未命中 */
function trendTooltipLines(item: BenchmarkHistoryItem): string {
  const s = item.summary
  if (isGroupSummary(s)) {
    return `cover@5 ${groupRateText(summaryCover5(s))} · hit@5 ${groupCountRateText(s.hit5, s.total)} · 未进池 ${groupCountText(s.miss)}`
  }
  return `通过 ${s.top5}/${s.total} · 兜底 ${s.tail} · 未命中 ${s.miss}`
}

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
  const rows = barData.value
  barChart.setOption(
    {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { top: 12, data: barSeriesDefs.value.map((d) => d.name) },
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
          name: barRateName.value,
          min: 0,
          max: 100,
          axisLabel: { color: '#718078' },
          splitLine: { show: false },
        },
      ],
      series: [
        ...barSeriesDefs.value.map((def, i) => ({
          name: def.name,
          type: 'bar' as const,
          stack: 'benchmark',
          barMaxWidth: 26,
          itemStyle: { color: def.color },
          data: rows.map((r) => r.values[i]),
        })),
        {
          name: isGroup.value ? 'cover@5' : '通过率',
          type: 'line' as const,
          yAxisIndex: 1,
          smooth: true,
          symbolSize: 6,
          lineStyle: { color: '#163c32', width: 2 },
          itemStyle: { color: '#163c32' },
          data: rows.map((r) => r.rate),
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
  // 首次执行（历史最旧一条）通过率 / cover@5 作为基线参考线
  const first = items[0]
  const baseline = trendRateOf(first.summary)
  trendChart.setOption(
    {
      tooltip: {
        trigger: 'axis',
        formatter: (params: unknown) => {
          const array = Array.isArray(params) ? params : [params]
          const first = array[0] as { dataIndex?: number } | undefined
          const item = items[first?.dataIndex ?? 0]
          if (!item) return ''
          const lines = [
            `<b>${shortRunId(item.runId)}</b>`,
            `时间：${formatBenchmarkTime(item.time)}`,
            trendTooltipLines(item),
          ]
          if (!isGroupSummary(item.summary)) {
            lines.push(`通过率 ${formatRatio(item.summary.top5, item.summary.total)}`)
          }
          return lines.join('<br/>')
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
        name: barRateName.value,
        min: 0,
        max: 100,
        axisLabel: { color: '#718078' },
        splitLine: { lineStyle: { color: '#edf0eb' } },
      },
      series: [
        {
          name: isGroup.value ? 'cover@5' : '通过率',
          type: 'line' as const,
          smooth: true,
          symbolSize: 7,
          lineStyle: { color: '#2e6d56', width: 2 },
          itemStyle: { color: '#2e6d56' },
          areaStyle: { color: 'rgba(46,109,86,0.08)' },
          data: items.map((i) => trendRateOf(i.summary)),
          markLine:
            baseline === null
              ? undefined
              : {
                symbol: 'none',
                silent: true,
                lineStyle: { type: 'dashed', color: '#8b9990', width: 1 },
                label: {
                  formatter: `首跑基线 ${formatPercent(baseline / 100)}`,
                  position: 'insideEndTop',
                  color: '#8b9990',
                  fontSize: 11,
                },
                data: [{ yAxis: baseline }],
              },
        },
      ],
    },
    { notMerge: true },
  )
}

function onBarChartClick(event: unknown): void {
  const chart = barChart
  if (!chart || !snapshotData.value) return
  // 组集柱图按分类计数、明细表不受类别展开驱动，不做点击下钻
  if (isGroup.value) return
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

/** 拉取评测集注册表（下拉选项与判定口径来源）；失败保留默认集，不阻塞页面其余加载 */
async function loadSets(): Promise<void> {
  setsLoading.value = true
  try {
    const list = await getBenchmarkSets()
    if (list.length > 0) sets.value = list
  } catch (err) {
    message.error(getErrorMessage(err))
  } finally {
    setsLoading.value = false
  }
}

async function loadInitial(): Promise<void> {
  snapshotLoading.value = true
  try {
    const latest = await getBenchmarkLatest(setId.value)
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
    historyItems.value = await getBenchmarkHistory(setId.value)
  } catch (err) {
    message.error(getErrorMessage(err))
  } finally {
    historyLoading.value = false
  }
}

/** 切换评测集：先清空上一集残留（快照 / 历史 / 展开行 / 弹框 / 图表），再按新 setId 重拉 */
async function onSetChange(): Promise<void> {
  if (setSwitching.value) return
  setSwitching.value = true
  snapshotData.value = null
  selectedRunId.value = null
  historyItems.value = []
  expandedCategories.value = []
  filter.value = 'all'
  groupFilter.value = 'all'
  candidateModalOpen.value = false
  sourceModalOpen.value = false
  compareOpen.value = false
  disposeCharts()
  try {
    await Promise.all([loadInitial(), loadHistory()])
  } finally {
    setSwitching.value = false
  }
}

// ── 执行：异步 job + 轮询（bug-00049 B 案）──

/** 轮询间隔 5s（负责人 2026-09-29 定：3–5s 一次，该接口耗时 3–10 分钟，太频繁没必要） */
const RUN_POLL_INTERVAL_MS = 5000
/** 轮询上限 10 分钟（远超实测 3.5–5 分钟）；超时给明确文案，避免长超时误报 */
const RUN_POLL_TIMEOUT_MS = 600_000

/** 轮询定时器句柄：done / failed / 超时三种收尾都必须清空并置 null，避免残留定时器继续打接口 */
let runPollTimer: ReturnType<typeof setTimeout> | null = null
/** 轮询令牌：重新执行 / 页面卸载使在途 tick 失效，避免并发轮询与卸载后回调 */
let runPollToken = 0

/** 停止轮询：清定时器句柄 + 置空 + 解除「执行中」 */
function stopRunPolling(): void {
  runPollToken += 1
  if (runPollTimer !== null) {
    clearTimeout(runPollTimer)
    runPollTimer = null
  }
  runLoading.value = false
}

/** done 收尾：按 runId + setId 拉快照渲染，随后刷新历史（耗时 / 重排随快照落表，刷新不丢）；
 *  完成的是别的集时不混进当前集视图，只提示并刷新当前集历史 */
async function finishBenchmarkRun(runId: string, runSetId: string): Promise<void> {
  try {
    const data = await getBenchmarkSnapshot(runId, runSetId)
    if (runSetId !== setId.value) {
      message.info(`「${setNameOf(runSetId)}」评测完成（当前查看「${setNameOf(setId.value)}」），已刷新历史`)
      return
    }
    if (data) {
      snapshotData.value = data
      selectedRunId.value = data.runId
      expandedCategories.value = []
      candidateModalOpen.value = false
      sourceModalOpen.value = false
      message.success(
        isGroupSummary(data.summary)
          ? `评测完成：cover@5 ${groupRateText(summaryCover5(data.summary))} · hit@5 ${groupCountRateText(data.summary.hit5, data.summary.total)}`
          : `评测完成：通过 ${data.summary.top5}/${judgedOf(data.summary)}（${formatRatio(data.summary.top5, judgedOf(data.summary))}）`,
      )
    } else {
      message.warning(`评测完成，但快照 ${runId} 不存在或已被清理`)
    }
  } catch (err) {
    message.error(getErrorMessage(err))
  } finally {
    await loadHistory()
  }
}

/** 轮询 run-status：running 5s 后下一轮；done 拉快照 + 刷新历史；failed / aborted / 超时 / idle 收尾并清句柄 */
function pollBenchmarkRun(runId: string, startedAt: number, runSetId: string): void {
  const token = ++runPollToken
  const tick = async (): Promise<void> => {
    if (token !== runPollToken) return
    if (Date.now() - startedAt > RUN_POLL_TIMEOUT_MS) {
      stopRunPolling()
      message.error(`评测执行超时（超过 ${RUN_POLL_TIMEOUT_MS / 60_000} 分钟仍未完成），请刷新页面查看历史快照`)
      return
    }
    let status: BenchmarkRunStatus
    try {
      status = await getBenchmarkRunStatus()
    } catch (err) {
      stopRunPolling()
      message.error(getErrorMessage(err))
      await loadHistory()
      return
    }
    if (token !== runPollToken) return
    if (status.state === 'running') {
      runPollTimer = setTimeout(() => void tick(), RUN_POLL_INTERVAL_MS)
      return
    }
    // 终态：先清轮询句柄与「执行中」（aborted 不落快照，只刷新历史）
    stopRunPolling()
    if (status.state === 'failed') {
      message.error(status.error ? `评测执行失败：${status.error}` : '评测执行失败')
      await loadHistory()
      return
    }
    if (status.state === 'aborted') {
      // 停止不落快照：不清快照、不按 runId 拉快照，仅提示 + 刷新历史
      message.info('已停止（未落快照）')
      await loadHistory()
      return
    }
    if (status.state === 'done') {
      await finishBenchmarkRun(status.runId ?? runId, status.setId ?? runSetId)
      return
    }
    message.warning('评测状态已丢失（可能后端重启），已刷新历史')
    void loadInitial()
    await loadHistory()
  }
  runPollTimer = setTimeout(() => void tick(), RUN_POLL_INTERVAL_MS)
}

async function onRun(): Promise<void> {
  if (runLoading.value) return
  runLoading.value = true
  try {
    const started = await startBenchmarkRun(setId.value)
    if (started.alreadyRunning) message.info('已在执行，接续该次')
    pollBenchmarkRun(started.runId, Date.now(), started.setId ?? setId.value)
  } catch (err) {
    runLoading.value = false
    message.error(getErrorMessage(err))
  }
}

/** 点击「停止」：受理后清轮询 + 解除执行中；409 视为已结束；其它错误保持执行中让轮询继续收敛 */
async function onAbortRun(): Promise<void> {
  if (runAborting.value) return
  runAborting.value = true
  try {
    const { accepted } = await abortBenchmarkRun()
    stopRunPolling()
    message.info(accepted ? '已停止（未落快照）' : '本次执行已结束')
    await loadHistory()
  } catch (err) {
    // 未受理：不假装停成功，保持「执行中」，轮询继续收敛到终态
    message.error(getErrorMessage(err))
  } finally {
    runAborting.value = false
  }
}

/** 点击复制快照 Id（内容格式由负责人给定：`快照 Id: <runId>`） */
async function copyRunId(runId: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(`快照 Id: ${runId}`)
    message.success('已复制快照 Id')
  } catch {
    message.error('复制失败，请手动选中复制')
  }
}

/** 页面进入时若后端仍在执行 → 恢复「执行中」并继续轮询（刷新不丢状态） */
async function resumeRunningBenchmark(): Promise<void> {
  try {
    const status = await getBenchmarkRunStatus()
    if (status.state !== 'running' || !status.runId) return
    runLoading.value = true
    message.info('检测到评测执行中，已接续该次')
    // 已耗时按服务端读数扣减，避免刷新后重新计满 10 分钟
    pollBenchmarkRun(status.runId, Date.now() - (status.elapsedMs ?? 0), status.setId ?? setId.value)
  } catch {
    // 状态接口不可用（旧后端 / 服务未启动）不影响页面其余加载
  }
}

// ── 历史切换 ──

/** 历史表列：锚集带重排两列；组集无重排字段，只保留摘要 / 时间 / 耗时 / 操作，切换集不残留旧指标列 */
const historyColumns = computed(() =>
  isGroup.value
    ? [
      { key: 'summary', title: '摘要' },
      { key: 'time', title: '时间', width: 210 },
      { key: 'elapsed', title: '耗时', width: 100, align: 'center' },
      { key: 'actions', title: '操作', width: 90, align: 'center' },
    ]
    : [
      { key: 'summary', title: '摘要' },
      { key: 'rerank', title: '重排', width: 120, align: 'center' },
      { key: 'rerankWindow', title: '重排窗口', width: 100, align: 'center' },
      { key: 'time', title: '时间', width: 210 },
      { key: 'elapsed', title: '耗时', width: 100, align: 'center' },
      { key: 'actions', title: '操作', width: 90, align: 'center' },
    ],
)

/** 「重排窗口」列：on 显示该条快照实际窗口值；off / 老快照无字段显示「—」 */
function rerankWindowText(item: BenchmarkHistoryItem): string {
  const rerank = item.summary?.rerank
  if (!rerank || rerank.mode !== 'on') return '—'
  return String(rerank.window)
}

/** 摘要列：纯摘要口径（耗时/重排各自独立成列，不再拼进文案）；组集按 cover@5 / hit@5 / 未进池 */
function historySummaryText(item: BenchmarkHistoryItem): string {
  const s = item.summary
  if (isGroupSummary(s)) {
    return `cover@5 ${groupRateText(summaryCover5(s))} · hit@5 ${groupCountRateText(s.hit5, s.total)} · 未进池 ${groupCountText(s.miss)}`
  }
  return `通过 ${s.top5}/${s.total}（${formatRatio(s.top5, s.total)}） · 兜底 ${s.tail} · 未命中 ${s.miss}`
}

/** 历史表交互锁：执行中 / 快照加载中不挂点击（与 onHistoryClick 守卫同口径），避免「看着能点、点了没反应」 */
const historyLocked = computed(() => runLoading.value || snapshotLoading.value)

function historyRowClass(record: BenchmarkHistoryItem): string {
  const classes = [record.runId === selectedRunId.value ? 'history-row-current' : '']
  if (historyLocked.value) classes.push('history-row-locked')
  return classes.filter(Boolean).join(' ')
}

function historyRowHandlers(record: BenchmarkHistoryItem): { onClick?: () => void } {
  if (historyLocked.value) return {}
  return { onClick: () => void onHistoryClick(record) }
}

function openCompare(item: BenchmarkHistoryItem): void {
  compareBaseRunId.value = item.runId
  compareOpen.value = true
}

async function onHistoryClick(item: BenchmarkHistoryItem): Promise<void> {
  if (item.runId === selectedRunId.value || runLoading.value || snapshotLoading.value) return
  snapshotLoading.value = true
  try {
    const data = await getBenchmarkSnapshot(item.runId, setId.value)
    if (!data) {
      message.warning(`快照 ${item.runId} 不存在或已被清理`)
      return
    }
    snapshotData.value = data
    selectedRunId.value = item.runId
    expandedCategories.value = []
    candidateModalOpen.value = false
    sourceModalOpen.value = false
  } catch (err) {
    message.error(getErrorMessage(err))
  } finally {
    snapshotLoading.value = false
  }
}

// ── 原文查看 ──

/** 原文入口：锚集候选带回目锚，组集候选 / 组内段只带 chunkId（回号一律由 chapterFromChunkId 解析） */
function openReader(candidate: { id: string; title?: string }): void {
  const chapter = chapterFromChunkId(candidate.id)
  if (Number.isNaN(chapter)) {
    message.warning(`无法解析候选 chunkId（${candidate.id}）的回号`)
    return
  }
  readerChapter.value = chapter
  readerChapterTitle.value = candidate.title ?? ''
  readerChunkId.value = candidate.id
  readerOpen.value = true
}

/** 组集原文入口：只带 chunkId（组内段 / top10 候选），回号解析与锚集同一口径 */
function openChapterChunk(chunkId: string): void {
  openReader({ id: chunkId })
}

/** 原文弹框：表格原文列只放「查看」，组内段 / top10 候选清单在弹框内展开 */
function openSourceModal(item: BenchmarkResultItem): void {
  sourceModalItem.value = item
  sourceModalOpen.value = true
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
  void Promise.all([loadSets(), loadInitial(), loadHistory(), resumeRunningBenchmark()])
})

onBeforeUnmount(() => {
  // 清轮询定时器 + 使在途 tick 失效，避免卸载后继续请求 / 弹提示
  stopRunPolling()
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
  cursor: pointer;
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

/* 二级 tab（分类汇总 / 题目明细 / 未进池清单）贴在卡片上方，缓存不留空档 */
.bench-subtabs :deep(.ant-tabs-nav) {
  margin-bottom: 0;
}

.card-head-end {
  justify-content: flex-end;
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

/* bug-00052 零锚题（未参与评分）展示：灰 tag / 灰数字 / 整行灰显 */
.no-anchor-tag {
  background: #eceeeb;
  color: #8b9990;
  border-color: #d7e0d7;
}

.no-anchor-num {
  color: #8b9990;
}

.no-anchor-rank {
  color: #8b9990;
}

.question-table :deep(.question-row-no-anchor > td) {
  background: #f4f5f2 !important;
  color: #8b9990;
}

.cand-empty {
  color: #8b9990;
}


.rerank-badge {
  color: #163c32;
}

/* 重排已开但未真正接入：警示色，提示快照记录的重排未生效（「重排」与「重排窗口」两列共用） */
.rerank-badge-warn,
.rerank-window-warn {
  color: #c25b4e;
  font-weight: 600;
}

.history-table :deep(.history-row-current > td) {
  background: #fff3cd !important;
}

.history-table :deep(.ant-table-row) {
  cursor: pointer;
}

/* 执行中 / 快照加载中：光标明示不可点（与历史表交互锁同口径） */
.history-table :deep(.history-row-locked) {
  cursor: not-allowed;
}

/* 评测集下拉（feat-A018）：注册表名称较长，给足宽度 */
.set-select {
  width: 260px;
}

.bench-hint {
  color: #8b9990;
  font-size: 12px;
}

/* 组判分指标：cover@5 主判据在前并加重 */
.metric-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.metric-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 150px;
  padding: 10px 14px;
  border: 1px solid #e3eae3;
  border-radius: 8px;
  background: #fafcfa;
}

.metric-primary {
  border-color: #2e6d56;
  background: #f0f7f2;
}

/* 指标名移入即显示口径说明（文案见 benchmarkGroup.ts 的 tip）：虚线下划线作可悬停提示 */
.metric-label {
  color: #718078;
  font-size: 12px;
  border-bottom: 1px dashed #b6c2ba;
  cursor: help;
}

.metric-value {
  color: #163c32;
  font-size: 18px;
  font-weight: 700;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
}

/* 未进池清单：两组（桥未命中 / 并池后掉窗）分块列出 */
.bucket-title {
  margin: 16px 0 8px;
  color: #163c32;
  font-size: 14px;
}

.miss-group+.miss-group {
  margin-top: 16px;
}

.miss-group-title {
  margin: 0 0 8px;
  color: #163c32;
  font-size: 14px;
}

.miss-table :deep(.ant-table-thead > tr > th) {
  background: #f2f6f1;
}
</style>
