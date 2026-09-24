<template>
  <main class="cache-page">
    <div class="page-shell">
      <header class="site-header">
        <RouterLink to="/" class="brand">
          <span class="brand-mark">M</span>
          <span class="brand-copy">
            <span class="brand-name">MCP WORKSPACE</span>
            <span class="brand-caption">Cache console</span>
          </span>
        </RouterLink>
        <div class="header-actions">
          <RouterLink :to="logsBackTarget">
            <a-button size="small">← 返回日志</a-button>
          </RouterLink>
          <RouterLink to="/chat">
            <a-button size="small">返回聊天</a-button>
          </RouterLink>
          <a-tag color="green">服务就绪</a-tag>
        </div>
      </header>

      <a-tabs v-model:activeKey="activeTab" class="cache-tabs" size="large">
        <a-tab-pane key="overview">
          <template #tab><span class="tab-label">缓存概览</span></template>

          <div class="status-card">
            <div class="switch-group">
              <span class="switch-label">缓存开关</span>
              <a-switch
                v-model:checked="statusEnabled"
                :loading="statusSaving"
                checked-children="开"
                un-checked-children="关"
                @change="onStatusChange"
              />
              <span class="switch-state">{{ statusStateText }}</span>
            </div>
            <div class="hitline-group">
              <span class="switch-label">命中线</span>
              <a-input-number
                v-model:value="hitLineInput"
                class="hitline-input"
                :min="0"
                :max="1"
                :step="0.05"
                :precision="2"
                placeholder="0~1"
                :disabled="overview === null"
                @change="onHitLineInputChange"
              />
              <a-button
                size="small"
                type="primary"
                ghost
                :loading="hitLineSaving"
                :disabled="!hitLineDirty"
                @click="onSaveHitLine"
              >保存</a-button>
              <span v-if="hitLineHint" class="hitline-hint">{{ hitLineHint }}</span>
              <span v-if="lastHitLineChangeText" class="hitline-last-change">{{ lastHitLineChangeText }}</span>
            </div>
            <div class="status-meta">
              <span>上限 {{ overview?.maxEntries ?? '—' }} 条</span>
              <span>当前条目 {{ overview?.entryCount ?? '—' }}</span>
            </div>
            <a-popconfirm
              title="全量清除缓存？清除后所有条目立即失效，被清问题下次提问重新走 LLM。"
              ok-text="清除"
              cancel-text="取消"
              @confirm="onClearCache"
            >
              <a-button danger :loading="clearing">全量清除</a-button>
            </a-popconfirm>
          </div>

          <div class="stat-grid">
            <div class="stat-card">
              <div class="stat-num">{{ overview?.entryCount ?? '—' }}</div>
              <div class="stat-label">缓存条目数</div>
            </div>
            <div class="stat-card">
              <div class="stat-num">{{ formatBytes(overview?.answerBytesTotal) }}</div>
              <div class="stat-label">答案字节合计</div>
            </div>
            <div class="stat-card">
              <div class="stat-num">{{ formatBytes(overview?.embeddingBytesTotal) }}</div>
              <div class="stat-label">embedding 字节</div>
            </div>
            <div class="stat-card">
              <div class="stat-num">
                <a-tooltip placement="top">
                  <template #title>答案字节 {{ overview?.answerBytesTotal ?? 0 }}B + embedding {{ overview?.embeddingBytesTotal ?? 0 }}B + 条目数 {{ overview?.entryCount ?? 0 }} × 256 ≈ {{ overview?.approximateBytes ?? 0 }}B</template>
                  <span>{{ formatBytes(overview?.approximateBytes) }}</span>
                  <span class="approx-mark">近似</span>
                </a-tooltip>
              </div>
              <div class="stat-label">近似内存占用</div>
            </div>
          </div>
          <div class="overview-note">内存口径（可复算）：答案字节 = 答案对象 JSON 序列化字节合计（= 条目列表 answerBytes 合计）；embedding 字节 = 条目数 × 4096（1024 维 × 4B）；近似内存 = 答案字节 + embedding 字节 + 条目数 × 256（条目结构开销常数，进程 heap 无法逐条归属，故标注「近似」）。</div>

          <div class="entries-card">
            <div class="entries-head">
              <h4 class="entries-title">缓存条目（{{ entriesData?.total ?? 0 }}）</h4>
              <div class="entries-controls">
                <span class="controls-label">排序</span>
                <a-select v-model:value="entriesSortBy" class="sort-select">
                  <a-select-option value="lastAccessAt">最近访问</a-select-option>
                  <a-select-option value="hitCount">命中次数</a-select-option>
                </a-select>
                <a-select v-model:value="entriesOrder" class="order-select">
                  <a-select-option value="desc">降序</a-select-option>
                  <a-select-option value="asc">升序</a-select-option>
                </a-select>
                <a-button size="small" :loading="entriesLoading" @click="onRefreshEntries">刷 新</a-button>
              </div>
            </div>
            <a-table
              :columns="entriesColumns"
              :data-source="entriesData?.list ?? []"
              :loading="entriesLoading"
              :row-key="(record: CacheEntryItem) => record.id"
              :pagination="entriesPagination"
              size="small"
              class="entries-table"
              @change="onEntriesTableChange"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'id'">{{ record.id }}</template>
                <template v-else-if="column.key === 'queryText'">
                  <a-tooltip placement="topLeft">
                    <template #title>{{ record.queryText }}</template>
                    <span v-if="record.traceId" class="cell-ellipsis gz-query-link" @click="goLogDetail(record.traceId)">{{ record.queryText }}</span>
                    <span v-else class="cell-ellipsis gz-query-link-disabled">{{ record.queryText }}</span>
                  </a-tooltip>
                </template>
                <template v-else-if="column.key === 'hitCount'">
                  <a v-if="record.hitCount > 0" class="hit-count-link" @click="onOpenEntryHits(record)">{{ record.hitCount }}</a>
                  <span v-else class="tab-num">0</span>
                </template>
                <template v-else-if="column.key === 'lastAccessAt'">{{ formatTime(record.lastAccessAt) }}</template>
                <template v-else-if="column.key === 'createdAt'">{{ formatTime(record.createdAt) }}</template>
                <template v-else-if="column.key === 'answerBytes'">{{ formatBytes(record.answerBytes) }}</template>
                <template v-else-if="column.key === 'actions'">
                  <a-button size="small" class="copy-id-btn" @click="onCopyEntryId(record.id)">复制</a-button>
                  <a-popconfirm
                    title="删除该条目？立即生效，仅该条失效，其余条目命中不受影响。"
                    ok-text="删除"
                    cancel-text="取消"
                    @confirm="onDeleteEntry(record.id)"
                  >
                    <a-button size="small" danger :loading="deletingIds[record.id]">删除</a-button>
                  </a-popconfirm>
                </template>
              </template>
            </a-table>
          </div>

          <a-modal
            v-model:open="entryHitsOpen"
            :title="entryHitsTitle"
            :footer="null"
            width="900px"
            :destroy-on-close="true"
          >
            <a-table
              :columns="entryHitsColumns"
              :data-source="entryHitsData?.list ?? []"
              :loading="entryHitsLoading"
              :row-key="(record: CacheEntryHitItem) => record.traceId"
              :pagination="entryHitsPagination"
              :scroll="{ x: 'max-content' }"
              size="small"
              @change="onEntryHitsTableChange"
            >
              <template #emptyText>
                <a-empty description="该条目暂无命中记录" />
              </template>
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'time'">{{ formatTime(record.createdAt) }}</template>
                <template v-else-if="column.key === 'userQuery'">
                  <a-tooltip placement="topLeft">
                    <template #title>{{ record.userQuery }}</template>
                    <span class="cell-ellipsis">{{ record.userQuery }}</span>
                  </a-tooltip>
                </template>
                <template v-else-if="column.key === 'similarity'">
                  <span class="tab-num">{{ formatSimilarity(record.similarity) }}</span>
                </template>
                <template v-else-if="column.key === 'hitLine'">{{ formatHitLine(record.hitLine) }}</template>
                <template v-else-if="column.key === 'marked'">
                  <a-tag :color="record.marked ? 'gold' : 'default'">{{ record.marked ? '已标记' : '未标记' }}</a-tag>
                </template>
              </template>
            </a-table>
          </a-modal>
        </a-tab-pane>

        <a-tab-pane key="distribution">
          <template #tab><span class="tab-label">相似度分布</span></template>

          <div class="query-card">
            <div class="query-row stats-query-row">
              <div class="query-item">
                <span class="query-label">时间段</span>
                <a-radio-group v-model:value="distRangePreset" @change="onDistPresetChange" class="preset-radios">
                  <a-radio-button value="today">今天</a-radio-button>
                  <a-radio-button value="7d">近 7 天</a-radio-button>
                  <a-radio-button value="30d">近 30 天</a-radio-button>
                  <a-radio-button value="custom">自定义</a-radio-button>
                </a-radio-group>
                <a-range-picker v-model:value="distCustomRange" value-format="YYYY-MM-DD" :placeholder="['开始日期', '结束日期']" class="query-range" @change="onDistCustomRangeChange" />
              </div>
              <div class="query-actions">
                <a-button type="primary" :loading="distLoading" @click="onRefreshDist">刷 新</a-button>
              </div>
            </div>
          </div>

          <div class="stats-card">
            <div class="stats-head">
              <div class="stats-range-info">
                <span v-if="distRangeLabel" class="stats-range-label">{{ distRangeLabel }}</span>
                <span class="stats-granularity-hint">上海时区（UTC+8）· 数据源 cache_logs · 桶宽 0.02</span>
              </div>
              <div v-if="distData" class="stats-summary">
                <span class="summary-item">低相似 {{ distData.totals.lowSimilar }}</span>
                <span class="summary-item">灰色区 {{ distData.totals.grayZone }}</span>
                <span class="summary-item">高置信 {{ distData.totals.highConfidence }}</span>
                <span class="summary-item">总请求 {{ distData.totals.totalCount }}</span>
              </div>
            </div>
            <a-spin :spinning="distLoading">
              <div ref="distChartEl" class="chart-canvas"></div>
            </a-spin>
            <div v-if="distData && distData.buckets.length === 0 && !distLoading" class="chart-empty">
              <a-empty description="该时间段暂无缓存判定数据" />
            </div>
            <div v-if="distData" class="dist-legend">
              <span class="legend-item"><i class="legend-dot" style="background: #8ab6e8"></i>低相似（&lt; 0.80）</span>
              <span class="legend-item"><i class="legend-dot" style="background: #f0bf4c"></i>灰色区（0.80 ~ 命中线 {{ formatHitLine(distData.hitLine) }}）</span>
              <span class="legend-item"><i class="legend-dot" style="background: #2e7d57"></i>高置信（≥ 命中线）</span>
              <span class="legend-hint">区间着色：命中线变化只改着色分界，柱高与区间行派生一致（高置信区含歧义 / 焦点拒判未命中行）</span>
            </div>
          </div>

          <div v-if="misjudgeData" class="misjudge-card">
            <h4 class="misjudge-title">误判率</h4>
            <div class="misjudge-grid">
              <div class="misjudge-item">
                <span class="misjudge-num">{{ misjudgeData.hitTotal }}</span>
                <span class="misjudge-label">命中总数</span>
              </div>
              <div class="misjudge-item">
                <span class="misjudge-num">{{ misjudgeData.markedMisjudge }}</span>
                <span class="misjudge-label">标记误判数</span>
              </div>
              <div class="misjudge-item">
                <span class="misjudge-num">{{ misjudgeData.misjudgeRate === null ? '—' : formatRate(misjudgeData.misjudgeRate) }}</span>
                <span class="misjudge-label">误判率</span>
              </div>
            </div>
            <div class="misjudge-note">{{ misjudgeData.note }}</div>
          </div>

          <a-modal
            v-model:open="distRowsOpen"
            :title="distRowsTitle"
            :footer="null"
            width="1080px"
            :destroy-on-close="true"
          >
            <a-table
              :columns="distRowsColumns"
              :data-source="distRowsData?.list ?? []"
              :loading="distRowsLoading"
              :row-key="(record: SimilarityRowItem) => record.cacheLogId"
              :pagination="distRowsPagination"
              :scroll="{ x: 'max-content' }"
              size="small"
              @change="onDistRowsTableChange"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'time'">{{ formatTime(record.createdAt) }}</template>
                <template v-else-if="column.key === 'userQuery'">
                  <a-tooltip placement="topLeft">
                    <template #title>{{ record.userQuery }}</template>
                    <span class="cell-ellipsis gz-query-link" @click="goLogDetail(record.traceId)">{{ record.userQuery }}</span>
                  </a-tooltip>
                </template>
                <template v-else-if="column.key === 'nearestQuery'">
                  <a-tooltip placement="topLeft">
                    <template #title>{{ record.nearestQuery ?? '—' }}</template>
                    <span class="cell-ellipsis">{{ record.nearestQuery ?? '—' }}</span>
                  </a-tooltip>
                </template>
                <template v-else-if="column.key === 'similarity'">
                  <span class="tab-num">{{ formatSimilarity(record.similarity) }}</span>
                </template>
                <template v-else-if="column.key === 'hitLine'">{{ formatHitLine(record.hitLine) }}</template>
                <template v-else-if="column.key === 'status'">
                  <a-tag :color="distRowsStatus(record).color">{{ distRowsStatus(record).text }}</a-tag>
                </template>
                <template v-else-if="column.key === 'marked'">
                  <a-tag :color="record.marked ? 'gold' : 'default'">{{ record.marked ? '已标记' : '未标记' }}</a-tag>
                </template>
                <template v-else-if="column.key === 'actions'">
                  <a-button
                    v-if="record.marked"
                    size="small"
                    :loading="distRowsMarkBusy[record.cacheLogId]"
                    @click="onDistRowUnmark(record)"
                  >取消标记</a-button>
                  <a-button
                    v-else
                    size="small"
                    type="primary"
                    ghost
                    :loading="distRowsMarkBusy[record.cacheLogId]"
                    @click="onDistRowMark(record)"
                  >标记误判</a-button>
                  <a-button size="small" class="copy-id-btn gz-copy-btn" @click="onCopyDistRowCacheLogId(record.cacheLogId)">复制</a-button>
                </template>
              </template>
            </a-table>
          </a-modal>
        </a-tab-pane>

        <a-tab-pane key="grayzone">
          <template #tab><span class="tab-label">灰色区清单</span></template>

          <div class="query-card">
            <div class="query-row">
              <div class="query-item">
                <span class="query-label">时间段</span>
                <a-radio-group v-model:value="gzRangePreset" @change="onGzPresetChange" class="preset-radios">
                  <a-radio-button value="today">今天</a-radio-button>
                  <a-radio-button value="7d">近 7 天</a-radio-button>
                  <a-radio-button value="30d">近 30 天</a-radio-button>
                  <a-radio-button value="custom">自定义</a-radio-button>
                </a-radio-group>
                <a-range-picker v-model:value="gzCustomRange" value-format="YYYY-MM-DD" :placeholder="['开始日期', '结束日期']" class="query-range" @change="onGzCustomRangeChange" />
              </div>
              <div class="query-item">
                <span class="query-label">标记</span>
                <a-select v-model:value="gzMarked" class="gz-marked-select" @change="onGzFilterChange">
                  <a-select-option value="all">全部</a-select-option>
                  <a-select-option value="marked">已标记</a-select-option>
                  <a-select-option value="unmarked">未标记</a-select-option>
                </a-select>
              </div>
              <div class="query-item">
                <span class="query-label">相似度</span>
                <a-input v-model:value="gzSimilarity" class="gz-sim-input" placeholder="如 0.85-0.9（0~1），留空不限" @pressEnter="onGzSearch" />
              </div>
              <div class="query-actions">
                <a-button type="primary" :loading="gzLoading" @click="onGzSearch">查 询</a-button>
              </div>
            </div>
          </div>

          <div class="table-card">
            <a-table
              :columns="gzColumns"
              :data-source="gzData?.list ?? []"
              :loading="gzLoading"
              :row-key="(record: GrayzoneItem) => record.cacheLogId"
              :pagination="gzPagination"
              :scroll="{ x: 'max-content' }"
              size="small"
              @change="onGzTableChange"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'time'">{{ formatTime(record.createdAt) }}</template>
                <template v-else-if="column.key === 'userQuery'">
                  <a-tooltip placement="topLeft">
                    <template #title>{{ record.userQuery }}</template>
                    <span class="cell-ellipsis gz-query-link" @click="goLogDetail(record.traceId)">{{ record.userQuery }}</span>
                  </a-tooltip>
                </template>
                <template v-else-if="column.key === 'nearestQuery'">
                  <a-tooltip placement="topLeft">
                    <template #title>{{ record.nearestQuery }}</template>
                    <span class="cell-ellipsis gz-nearest">{{ record.nearestQuery }}</span>
                  </a-tooltip>
                </template>
                <template v-else-if="column.key === 'similarity'">
                  <span class="tab-num">{{ formatSimilarity(record.similarity) }}</span>
                </template>
                <template v-else-if="column.key === 'hitLine'">{{ formatHitLine(record.hitLine) }}</template>
                <template v-else-if="column.key === 'marked'">
                  <a-tag :color="record.marked ? 'gold' : 'default'">{{ record.marked ? '已标记' : '未标记' }}</a-tag>
                </template>
                <template v-else-if="column.key === 'actions'">
                  <a-button
                    v-if="record.marked"
                    size="small"
                    :loading="gzMarkBusy[record.cacheLogId]"
                    @click="onGzUnmark(record)"
                  >取消标记</a-button>
                  <a-button
                    v-else
                    size="small"
                    type="primary"
                    ghost
                    :loading="gzMarkBusy[record.cacheLogId]"
                    @click="onGzMark(record)"
                  >标记误判</a-button>
                  <a-button size="small" class="copy-id-btn gz-copy-btn" @click="onCopyGzCacheLogId(record.cacheLogId)">复制</a-button>
                </template>
              </template>
            </a-table>
            <div class="gz-tip">口径：「差点命中谁」不去重，按次一行；从最相近条目原文可直接定位可删除的池条目（对照概览条目列表）。</div>
          </div>
        </a-tab-pane>
      </a-tabs>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import { useRoute, useRouter } from 'vue-router'
