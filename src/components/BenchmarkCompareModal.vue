<template>
  <a-modal
    v-model:open="open"
    title="历史快照比较"
    :footer="null"
    width="min(1000px, 94vw)"
    :mask-closable="!comparing"
    :body-style="{ maxHeight: 'calc(100vh - 220px)', overflowY: 'auto' }"
  >
    <div class="compare-bar">
      <span class="compare-base">{{ formatBenchmarkTime(baseItem?.time ?? '') }}</span>
      <span class="compare-vs">vs</span>
      <a-select
        v-model:value="targetRunId"
        :options="candidateOptions"
        placeholder="选择比较对象"
        class="compare-select"
        :disabled="noCandidate || comparing"
      />
      <a-button type="primary" :loading="comparing" :disabled="!targetRunId" @click="runCompare">开始比较</a-button>
    </div>

    <div v-if="noCandidate" class="compare-empty">暂无题量一致（{{ baseTotal }} 题）的历史快照可比</div>

    <template v-else-if="comparison">
      <p class="compare-meta">
        基准 {{ formatBenchmarkTime(comparison.timeA) }}
        vs {{ formatBenchmarkTime(comparison.timeB) }}
      </p>

      <a-tabs v-model:activeKey="resultTab" size="small" class="compare-tabs">
        <a-tab-pane key="category" tab="类别计数变化">
          <section class="compare-section">
            <a-table
              :columns="categoryColumns"
              :data-source="comparison.categories"
              :pagination="false"
              size="small"
              row-key="name"
              class="compare-cat-table"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'top5' || column.key === 'tail' || column.key === 'miss'">
                  <span>{{ record.a[column.key] }} → {{ record.b[column.key] }}</span>
                  <span :class="deltaClass(record[`${column.key}Delta`], column.key)">{{ deltaText(record[`${column.key}Delta`]) }}</span>
                </template>
                <template v-else>{{ record[column.key] }}</template>
              </template>
            </a-table>
            <p class="compare-total">
              总计：通过 {{ comparison.top5A }} → {{ comparison.top5B }} · 兜底 {{ comparison.tailA }} → {{ comparison.tailB }} · 未命中 {{ comparison.missA }} → {{ comparison.missB }}
            </p>
          </section>
        </a-tab-pane>

        <a-tab-pane key="rows" tab="逐项名次 / 入榜出榜">
          <section class="compare-section">
            <div class="compare-section-head">
              <a-radio-group v-model:value="changeFilter" size="small">
                <a-radio-button value="all">全部（{{ comparison.rows.length }}）</a-radio-button>
                <a-radio-button value="up">排名上升（{{ upCount }}）</a-radio-button>
                <a-radio-button value="down">排名下降（{{ downCount }}）</a-radio-button>
              </a-radio-group>
              <a-checkbox v-model:checked="onlyChanged">只看变化</a-checkbox>
            </div>
            <a-table
              :columns="rowColumns"
              :data-source="visibleRows"
              :pagination="{ pageSize: 10, showSizeChanger: false, showTotal: (t: number) => `共 ${t} 题` }"
              size="small"
              row-key="id"
              :row-class-name="rowClassName"
              class="compare-row-table"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'question'">
                  <a-tooltip placement="topLeft">
                    <template #title>{{ record.question }}</template>
                    <span class="cell-ellipsis">{{ record.question }}</span>
                  </a-tooltip>
                </template>
                <template v-else-if="column.key === 'rankA'">{{ rankText(record.rankA) }}</template>
                <template v-else-if="column.key === 'rankB'">{{ rankText(record.rankB) }}</template>
                <template v-else-if="column.key === 'change'">
                  <a-tag :color="changeColor(record.change)" class="compare-change-tag">{{ changeLabel(record.change) }}</a-tag>
                </template>
                <template v-else-if="column.key === 'category'">
                  <span class="compare-category">{{ record.category }}</span>
                </template>
                <template v-else-if="column.key === 'actions'">
                  <a-tooltip title="基准快照该题召回列表">
                    <a-button type="link" size="small" :disabled="record.rankA <= 0" @click="openCandidates(record, 'A')">A</a-button>
                  </a-tooltip>
                  <a-tooltip title="对比快照该题召回列表">
                    <a-button type="link" size="small" :disabled="record.rankB <= 0" @click="openCandidates(record, 'B')">B</a-button>
                  </a-tooltip>
                </template>
              </template>
            </a-table>
          </section>
        </a-tab-pane>
      </a-tabs>
    </template>
  </a-modal>
  <CandidateListModal
    v-model:open="candidateModalOpen"
    :result="candidateModalResult"
    :highlight-id="candidateModalHighlightId"
    @open-chapter="emit('open-chapter', $event)"
  />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import {
  getBenchmarkSnapshot,
  getErrorMessage,
  type BenchmarkCandidate,
  type BenchmarkHistoryItem,
  type BenchmarkResultItem,
} from '../api/client'
import CandidateListModal from './CandidateListModal.vue'
import {
  compareSnapshots,
  isRankDown,
  isRankUp,
  type BenchmarkComparison,
  type CompareRow,
  type RankChange,
} from '../utils/benchmarkCompare'

