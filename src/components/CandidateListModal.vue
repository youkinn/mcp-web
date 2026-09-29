<template>
  <a-modal
    v-model:open="open"
    :title="`召回列表（${result?.candidates.length ?? 0} 个）`"
    :footer="null"
    width="min(720px, 90vw)"
  >
    <ul class="candidate-modal-list">
      <li
        v-for="c in result?.candidates ?? []"
        :key="c.id"
        class="candidate-modal-item"
        :class="{ 'candidate-modal-item-highlight': c.id === highlightId }"
        @click="emit('open-chapter', c)"
      >
        <span class="candidate-modal-id">{{ shortCandidateId(c.id) }}</span>
        <span class="candidate-modal-title">{{ c.title }}</span>
      </li>
    </ul>
  </a-modal>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { BenchmarkCandidate, BenchmarkResultItem } from '../api/client'

const props = defineProps<{
  open: boolean
  result: BenchmarkResultItem | null
  highlightId: string | null
}>()
const emit = defineEmits<{ 'update:open': [value: boolean]; 'open-chapter': [candidate: BenchmarkCandidate] }>()

const open = computed({
  get: () => props.open,
  set: (value: boolean) => emit('update:open', value),
})

function shortCandidateId(id: string): string {
  const i = id.indexOf(':')
  return i >= 0 ? id.slice(i + 1) : id
}
</script>

<style scoped>
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

.candidate-modal-item-highlight {
  background: #fff3cd;
}

.candidate-modal-id {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
  font-size: 12px;
  color: #1d2924;
  flex-shrink: 0;
}
</style>
