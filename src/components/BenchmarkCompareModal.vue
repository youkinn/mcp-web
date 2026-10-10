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

      <template v-else-if="groupComparison">
        <p class="compare-meta">
          基准 {{ formatBenchmarkTime(groupComparison.timeA) }}
          vs {{ formatBenchmarkTime(groupComparison.timeB) }}
        </p>

        <a-tabs v-model:activeKey="resultTab" size="small" class="compare-tabs">
          <a-tab-pane key="category" tab="分类计数变化">
            <section class="compare-section">
              <a-table
                :columns="groupCategoryColumns"
                :data-source="groupComparison.buckets"
                :pagination="false"
                size="small"
                row-key="name"
                class="compare-cat-table"
              >
                <template #bodyCell="{ column, record }">
                  <template v-if="column.key === 'name'">
                    <component :is="CategoryCell" :label="record.name" />
                  </template>
                  <template v-else-if="column.key === 'hit5' || column.key === 'miss'">
                    <span>{{ record.a[column.key] }} → {{ record.b[column.key] }}</span>
                    <span :class="deltaClass(record[`${column.key}Delta`], column.key)">{{ deltaText(record[`${column.key}Delta`]) }}</span>
                  </template>
                  <template v-else-if="column.key === 'cover5'">
                    <span>{{ groupRateText(record.a.cover5) }} → {{ groupRateText(record.b.cover5) }}</span>
                    <span :class="deltaClass(record.cover5Delta, 'cover5')">{{ groupPointText(record.cover5Delta) }}</span>
                  </template>
                  <template v-else>{{ record[column.key] }}</template>
                </template>
              </a-table>
              <p class="compare-total">
                总计：hit@5 {{ groupCountRateText(groupComparison.hit5A, groupComparison.total) }} →
                {{ groupCountRateText(groupComparison.hit5B, groupComparison.total) }} · 未进池
                {{ groupCountText(groupComparison.missA) }} → {{ groupCountText(groupComparison.missB) }} · cover@5
                {{ groupRateText(groupComparison.cover5A) }} → {{ groupRateText(groupComparison.cover5B) }}
              </p>
              <p class="compare-total">
                未进池归因：桥未命中 {{ groupCountText(groupComparison.missNoBridgeA) }} →
                {{ groupCountText(groupComparison.missNoBridgeB) }} · 并池后掉窗
                {{ groupCountText(groupComparison.droppedA) }} → {{ groupCountText(groupComparison.droppedB) }}
              </p>
            </section>
          </a-tab-pane>

          <a-tab-pane key="rows" tab="逐项 status@firstRank">
            <section class="compare-section">
              <div class="compare-section-head">
                <a-radio-group v-model:value="changeFilter" size="small">
                  <a-radio-button value="all">全部（{{ groupComparison.rows.length }}）</a-radio-button>
                  <a-radio-button value="up">排名上升（{{ upCount }}）</a-radio-button>
                  <a-radio-button value="down">排名下降（{{ downCount }}）</a-radio-button>
                </a-radio-group>
                <a-checkbox v-model:checked="onlyChanged">只看变化</a-checkbox>
              </div>
              <a-table
                :columns="groupRowColumns"
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
                  <template v-else-if="column.key === 'category'">
                    <component :is="CategoryCell" :label="record.category" />
                  </template>
                  <template v-else-if="column.key === 'bucketA'">{{ groupBucketLabel(record.bucketA) }}</template>
                  <template v-else-if="column.key === 'bucketB'">{{ groupBucketLabel(record.bucketB) }}</template>
                  <template v-else-if="column.key === 'rankA'">{{ firstRankText(record.rankA) }}</template>
                  <template v-else-if="column.key === 'rankB'">{{ firstRankText(record.rankB) }}</template>
                  <template v-else-if="column.key === 'change'">
                    <a-tag :color="changeColor(record.change)" class="compare-change-tag">{{ changeLabel(record.change) }}</a-tag>
                  </template>
                </template>
              </a-table>
            </section>
          </a-tab-pane>
        </a-tabs>
      </template>

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
                <template v-if="column.key === 'name'">
                  <component :is="CategoryCell" :label="record.name" />
                </template>
                <template v-else-if="column.key === 'top5' || column.key === 'tail' || column.key === 'miss'">
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
                  <component :is="CategoryCell" :label="record.category" />
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
import { computed, h, onBeforeUnmount, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import {
  getBenchmarkSnapshot,
  getErrorMessage,
  type BenchmarkCandidate,
  type BenchmarkHistoryItem,
  type BenchmarkRerankConfig,
  type BenchmarkResultItem,
} from '../api/client'
import CandidateListModal from './CandidateListModal.vue'
import {
  compareGroupSnapshots,
  compareSnapshots,
  isRankDown,
  isRankUp,
  type BenchmarkComparison,
  type CompareRow,
  type GroupComparison,
  type RankChange,
} from '../utils/benchmarkCompare'
import {
  firstRankText,
  groupBucketLabel,
  groupCountRateText,
  groupCountText,
  groupRateText,
  isGroupSummary,
  summaryCover5,
} from '../utils/benchmarkGroup'

const props = defineProps<{
  open: boolean
  historyItems: BenchmarkHistoryItem[]
  baseRunId: string | null
  /** 当前评测集 Id（组判分集快照按集隔离取数；缺省 = standard） */
  setId?: string
}>()
const emit = defineEmits<{ 'update:open': [value: boolean]; 'open-chapter': [candidate: BenchmarkCandidate] }>()

const open = computed({
  get: () => props.open,
  set: (value: boolean) => emit('update:open', value),
})

const targetRunId = ref<string | null>(null)
const comparing = ref(false)
const comparison = ref<BenchmarkComparison | null>(null)
/** 组判分集比较结果（与锚集比较分开持有，避免两套字段混用） */
const groupComparison = ref<GroupComparison | null>(null)
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
/** 重排展示口径（负责人 16:22 定）：off → 「重排关闭」不显示窗口数字；on+wired=false → 附「（未接入）」；
 *  老快照无 rerank 字段 → 不追加该段；窗口一律取该条快照记录的实际值 */
function rerankSuffix(rerank: BenchmarkRerankConfig | undefined): string {
  if (!rerank) return ''
  if (rerank.mode !== 'on') return ' · 重排关闭'
  return ` · 重排窗口 ${rerank.window}${rerank.wired === false ? '（未接入）' : ''}`
}

const candidateOptions = computed(() =>
  candidates.value.map((i) => ({
    value: i.runId,
    label: isGroupSummary(i.summary)
      ? `${formatBenchmarkTime(i.time)} · cover@5 ${groupRateText(summaryCover5(i.summary))} · hit@5 ${groupCountRateText(i.summary.hit5, i.summary.total)}`
      : `${formatBenchmarkTime(i.time)} · 通过 ${i.summary.top5}/${i.summary.total}${rerankSuffix(i.summary.rerank)}`,
  })),
)

/** 当前比较结果的逐项行：锚集与组集共用同一行结构，按被比较快照的判定口径取用 */
const activeRows = computed<CompareRow[]>(() =>
  groupComparison.value ? groupComparison.value.rows : (comparison.value?.rows ?? []),
)
/** 筛选口径（负责人 2026-09-29 定）：排名上升 = up + 入榜；排名下降 = down + 出榜 */
const upCount = computed(() => activeRows.value.filter((r) => isRankUp(r.change)).length)
const downCount = computed(() => activeRows.value.filter((r) => isRankDown(r.change)).length)
const visibleRows = computed<CompareRow[]>(() => {
  const rows = activeRows.value
  const filtered = rows.filter((r) => {
    if (changeFilter.value === 'up') return isRankUp(r.change)
    if (changeFilter.value === 'down') return isRankDown(r.change)
    return true
  })
  return onlyChanged.value ? filtered.filter((r) => r.change !== 'flat') : filtered
})

watch(
  () => [props.open, props.baseRunId, props.setId],
  () => {
    if (!props.open) return
    targetRunId.value = candidates.value[0]?.runId ?? null
    comparison.value = null
    groupComparison.value = null
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
      getBenchmarkSnapshot(props.baseRunId, props.setId),
      getBenchmarkSnapshot(targetRunId.value, props.setId),
    ])
    if (!a || !b) {
      message.warning('快照不存在或已被清理，无法比较')
      return
    }
    if (isGroupSummary(a.summary) || isGroupSummary(b.summary)) {
      const groupResult = compareGroupSnapshots(a, b)
      if (!groupResult) {
        message.warning('题量不一致或快照缺组判分字段，无法比较')
        return
      }
      groupComparison.value = groupResult
      comparison.value = null
      return
    }
    const result = compareSnapshots(a, b)
    if (!result) {
      message.warning('题量不一致，无法比较')
      return
    }
    comparison.value = result
    groupComparison.value = null
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
  if (key === 'top5' || key === 'hit5' || key === 'cover5') return delta > 0 ? 'compare-delta-pos' : 'compare-delta-neg'
  if (key === 'miss') return delta > 0 ? 'compare-delta-neg' : 'compare-delta-pos'
  return 'compare-delta-neutral'
}

