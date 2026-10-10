<template>
  <div class="source-links">
    <div class="source-group">
      <span class="source-label">组内段 {{ chunkIds.length }}</span>
      <a-button
        v-for="id in chunkIds"
        :key="id"
        type="link"
        size="small"
        class="source-id"
        :title="id"
        @click="emit('open-chapter', id)"
      >
        {{ shortChunkId(id) }}
      </a-button>
      <span v-if="chunkIds.length === 0" class="source-empty">—</span>
    </div>
    <div class="source-group">
      <span class="source-label">top10 候选 {{ top10Ids.length }}</span>
      <a-button
        v-for="id in top10Ids"
        :key="id"
        type="link"
        size="small"
        class="source-id"
        :title="id"
        @click="emit('open-chapter', id)"
      >
        {{ shortChunkId(id) }}
      </a-button>
      <span v-if="top10Ids.length === 0" class="source-empty">—</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { BenchmarkResultItem } from '../api/client'
import { shortChunkId } from '../utils/sangoChapter'

// 组判分题原文入口（feat-A018 story-03）：候选来源 = 组内段 chunkIds + 池内前 10 候选 top10Ids；
// 只透出 chunkId，回号解析沿用 A015 chapterFromChunkId 口径（不另造解析）。
const props = defineProps<{ item: BenchmarkResultItem }>()
const emit = defineEmits<{ 'open-chapter': [chunkId: string] }>()

const chunkIds = computed(() => props.item.chunkIds ?? [])
const top10Ids = computed(() => props.item.top10Ids ?? [])
</script>

<style scoped>
.source-links {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.source-group {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px;
}

.source-label {
  color: #8b9990;
  font-size: 12px;
  margin-right: 4px;
}

.source-id {
  height: auto;
  padding: 0 4px;
  font-size: 12px;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
}

.source-empty {
  color: #b6bfb8;
}
</style>
