<template>
  <a-modal v-model:open="open" title="原文" :footer="null" width="min(560px, 92vw)">
    <template v-if="item">
      <p class="source-question">{{ item.question }}</p>
      <div class="source-summary">
        <span>组内段 {{ segCount }} 段</span>
        <span>命中前 5：{{ hits5Text }} 段</span>
        <span>命中前 10：{{ hits10Text }} 段</span>
        <span>组内首段名次：{{ firstRankLabel }}</span>
      </div>
      <a-tabs v-model:activeKey="activeTab" size="small" class="source-tabs">
        <a-tab-pane key="pool">
          <template #tab>召回列表（{{ poolIds.length }}）</template>
          <p class="source-hint">{{ poolHint }}</p>
          <div class="pool-list">
            <div
              v-for="row in poolRows"
              :key="`${row.rank}:${row.id}`"
              class="pool-row"
              :class="{ 'pool-row-hit': row.isGroup }"
              @click="emit('open-chapter', row.id)"
            >
              <span class="pool-rank">{{ row.rank }}</span>
              <span class="pool-chapter">{{ chapterLabel(row.id) }}</span>
              <span class="pool-id">{{ shortChunkId(row.id) }}</span>
              <span class="pool-flag">
                <a-tag v-if="row.isGroup" color="green" class="pool-tag">组内段</a-tag>
              </span>
            </div>
            <div v-if="poolRows.length === 0" class="pool-empty">该题无召回结果</div>
          </div>
        </a-tab-pane>
        <a-tab-pane v-if="offPoolIds.length > 0" key="off">
          <template #tab>未进池组内段（{{ offPoolIds.length }}）</template>
          <p class="source-hint">{{ offPoolHint }}</p>
          <div class="pool-list">
            <div
              v-for="(id, index) in offPoolIds"
              :key="id"
              class="pool-row"
              @click="emit('open-chapter', id)"
            >
              <span class="pool-rank">{{ index + 1 }}</span>
              <span class="pool-chapter">{{ chapterLabel(id) }}</span>
              <span class="pool-id">{{ shortChunkId(id) }}</span>
              <span class="pool-flag">
                <a-tag color="green" class="pool-tag">组内段</a-tag>
              </span>
            </div>
          </div>
        </a-tab-pane>
      </a-tabs>
    </template>
  </a-modal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { BenchmarkResultItem } from '../api/client'
import { SANGO_CHAPTER_TITLES } from '../utils/sangoContents'
import { chapterFromChunkId, shortChunkId } from '../utils/sangoChapter'

// 组集「原文」弹框：按池序列出召回列表（名次 / 回目标题 / 片段号），组内段整行高亮并挂「组内段」标签，
// 一眼看出组内段在召回列表里的位置；未进池的组内段另放一个 tab，避免弹框过长。
// 数据取快照 poolIds（老快照缺该字段 → 降级只列 top10Ids）；点行打开回目阅读器，弹框保持打开。
// 名次 / 片段 / 标签三列定宽、标签列所有行都占位，保证跨行严格对齐。
const props = defineProps<{
  open: boolean
  item: BenchmarkResultItem | null
}>()
const emit = defineEmits<{ 'update:open': [value: boolean]; 'open-chapter': [chunkId: string] }>()

const open = computed({
  get: () => props.open,
  set: (value: boolean) => emit('update:open', value),
})

/** 弹框内 tab：召回列表 / 未进池组内段（换题时回到默认 tab） */
const activeTab = ref('pool')
watch(
  () => props.item?.id,
  () => {
    activeTab.value = 'pool'
  },
)

/** 回号 → 回目标题（固定文学数据，本地查表，不请求接口） */
const CHAPTER_TITLES = new Map(SANGO_CHAPTER_TITLES.map((c) => [c.chapter, c.title]))

/** 池序：优先完整 poolIds，老快照降级 top10Ids */
const poolIds = computed(() => props.item?.poolIds ?? props.item?.top10Ids ?? [])
const hasFullPool = computed(() => Array.isArray(props.item?.poolIds))
const groupIds = computed(() => props.item?.chunkIds ?? [])
const groupSet = computed(() => new Set(groupIds.value))

interface PoolRow {
  rank: number
  id: string
  isGroup: boolean
}

const poolRows = computed<PoolRow[]>(() =>
  poolIds.value.map((id, index) => ({ rank: index + 1, id, isGroup: groupSet.value.has(id) })),
)

/** 组内段中不在池序里的（未进池 / 老快照缺该段） */
const offPoolIds = computed(() => groupIds.value.filter((id) => !poolIds.value.includes(id)))

const segCount = computed(() => props.item?.segCount ?? groupIds.value.length)
const hits5Text = computed(() => countText(props.item?.hits5))
const hits10Text = computed(() => countText(props.item?.hits10))
const firstRankLabel = computed(() => {
  const rank = props.item?.firstRank
  if (typeof rank !== 'number' || !Number.isFinite(rank)) return '—'
  return rank === 0 ? '未进池' : String(rank)
})

const poolHint = computed(() =>
  hasFullPool.value
    ? '数字 = 池内名次，绿色 = 组内段'
    : `老快照无完整池序，仅列前 ${poolIds.value.length} 候选`,
)
const offPoolHint = computed(() => (hasFullPool.value ? '未进 50 路池；数字 = 组内段序号' : '不在候选列表（老快照仅存前 10）'))

function countText(value: number | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '—'
}

/** 章节标题：第N回 + 回目（回号无法解析时回退到「—」） */
function chapterLabel(chunkId: string): string {
  const chapter = chapterFromChunkId(chunkId)
  if (Number.isNaN(chapter)) return '—'
  const title = CHAPTER_TITLES.get(chapter)
  return title ? `第${chapter}回 ${title}` : `第${chapter}回`
}
</script>

<style scoped>
.source-question {
  margin: 0 0 8px;
  color: #163c32;
  font-size: 14px;
  font-weight: 600;
}

.source-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  color: #48584f;
  font-size: 12px;
}

.source-tabs :deep(.ant-tabs-nav) {
  margin: 12px 0 8px;
}

.source-hint {
  margin: 0 0 6px;
  color: #8b9990;
  font-size: 12px;
}

.pool-list {
  max-height: 46vh;
  overflow-y: auto;
  border: 1px solid #e3eae3;
  border-radius: 6px;
}

.pool-row {
  display: flex;
  align-items: center;
  padding: 4px 10px;
  font-size: 12px;
  line-height: 20px;
  cursor: pointer;
}

.pool-row + .pool-row {
  border-top: 1px solid #f0f4f0;
}

.pool-row:hover {
  background: #f0f5f2;
}

.pool-row-hit {
  background: #f0f7f2;
}

.pool-row-hit:hover {
  background: #e6f2ea;
}

/* 定宽列 + 回目列自适应：保证每行名次 / 片段 / 标签严格对齐 */
.pool-rank {
  flex: none;
  width: 28px;
  margin-right: 10px;
  text-align: right;
  color: #8b9990;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
}

.pool-chapter {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: #48584f;
}

.pool-id {
  flex: none;
  width: 70px;
  margin-left: 10px;
  white-space: nowrap;
  text-align: right;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
  color: #1d2924;
}


.pool-flag {
  flex: none;
  display: flex;
  justify-content: flex-end;
  width: 56px;
  margin-left: 10px;
}

.pool-tag {
  margin-inline-end: 0;
}

.pool-empty {
  padding: 10px;
  color: #8b9990;
  font-size: 12px;
}
</style>