const props = defineProps<{
  open: boolean
  historyItems: BenchmarkHistoryItem[]
  baseRunId: string | null
}>()
const emit = defineEmits<{ 'update:open': [value: boolean]; 'open-chapter': [candidate: BenchmarkCandidate] }>()

const open = computed({
  get: () => props.open,
  set: (value: boolean) => emit('update:open', value),
})

const targetRunId = ref<string | null>(null)
const comparing = ref(false)
const comparison = ref<BenchmarkComparison | null>(null)
const onlyChanged = ref(true)
const resultTab = ref<'category' | 'rows'>('category')
type ChangeFilter = 'all' | 'up' | 'down'
const changeFilter = ref<ChangeFilter>('all')
const candidateModalOpen = ref(false)
const candidateModalResult = ref<BenchmarkResultItem | null>(null)
const candidateModalHighlightId = ref<string | null>(null)

const baseItem = computed(() => props.historyItems.find((i) => i.runId === props.baseRunId) ?? null)
const baseTotal = computed(() => baseItem.value?.summary.total ?? 0)
/** 只比题量一致的快照（负责人口径：跨版本不做兼容） */
const candidates = computed(() =>
  props.historyItems.filter((i) => i.runId !== props.baseRunId && i.summary.total === baseItem.value?.summary.total),
)
const noCandidate = computed(() => props.open && !!props.baseRunId && candidates.value.length === 0)
const candidateOptions = computed(() =>
  candidates.value.map((i) => ({
    value: i.runId,
    label: `${formatBenchmarkTime(i.time)} · 通过 ${i.summary.top5}/${i.summary.total}`,
  })),
)

/** 筛选口径（负责人 2026-09-29 定）：排名上升 = up + 入榜；排名下降 = down + 出榜 */
const upCount = computed(() => comparison.value?.rows.filter((r) => isRankUp(r.change)).length ?? 0)
const downCount = computed(() => comparison.value?.rows.filter((r) => isRankDown(r.change)).length ?? 0)
const visibleRows = computed<CompareRow[]>(() => {
  const rows = comparison.value?.rows ?? []
  const filtered = rows.filter((r) => {
    if (changeFilter.value === 'up') return isRankUp(r.change)
    if (changeFilter.value === 'down') return isRankDown(r.change)
    return true
  })
  return onlyChanged.value ? filtered.filter((r) => r.change !== 'flat') : filtered
})

watch(
  () => [props.open, props.baseRunId],
  () => {
    if (!props.open) return
    targetRunId.value = candidates.value[0]?.runId ?? null
    comparison.value = null
    onlyChanged.value = true
    changeFilter.value = 'all'
    resultTab.value = 'category'
  },
)

// 弹框打开时锁背景滚动，防止滚轮穿透到下层页面（bug-00047 反馈 5）
const previousBodyOverflow = ref('')
watch(
  () => props.open,
  (opened) => {
    if (opened) {
      previousBodyOverflow.value = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = previousBodyOverflow.value
    }
  },
)
onBeforeUnmount(() => {
  if (props.open) document.body.style.overflow = previousBodyOverflow.value
})

async function runCompare(): Promise<void> {
  if (!props.baseRunId || !targetRunId.value || comparing.value) return
  comparing.value = true
  try {
    const [a, b] = await Promise.all([
      getBenchmarkSnapshot(props.baseRunId),
      getBenchmarkSnapshot(targetRunId.value),
    ])
    if (!a || !b) {
      message.warning('快照不存在或已被清理，无法比较')
      return
    }
    const result = compareSnapshots(a, b)
    if (!result) {
      message.warning('题量不一致，无法比较')
      return
    }
    comparison.value = result
  } catch (err) {
    message.error(getErrorMessage(err))
  } finally {
    comparing.value = false
  }
}