import { init as initChart, use } from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsType } from 'echarts/core'

use([BarChart, GridComponent, TooltipComponent, CanvasRenderer])
import {
  clearCache,
  deleteCacheEntry,
  fetchCacheEntries,
  fetchCacheOverview,
  fetchCacheStatus,
  fetchEntryHits,
  fetchGrayzone,
  fetchMisjudge,
  fetchSimilarityDistribution,
  fetchSimilarityRows,
  getErrorMessage,
  markMisjudge,
  unmarkMisjudge,
  updateCacheStatus,
  updateHitLine,
  type CacheEntryItem,
  type CacheEntriesData,
  type CacheEntryHitItem,
  type CacheEntryHitsData,
  type CacheOverview,
  type GrayzoneData,
  type GrayzoneItem,
  type MisjudgeData,
  type SimilarityDistributionData,
  type SimilarityRowData,
  type SimilarityRowItem,
} from '../api/client'
import { copyText } from '../utils/clipboard'
import {
  bucketZone,
  CACHE_ZONE_COLORS,
  formatHitLine,
  formatSimilarity,
  similarityHitBadge,
  similarityHitStatus,
  type SimilarityHitBadge,
} from '../utils/cacheDiagnostics'

// ── 通用格式化 ──

const DAY_MS = 24 * 60 * 60 * 1000
const SHANGHAI_UTC_OFFSET_MS = 8 * 60 * 60 * 1000

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function formatTime(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

function formatBytes(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${parseFloat((n / 1024).toFixed(1))} KB`
  return `${parseFloat((n / 1024 / 1024).toFixed(1))} MB`
}

function formatRate(rate: number): string {
  return String(parseFloat(rate.toFixed(4)))
}

// ── 上海时区日界（同 LogsView Token 统计口径）──

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

function isValidRange(range: string[]): boolean {
  return Array.isArray(range) && range.length === 2 && !!range[0] && !!range[1]
}

function currentRange(preset: string, customRange: string[]): { startAt: number; endAt: number } {
  const now = Date.now()
  const todayStart = shanghaiDayStartMs(now)
  if (preset === 'today') return { startAt: todayStart, endAt: now }
  if (preset === '7d') return { startAt: todayStart - 6 * DAY_MS, endAt: now }
  if (preset === '30d') return { startAt: todayStart - 29 * DAY_MS, endAt: now }
  if (isValidRange(customRange)) {
    return {
      startAt: parseShanghaiDate(customRange[0]!),
      endAt: parseShanghaiDate(customRange[1]!) + DAY_MS - 1,
    }
  }
  return { startAt: todayStart, endAt: now }
}

function rangeLabel(preset: string, customRange: string[]): string {
  const range = currentRange(preset, customRange)
  const start = shanghaiDateParts(range.startAt)
  const end = shanghaiDateParts(range.endAt)
  return `${start.year}-${pad2(start.month)}-${pad2(start.day)} ~ ${end.year}-${pad2(end.month)}-${pad2(end.day)}`
}

// ── 概览页 ──

const activeTab = ref<'overview' | 'distribution' | 'grayzone'>('overview')
const router = useRouter()
const route = useRoute()

const LOGS_ACTIVE_TAB_KEY = 'logs-active-tab'

// 返回日志时带上最近使用的 logs tab（test.md 第 11 条）
const logsBackTarget = computed(() => {
  const saved = sessionStorage.getItem(LOGS_ACTIVE_TAB_KEY)
  return saved === 'stats' ? { path: '/logs', query: { tab: 'stats' } } : '/logs'
})

const CACHE_TABS = ['overview', 'distribution', 'grayzone'] as const

function readActiveTabFromQuery(): 'overview' | 'distribution' | 'grayzone' {
  const raw = route.query.tab
  return typeof raw === 'string' && (CACHE_TABS as readonly string[]).includes(raw) ? (raw as 'overview' | 'distribution' | 'grayzone') : 'overview'
}

function readPositiveInt(value: unknown, fallback: number): number {
  const num = typeof value === 'string' ? Number(value) : NaN
  return Number.isInteger(num) && num > 0 ? num : fallback
}

// 切换 tab / 灰色区翻页时用 replace 同步 query（不膨胀历史栈）
function syncRouteQuery() {
  const query: Record<string, string> = {}
  if (activeTab.value !== 'overview') query.tab = activeTab.value
  if (activeTab.value === 'grayzone') {
    query.pageNo = String(gzPageNo.value)
    query.pageSize = String(gzPageSize.value)
  }
  void router.replace({ path: '/cache', query })
}

const overview = ref<CacheOverview | null>(null)
const statusEnabled = ref(false)
const statusSaving = ref(false)
const clearing = ref(false)
const hitLineInput = ref<number | null>(null)
const hitLineSaving = ref(false)
const hitLineTouched = ref(false)

async function loadOverview() {
  try {
    const [status, data] = await Promise.all([fetchCacheStatus(), fetchCacheOverview()])
    overview.value = data
    statusEnabled.value = status.enabled
    if (!hitLineTouched.value) hitLineInput.value = data.hitLine
  } catch (err) {
    message.error(getErrorMessage(err))
  }
}

const statusStateText = computed(() =>
  overview.value === null
    ? '—'
    : overview.value.enabled
      ? '已启用：同一 / 等价问题二次提问直接命中缓存返回'
      : '已停用：所有请求走原链路，不查缓存、不产生判定记录',
)

async function onStatusChange(checked: boolean) {
  statusSaving.value = true
  try {
    const status = await updateCacheStatus(checked)
    statusEnabled.value = status.enabled
    if (overview.value) overview.value.enabled = status.enabled
    message.success(status.enabled ? '缓存已开启' : '缓存已停用')
  } catch (err) {
    statusEnabled.value = overview.value?.enabled ?? false
    message.error(getErrorMessage(err))
  } finally {
    statusSaving.value = false
  }
}

// ── 命中线配置（灰区清单第 15 条）──

const hitLineValid = computed(() => {
  const value = hitLineInput.value
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 1
})

const hitLineDirty = computed(() =>
  hitLineValid.value &&
  overview.value !== null &&
  Math.abs(hitLineInput.value! - overview.value.hitLine) > 1e-9,
)

const hitLineHint = computed(() => {
  if (hitLineInput.value === null) return ''
  return hitLineValid.value ? '' : '需 0 < 命中线 ≤ 1'
})

// 最近命中线修改（feat-A013 验收）：无记录不展示
const lastHitLineChangeText = computed(() => {
  const change = overview.value?.lastHitLineChange
  if (!change) return ''
  return `最近修改：${formatTime(change.at)}（${change.previous} → ${change.current}）`
})

function onHitLineInputChange() {
  hitLineTouched.value = true
}

async function onSaveHitLine() {
  if (!hitLineDirty.value) {
    if (!hitLineValid.value) message.warning('命中线需大于 0 且不超过 1')
    return
  }
  const next = hitLineInput.value!
  hitLineSaving.value = true
  try {
    const result = await updateHitLine(next)
    hitLineTouched.value = false
    hitLineInput.value = result.hitLine
    await loadOverview()
    message.success(`命中线已更新为 ${formatHitLine(result.hitLine)}`)
    if (distData.value) void loadDist()
  } catch (err) {
    message.error(getErrorMessage(err))
  } finally {
    hitLineSaving.value = false
  }
}

async function onClearCache() {
  clearing.value = true
  try {
    const result = await clearCache()
    message.success(`已清除 ${result.cleared} 条缓存条目`)
    await Promise.all([loadOverview(), loadEntries()])
  } catch (err) {
    message.error(getErrorMessage(err))
  } finally {
    clearing.value = false
  }
}

// ── 条目列表 ──

const entriesColumns = [
  { key: 'id', title: 'ID', width: 60 },
  { key: 'queryText', title: '查询（用户输入原文）', width: 280, ellipsis: true },
  { key: 'hitCount', title: '命中次数', width: 100, align: 'center' },
  { key: 'lastAccessAt', title: '最后访问', width: 170 },
  { key: 'createdAt', title: '写入时间', width: 170 },
  { key: 'answerBytes', title: '答案字节', width: 110, align: 'center' },
  { key: 'actions', title: '操作', width: 130, align: 'center' },
]

const entriesData = ref<CacheEntriesData | null>(null)
const entriesLoading = ref(false)
const entriesPageNo = ref(1)
const entriesPageSize = ref(10)
const entriesSortBy = ref<'lastAccessAt' | 'hitCount'>('lastAccessAt')
const entriesOrder = ref<'desc' | 'asc'>('desc')
const deletingIds = reactive<Record<number, boolean>>({})

async function loadEntries() {
  entriesLoading.value = true
  try {
    entriesData.value = await fetchCacheEntries({
      pageNo: entriesPageNo.value,
      pageSize: entriesPageSize.value,
      sortBy: entriesSortBy.value,
      order: entriesOrder.value,
    })
  } catch (err) {
    message.error(getErrorMessage(err))
  } finally {
    entriesLoading.value = false
  }
}

watch([entriesSortBy, entriesOrder], () => {
  entriesPageNo.value = 1
  void loadEntries()
})

function onEntriesTableChange(pagination: { current?: number; pageSize?: number }) {
  entriesPageNo.value = pagination.current ?? 1
  entriesPageSize.value = pagination.pageSize ?? 10
  void loadEntries()
}

const entriesPagination = computed(() => ({
  current: entriesPageNo.value,
  pageSize: entriesPageSize.value,
  total: entriesData.value?.total ?? 0,
  showSizeChanger: true,
  showTotal: (t: number) => `共 ${t} 条`,
  buildOptionText: (opt: { value: string | number }) => `${opt.value}条/页`,
}))

function onRefreshEntries() {
  void loadEntries()
}

async function onDeleteEntry(id: number) {
  deletingIds[id] = true
  try {
    await deleteCacheEntry(id)
    message.success('已删除该缓存条目')
    await Promise.all([loadOverview(), loadEntries()])
  } catch (err) {
    message.error(getErrorMessage(err))
  } finally {
    deletingIds[id] = false
  }
}

async function onCopyEntryId(id: number) {
  void copyText(`条目ID: ${id}`).then((ok) => {
    if (ok) {
      message.success('已复制条目 ID')
    } else {
      message.error('复制失败，请手动复制')
    }
  })
}

// ── 条目命中记录（缓存概览 hitCount 下钻）──

const entryHitsOpen = ref(false)
const entryHitsLoading = ref(false)
const entryHitsData = ref<CacheEntryHitsData | null>(null)
const entryHitsEntryId = ref<number | null>(null)
const entryHitsQueryText = ref('')
const entryHitsPageNo = ref(1)
const entryHitsPageSize = ref(10)

const entryHitsColumns = [
  { key: 'time', title: '时间', width: 170 },
  { key: 'userQuery', title: '用户输入原文', width: 240, ellipsis: true },
  { key: 'similarity', title: '相似度', width: 100, align: 'center' },
  { key: 'marked', title: '误判标记', width: 100, align: 'center' },
]

const entryHitsTitle = computed(() => (entryHitsEntryId.value === null ? '' : '命中记录（' + entryHitsQueryText.value + '）'))

function onOpenEntryHits(record: CacheEntryItem) {
  entryHitsEntryId.value = record.id
  entryHitsQueryText.value = record.queryText
  entryHitsPageNo.value = 1
  entryHitsOpen.value = true
  void loadEntryHits()
}

async function loadEntryHits() {
  if (entryHitsEntryId.value === null) return
  entryHitsLoading.value = true
  try {
    entryHitsData.value = await fetchEntryHits(entryHitsEntryId.value, entryHitsPageNo.value, entryHitsPageSize.value)
  } catch (err) {
    message.error(getErrorMessage(err))
  } finally {
    entryHitsLoading.value = false
  }
}

function onEntryHitsTableChange(pagination: { current?: number; pageSize?: number }) {
  entryHitsPageNo.value = pagination.current ?? 1
  entryHitsPageSize.value = pagination.pageSize ?? 10
  void loadEntryHits()
}

const entryHitsPagination = computed(() => ({
  current: entryHitsPageNo.value,
  pageSize: entryHitsPageSize.value,
  total: entryHitsData.value?.total ?? 0,
  showSizeChanger: true,
  showTotal: (t: number) => '共 ' + t + ' 条',
  buildOptionText: (opt: { value: string | number }) => opt.value + '条/页',
}))

// ── 相似度分布 + 误判率 ──

const distRangePreset = ref<'today' | '7d' | '30d' | 'custom'>('7d')
const distCustomRange = ref<string[]>([])
const distData = ref<SimilarityDistributionData | null>(null)
const distLoading = ref(false)
const misjudgeData = ref<MisjudgeData | null>(null)
const distChartEl = ref<HTMLElement | null>(null)
let distChart: EChartsType | null = null

const distRangeLabel = computed(() =>
  distRangePreset.value === 'custom' ? rangeLabel(distRangePreset.value, distCustomRange.value) : rangeLabel(distRangePreset.value, []),
)

// 图表网格边距（与 setOption grid 同源，下钻点击用网格矩形做命中门禁）
const DIST_GRID = { left: 56, right: 20, top: 24, bottom: 52 } as const

function renderDistChart(data: SimilarityDistributionData) {
  if (!distChartEl.value) return
  distChart ??= initChart(distChartEl.value)
  distChart.getZr().on('click', onDistChartClick)
  const labels = data.buckets.map((bucket, index) =>
    index === data.buckets.length - 1 ? '1.00' : bucket.lower.toFixed(2),
  )
  const bars = data.buckets.map((bucket) => ({
    value: bucket.count,
    itemStyle: { color: CACHE_ZONE_COLORS[bucketZone(bucket.lower, data.hitLine)] },
  }))
  distChart.setOption(
    {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: unknown) => {
          const array = Array.isArray(params) ? params : [params]
          const first = array[0] as { dataIndex?: number } | undefined
          const bucket = data.buckets[first?.dataIndex ?? 0]
          return bucket ? `${bucket.lower.toFixed(2)} ~ ${bucket.upper.toFixed(2)}：<b>${bucket.count}</b> 次请求` : ''
        },
      },
      grid: DIST_GRID,
      xAxis: {
        type: 'category',
        name: '相似度',
        nameLocation: 'middle',
        nameGap: 30,
        data: labels,
        axisLabel: {
          rotate: 45,
          color: '#718078',
          interval: labels.length > 16 ? Math.ceil(labels.length / 12) - 1 : 0,
        },
        axisLine: { lineStyle: { color: '#d7e0d7' } },
        axisTick: { alignWithLabel: true },
      },
      yAxis: {
        type: 'value',
        name: '请求数',
        nameTextStyle: { color: '#849189' },
        minInterval: 1,
        axisLabel: { color: '#718078' },
        splitLine: { lineStyle: { color: '#edf0eb' } },
      },
      series: [
        {
          name: '请求数',
          type: 'bar',
          barMaxWidth: 18,
          data: bars,
        },
      ],
    },
    { notMerge: true },
  )
}

async function loadDist() {
  const range = currentRange(distRangePreset.value, distCustomRange.value)
  distLoading.value = true
  try {
    distData.value = await fetchSimilarityDistribution(range.startAt, range.endAt)
    await refreshMisjudge()
    await nextTick()
    renderDistChart(distData.value)
    distChart?.resize()
  } catch (err) {
    message.error(getErrorMessage(err))
  } finally {
    distLoading.value = false
  }
}

// 误判率卡片静默刷新：复用 fetchMisjudge(当前时间窗)，不加整卡遮罩（feat-A013 验收）
async function refreshMisjudge() {
  const range = currentRange(distRangePreset.value, distCustomRange.value)
  try {
    misjudgeData.value = await fetchMisjudge(range.startAt, range.endAt)
  } catch (err) {
    message.error(getErrorMessage(err))
  }
}

function onDistPresetChange() {
  if (distRangePreset.value === 'custom' && !isValidRange(distCustomRange.value)) {
    message.warning('请选择完整的起止日期')
    distRangePreset.value = '7d'
  }
  void loadDist()
}

function onDistCustomRangeChange(_dates: unknown, dateStrings: [string, string]) {
  if (!dateStrings[0] || !dateStrings[1]) {
    message.warning('请选择完整的起止日期')
    return
  }
  distRangePreset.value = 'custom'
  distCustomRange.value = [dateStrings[0], dateStrings[1]]
  void loadDist()
}

function onRefreshDist() {
  void loadDist()
}

// ── 相似度分布桶下钻明细（bug-00027）──

const distRowsOpen = ref(false)
const distRowsBucketIndex = ref<number | null>(null)
const distRowsPageNo = ref(1)
const distRowsPageSize = ref(20)
const distRowsData = ref<SimilarityRowData | null>(null)
const distRowsLoading = ref(false)
const distRowsMarkBusy = reactive<Record<number, boolean>>({})

const distRowsColumns = [
  { key: 'userQuery', title: '用户输入原文', width: 200, ellipsis: true },
  { key: 'nearestQuery', title: '匹配条目原文', width: 200, ellipsis: true },
  { key: 'similarity', title: '相似度', width: 80, align: 'center' },
  { key: 'hitLine', title: '命中线', width: 80, align: 'center' },
  { key: 'status', title: '命中状态', width: 120, align: 'center' },
  { key: 'marked', title: '误判标记', width: 80, align: 'center' },
  { key: 'time', title: '时间', width: 150 },
  { key: 'actions', title: '操作', width: 170, align: 'center' },
]

const distRowsTitle = computed(() => {
  if (distRowsBucketIndex.value === null || !distData.value) return ''
  const bucket = distData.value.buckets[distRowsBucketIndex.value]
  if (!bucket) return ''
  return `相似度 ${bucket.lower.toFixed(2)} ~ ${bucket.upper.toFixed(2)} 请求明细`
})

const distRowsPagination = computed(() => ({
  current: distRowsPageNo.value,
  pageSize: distRowsPageSize.value,
  total: distRowsData.value?.total ?? 0,
  showSizeChanger: true,
  showTotal: (t: number) => `共 ${t} 条`,
  buildOptionText: (opt: { value: string | number }) => `${opt.value}条/页`,
}))

function openDistRows(bucketIndex: number) {
  distRowsBucketIndex.value = bucketIndex
  distRowsPageNo.value = 1
  distRowsOpen.value = true
  void loadDistRows()
}

async function loadDistRows(silent = false) {
  if (distRowsBucketIndex.value === null) return
  const range = currentRange(distRangePreset.value, distCustomRange.value)
  if (!silent) distRowsLoading.value = true
  try {
    distRowsData.value = await fetchSimilarityRows({
      startAt: range.startAt,
      endAt: range.endAt,
      bucketIndex: distRowsBucketIndex.value,
      pageNo: distRowsPageNo.value,
      pageSize: distRowsPageSize.value,
    })
  } catch (err) {
    message.error(getErrorMessage(err))
  } finally {
    if (!silent) distRowsLoading.value = false
  }
}

function onDistRowsTableChange(pagination: { current?: number; pageSize?: number }) {
  distRowsPageNo.value = pagination.current ?? 1
  distRowsPageSize.value = pagination.pageSize ?? 20
  void loadDistRows()
}

function distRowsStatus(record: SimilarityRowItem): SimilarityHitBadge {
  return similarityHitBadge(similarityHitStatus(record.hit, record.similarity, record.hitLine, record.tieHits))
}

async function onDistRowMark(row: SimilarityRowItem) {
  distRowsMarkBusy[row.cacheLogId] = true
  try {
    await markMisjudge(row.cacheLogId)
    message.success('已标记为误判')
    await Promise.all([loadDistRows(true), refreshMisjudge()])
  } catch (err) {
    message.error(getErrorMessage(err))
  } finally {
    distRowsMarkBusy[row.cacheLogId] = false
  }
}

async function onDistRowUnmark(row: SimilarityRowItem) {
  distRowsMarkBusy[row.cacheLogId] = true
  try {
    await unmarkMisjudge(row.cacheLogId)
    message.success('已取消误判标记')
    await Promise.all([loadDistRows(true), refreshMisjudge()])
  } catch (err) {
    message.error(getErrorMessage(err))
  } finally {
    distRowsMarkBusy[row.cacheLogId] = false
  }
}

function onDistChartClick(event: unknown) {
  const chart = distChart
  if (!chart || !distData.value) return
  const ev = event as { offsetX?: number; offsetY?: number }
  if (typeof ev.offsetX !== 'number' || typeof ev.offsetY !== 'number') return
  const inGrid =
    ev.offsetX >= DIST_GRID.left &&
    ev.offsetX < chart.getWidth() - DIST_GRID.right &&
    ev.offsetY >= DIST_GRID.top &&
    ev.offsetY < chart.getHeight() - DIST_GRID.bottom
  if (!inGrid) return
  const mapped = chart.convertFromPixel({ gridIndex: 0 }, [ev.offsetX, ev.offsetY])
  const index = Array.isArray(mapped) ? Math.round(mapped[0]) : NaN
  if (!Number.isNaN(index) && index >= 0 && index < distData.value.buckets.length) {
    openDistRows(index)
  }
}

// ── 灰色区清单 ──

const gzColumns = [
  { key: 'userQuery', title: '用户输入原文', width: 240, ellipsis: true },
  { key: 'nearestQuery', title: '最相近条目原文', width: 240, ellipsis: true },
  { key: 'similarity', title: '相似度', width: 100, align: 'center' },
  { key: 'hitLine', title: '命中线', width: 90, align: 'center' },
  { key: 'marked', title: '误判标记', width: 100, align: 'center' },
  { key: 'time', title: '时间', width: 170 },
  { key: 'actions', title: '操作', width: 210, align: 'center' },
]

const gzRangePreset = ref<'today' | '7d' | '30d' | 'custom'>('7d')
const gzCustomRange = ref<string[]>([])
const gzMarked = ref<'all' | 'marked' | 'unmarked'>('all')
const gzSimilarity = ref('')
const gzData = ref<GrayzoneData | null>(null)
const gzLoading = ref(false)
const gzPageNo = ref(1)
const gzPageSize = ref(10)
const gzMarkBusy = reactive<Record<number, boolean>>({})
// 解析相似度区间输入：支持「下限-上限」（半角连字符为主分隔，兼容半角/全角「~」），可省一边或写单个下限；空返回空对象，非法返回 null

function parseGzSimilarity(): { similarityMin?: number; similarityMax?: number } | null {
  const text = gzSimilarity.value.trim().replace(/[～~-]/g, '\x7E')
  if (!text) return {}
  const parts = text.split('\x7E').map((part) => part.trim()).filter(Boolean)
  if (parts.length === 0) return {}
  if (parts.length > 2) return null
  const nums = parts.map((part) => Number(part))
  if (nums.some((num) => !Number.isFinite(num))) return null
  const min = nums[0]!
  const max = nums.length === 2 ? nums[1]! : undefined
  if (min < 0 || min > 1 || (max !== undefined && (max < 0 || max > 1))) return null
  if (max !== undefined && min > max) return null
  return max === undefined ? { similarityMin: min } : { similarityMin: min, similarityMax: max }
}

async function loadGrayzone(silent = false) {
  const range = currentRange(gzRangePreset.value, gzCustomRange.value)
  const similarity = parseGzSimilarity()
  if (similarity === null) {
    message.warning('相似度区间非法：需为 0~1 内的两个数且下限 ≤ 上限，如 0.85-0.9')
    return
  }
  if (!silent) gzLoading.value = true
  try {
    gzData.value = await fetchGrayzone({
      startAt: range.startAt,
      endAt: range.endAt,
      pageNo: gzPageNo.value,
      pageSize: gzPageSize.value,
      marked: gzMarked.value,
      ...similarity,
    })
  } catch (err) {
    message.error(getErrorMessage(err))
  } finally {
    if (!silent) gzLoading.value = false
  }
}

function onGzPresetChange() {
  if (gzRangePreset.value === 'custom' && !isValidRange(gzCustomRange.value)) {
    message.warning('请选择完整的起止日期')
    gzRangePreset.value = '7d'
  }
  gzPageNo.value = 1
  void loadGrayzone()
}

function onGzCustomRangeChange(_dates: unknown, dateStrings: [string, string]) {
  if (!dateStrings[0] || !dateStrings[1]) {
    message.warning('请选择完整的起止日期')
    return
  }
  gzRangePreset.value = 'custom'
  gzCustomRange.value = [dateStrings[0], dateStrings[1]]
  gzPageNo.value = 1
  void loadGrayzone()
}

function onGzFilterChange() {
  gzPageNo.value = 1
  void loadGrayzone()
}

function onGzSearch() {
  gzPageNo.value = 1
  void loadGrayzone()
}

function onGzTableChange(pagination: { current?: number; pageSize?: number }) {
  gzPageNo.value = pagination.current ?? 1
  gzPageSize.value = pagination.pageSize ?? 10
  void loadGrayzone()
}

const gzPagination = computed(() => ({
  current: gzPageNo.value,
  pageSize: gzPageSize.value,
  total: gzData.value?.total ?? 0,
  showSizeChanger: true,
  showTotal: (t: number) => `共 ${t} 条`,
  buildOptionText: (opt: { value: string | number }) => `${opt.value}条/页`,
}))

async function onGzMark(row: GrayzoneItem) {
  gzMarkBusy[row.cacheLogId] = true
  try {
    await markMisjudge(row.cacheLogId)
    message.success('已标记为误判')
    await loadGrayzone(true)
  } catch (err) {
    message.error(getErrorMessage(err))
  } finally {
    gzMarkBusy[row.cacheLogId] = false
  }
}

async function onGzUnmark(row: GrayzoneItem) {
  gzMarkBusy[row.cacheLogId] = true
  try {
    await unmarkMisjudge(row.cacheLogId)
    message.success('已取消误判标记')
    await loadGrayzone(true)
  } catch (err) {
    message.error(getErrorMessage(err))
  } finally {
    gzMarkBusy[row.cacheLogId] = false
  }
}

function goLogDetail(traceId: string) {
  void router.push({ path: '/logs', query: { traceId, tab: 'list' } })
}

// 灰色区清单「复制」：复制 cacheLogId（feat-A013 验收统一「标签: 值」前缀）
function onCopyGzCacheLogId(cacheLogId: number) {
  void copyText(`cacheLogId: ${cacheLogId}`).then((ok) => {
    if (ok) {
      message.success('已复制 cacheLogId')
    } else {
      message.error('复制失败，请手动选择复制')
    }
  })
}

// 分布下钻弹框「复制」：同灰色区口径复制 cacheLogId
function onCopyDistRowCacheLogId(cacheLogId: number) {
  void copyText(`cacheLogId: ${cacheLogId}`).then((ok) => {
    if (ok) {
      message.success('已复制 cacheLogId')
    } else {
      message.error('复制失败，请手动选择复制')
    }
  })
}

// ── Tab 懒加载 + 生命周期 ──

watch(activeTab, async (tab) => {
  await nextTick()
  if (tab === 'distribution') {
    if (distData.value) {
      renderDistChart(distData.value)
      distChart?.resize()
    } else {
      void loadDist()
    }
  } else if (tab === 'grayzone') {
    if (!gzData.value) void loadGrayzone()
  } else if (tab === 'overview') {
    if (!overview.value || !entriesData.value) {
      void Promise.all([loadOverview(), loadEntries()])
    }
  }
  syncRouteQuery()
})

watch([gzPageNo, gzPageSize], () => {
  if (activeTab.value === 'grayzone') syncRouteQuery()
})

function onWindowResize() {
  distChart?.resize()
}

onMounted(async () => {
  const today = shanghaiDateString(Date.now())
  distCustomRange.value = [today, today]
  gzCustomRange.value = [today, today]
  activeTab.value = readActiveTabFromQuery()
  gzPageNo.value = readPositiveInt(route.query.pageNo, 1)
  gzPageSize.value = readPositiveInt(route.query.pageSize, 10)
  window.addEventListener('resize', onWindowResize)
  await Promise.all([loadOverview(), loadEntries()])
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onWindowResize)
  distChart?.dispose()
  distChart = null
})
</script>

<style scoped>
.cache-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #f5f7f2 0%, #eef3eb 55%, #f7f4ed 100%);
  color: #1d2924;
}

.page-shell {
  display: flex;
  flex-direction: column;
  max-width: 1400px;
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

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
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

.cache-tabs {
  margin-top: 4px;
}

.tab-label {
  font-weight: 600;
  letter-spacing: 0.04em;
}

/* ── 概览 ── */

.status-card {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 14px 18px;
  border: 1px solid #d9e1d8;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.9);
}

.switch-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.switch-label {
  color: #40544a;
  font-size: 13px;
  font-weight: 600;
}

.switch-state {
  color: #7b8a80;
  font-size: 12px;
}

.hitline-group {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 24px;
}

.hitline-input {
  width: 88px;
}

.hitline-hint {
  color: #b17837;
  font-size: 12px;
}

.hitline-last-change {
  color: #7b8a80;
  font-size: 12px;
}

.status-meta {
  display: flex;
  gap: 14px;
  margin-left: auto;
  color: #40544a;
  font-size: 12px;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 14px;
  margin-top: 16px;
}

.stat-card {
  padding: 16px 18px;
  border: 1px solid #d9e1d8;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.9);
}

.stat-num {
  color: #163c32;
  font-size: 24px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.approx-mark {
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 4px;
  background: #fffbe6;
  border: 1px solid #ffe7ba;
  color: #d48806;
  font-size: 11px;
  font-weight: 600;
  vertical-align: 4px;
}

.stat-label {
  margin-top: 6px;
  color: #7b8a80;
  font-size: 12px;
}

.overview-note {
  margin-top: 10px;
  color: #94a099;
  font-size: 12px;
  line-height: 1.7;
}

.entries-card {
  margin-top: 16px;
  padding: 16px 18px;
  border: 1px solid #d9e1d8;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.9);
}

.entries-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.entries-title {
  margin: 0;
  color: #163c32;
  font-size: 13px;
  font-weight: 600;
}

.entries-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.controls-label {
  color: #7b8a80;
  font-size: 12px;
}

.sort-select,
.order-select {
  width: 110px;
}

.entries-table {
  border: 1px solid #e3e9e2;
  border-radius: 12px;
  overflow: hidden;
}

.cell-ellipsis {
  display: block;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tab-num {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

/* ── 分布 ── */

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

.query-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

.preset-radios {
  margin-right: 4px;
}

.query-range {
  width: 232px;
}

.stats-card,
.table-card,
.misjudge-card {
  margin-top: 16px;
  padding: 16px 18px;
  border: 1px solid #d9e1d8;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.9);
}

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

.stats-summary {
  display: flex;
  align-items: center;
  gap: 14px;
}

.summary-item {
  color: #40544a;
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
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

.dist-legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
  margin-top: 10px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #40544a;
  font-size: 12px;
}

.legend-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 3px;
}

.legend-hint {
  color: #94a099;
  font-size: 11px;
}

.misjudge-title {
  margin: 0 0 12px;
  color: #163c32;
  font-size: 13px;
  font-weight: 600;
}

.misjudge-grid {
  display: flex;
  gap: 36px;
}

.misjudge-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.misjudge-num {
  color: #163c32;
  font-size: 22px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.misjudge-label {
  color: #7b8a80;
  font-size: 12px;
}

.misjudge-note {
  margin-top: 10px;
  color: #94a099;
  font-size: 12px;
  line-height: 1.6;
}

/* ── 灰色区 ── */

.gz-marked-select {
  width: 110px;
}

.gz-sim-input {
  width: 180px;
}

.gz-query-link {
  color: #2e6d56;
  text-decoration: underline;
  cursor: pointer;
}

.gz-query-link:hover {
  color: #b17837;
}

.gz-query-link-disabled {
  color: rgba(0, 0, 0, 0.25);
  cursor: default;
}

.copy-id-btn {
  margin-right: 6px;
}

.gz-copy-btn {
  margin-left: 8px;
}

.hit-count-link {
  color: #2e6d56;
  text-decoration: underline;
  cursor: pointer;
}

.hit-count-link:hover {
  color: #b17837;
}

.gz-nearest {
  color: #d48806;
  font-weight: 600;
}


.gz-tip {
  margin-top: 10px;
  color: #94a099;
  font-size: 12px;
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
  .query-range {
    width: 100%;
  }
}
</style>