/** cover@5 差值按百分点展示（0.05 → +5.0pp） */
function groupPointText(delta: number): string {
  if (delta === 0) return ''
  const points = (delta * 100).toFixed(1)
  return delta > 0 ? `+${points}pp` : `${points}pp`
}

function rowClassName(record: CompareRow): string {
  return record.change === 'flat' ? '' : 'compare-row-changed'
}

/** 类别 / 分类列统一渲染：「类别计数变化」与「逐项名次 / 入榜出榜」两处复用同一口径 */
const CategoryCell = (props: { label: string }) => h('span', { class: 'compare-category' }, props.label)

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

/** 组集分类桶列：hit@5 / 未进池 / cover@5（主判据） */
const groupCategoryColumns = [
  { key: 'name', title: '分类' },
  { key: 'hit5', title: 'hit@5', align: 'center', width: 140 },
  { key: 'miss', title: '未进池', align: 'center', width: 140 },
  { key: 'cover5', title: 'cover@5', align: 'center', width: 170 },
]

/** 组集逐项列：比较字段为 status @ firstRank（组集题无召回候选列表，不设操作列） */
const groupRowColumns = [
  { key: 'category', title: '分类', width: 90 },
  { key: 'question', title: '问题' },
  { key: 'bucketA', title: 'A 分档', width: 100, align: 'center' },
  { key: 'bucketB', title: 'B 分档', width: 100, align: 'center' },
  { key: 'rankA', title: 'A 首段名次', width: 110, align: 'center' },
  { key: 'rankB', title: 'B 首段名次', width: 110, align: 'center' },
  { key: 'change', title: '变化', width: 120, align: 'center' },
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