/** 打开某行某侧快照的召回列表（复用类别汇总同款弹框：标题候选数、高亮当前 rank 对应候选，口径一致） */
function openCandidates(row: CompareRow, side: 'A' | 'B'): void {
  const item = side === 'A' ? row.itemA : row.itemB
  const rank = side === 'A' ? row.rankA : row.rankB
  if (!item) return
  candidateModalResult.value = item
  const index = rank - 1
  candidateModalHighlightId.value = index >= 0 && index < item.candidates.length ? item.candidates[index].id : null
  candidateModalOpen.value = true
}

function formatBenchmarkTime(raw: string): string {
  if (!raw) return raw
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return raw
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function rankText(rank: number): string {
  return rank === 0 ? '未召回' : String(rank)
}

const CHANGE_LABELS: Record<RankChange, string> = {
  up: '↑ 上升',
  down: '↓ 下降',
  flat: '— 持平',
  enter: '入榜',
  leave: '出榜',
}

const CHANGE_COLORS: Record<RankChange, string> = {
  up: 'green',
  down: 'orange',
  flat: 'default',
  enter: 'blue',
  leave: 'red',
}

function changeLabel(change: unknown): string {
  return CHANGE_LABELS[change as RankChange] ?? String(change)
}

function changeColor(change: unknown): string {
  return CHANGE_COLORS[change as RankChange] ?? 'default'
}

function deltaText(delta: number): string {
  if (delta === 0) return ''
  return delta > 0 ? `+${delta}` : `${delta}`
}

/** 通过/未命中按好坏着色，兜底仅中性展示（兜底增多不直接等于变好或变坏） */
function deltaClass(delta: number, key: string): string {
  if (delta === 0) return ''
  if (key === 'top5') return delta > 0 ? 'compare-delta-pos' : 'compare-delta-neg'
  if (key === 'miss') return delta > 0 ? 'compare-delta-neg' : 'compare-delta-pos'
  return 'compare-delta-neutral'
}

function rowClassName(record: CompareRow): string {
  return record.change === 'flat' ? '' : 'compare-row-changed'
}

const categoryColumns = [
  { key: 'name', title: '类别' },
  { key: 'top5', title: '通过', align: 'center', width: 150 },
  { key: 'tail', title: '兜底', align: 'center', width: 150 },
  { key: 'miss', title: '未命中', align: 'center', width: 150 },
]

const rowColumns = [
  { key: 'category', title: '分类', width: 100 },
  { key: 'question', title: '问题' },
  { key: 'rankA', title: 'A 名次', width: 90, align: 'center' },
  { key: 'rankB', title: 'B 名次', width: 90, align: 'center' },
  { key: 'change', title: '变化', width: 120, align: 'center' },
  { key: 'actions', title: '操作', width: 130, align: 'center' },
]
</script>

<style scoped>
.compare-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 12px;
}

.compare-base {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
  font-weight: 700;
  color: #163c32;
}

.compare-vs {
  color: #8b9990;
}

.compare-select {
  width: 340px;
}

.compare-empty {
  padding: 40px 0;
  text-align: center;
  color: #8b9990;
}

.compare-meta {
  margin: 0 0 4px;
  color: #718078;
  font-size: 12px;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
}

.compare-section {
  margin-top: 16px;
}

.compare-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.compare-title {
  margin: 0 0 8px;
  color: #163c32;
  font-size: 14px;
}

.compare-total {
  margin: 8px 0 0;
  color: #718078;
  font-size: 12px;
}

.cell-ellipsis {
  display: inline-block;
  max-width: 420px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
}

.compare-delta-pos {
  margin-left: 6px;
  color: #2e6d56;
  font-weight: 600;
}

.compare-delta-neg {
  margin-left: 6px;
  color: #c25b4e;
  font-weight: 600;
}

.compare-delta-neutral {
  margin-left: 6px;
  color: #4a7ba6;
  font-weight: 600;
}

.compare-row-changed > td {
  background: #f0f7ff !important;
}

.compare-category {
  color: #163c32;
  font-weight: 600;
}
</style>
