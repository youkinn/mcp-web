<template>
  <a-modal
    :open="open"
    title="三国演义 · 原文阅读"
    width="960px"
    :footer="null"
    @update:open="onOpenChange"
  >
    <div ref="scrollRef" class="reader-scroll">
      <div class="reader-paper">
        <h1 class="reader-chapter-title">{{ displayTitle }}</h1>

        <div v-if="loading" class="reader-state">
          <a-spin size="small" />
          <span class="reader-state-text">原文加载中…</span>
        </div>

        <a-alert v-else-if="error" type="error" show-icon :message="error" />

        <div v-else class="chunk-list">
          <div
            v-for="chunk in data?.chunks ?? []"
            :key="chunk.chunkId"
            class="chunk-row"
            :class="{ 'is-target': chunk.chunkId === targetChunkId }"
            :data-chunk-id="chunk.chunkId"
          >
            <span class="chunk-no">{{ shortChunkId(chunk.chunkId) }}</span>
            <p class="chunk-text">{{ chunk.text }}</p>
          </div>
        </div>
      </div>
    </div>

    <div class="reader-nav">
      <a-button :disabled="!data?.prev" @click="goToPrev">
        上一回{{ data?.prev ? ` ${data.prev.title}` : '' }}
      </a-button>
      <div class="reader-jump">
        <span class="reader-jump-label">回号</span>
        <a-input-number
          v-model:value="jumpChapter"
          :controls="false"
          class="reader-jump-input"
          placeholder="1~120"
          @press-enter="onJump"
        />
        <a-button @click="onJump">跳转</a-button>
      </div>
      <a-button :disabled="!data?.next" @click="goToNext">
        下一回{{ data?.next ? ` ${data.next.title}` : '' }}
      </a-button>
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import { fetchSangoChapter, getErrorMessage, type SangoChapterData } from '../api/client'
import { isValidChapter, SANGO_CHAPTER_MAX, SANGO_CHAPTER_MIN, shortChunkId } from '../utils/sangoChapter'

// 入参契约严格按需求「组件入参契约」表：chapter 必填 / chapterTitle 选填占位 / chunkId 选填定位高亮。
// 打开方式与关闭回调自定为 v-model:open，无额外业务入参。
const props = defineProps<{
  open: boolean
  chapter: number
  chapterTitle?: string
  chunkId?: string
}>()

const emit = defineEmits<{
  (e: 'update:open', open: boolean): void
}>()

const currentChapter = ref(props.chapter)
const data = ref<SangoChapterData | null>(null)
const loading = ref(false)
const error = ref('')
// 定位目标：命中则 scrollIntoView + 高亮；未命中（不属于当前回）/ 未传 → 停正文顶部，不报错
const targetChunkId = ref<string | undefined>(props.chunkId)
// 仅用于接口返回前占位（避免标题闪烁）；翻回 / 跳转后无占位，等接口返回
const pendingTitle = ref<string | undefined>(props.chapterTitle)
const jumpChapter = ref<number | null>(props.chapter)
const scrollRef = ref<HTMLElement | null>(null)

const displayTitle = computed(() => {
  if (data.value) return `第 ${data.value.chapter} 回 ${data.value.title}`
  return pendingTitle.value ? `第 ${currentChapter.value} 回 ${pendingTitle.value}` : `第 ${currentChapter.value} 回`
})

watch(
  () => props.open,
  (open) => {
    if (!open) return
    // 每次打开以入参重置：翻回 / 跳转产生的内部状态不影响下一次打开
    currentChapter.value = props.chapter
    pendingTitle.value = props.chapterTitle
    targetChunkId.value = props.chunkId
    jumpChapter.value = props.chapter
    void load(props.chapter)
  },
  { immediate: true },
)

async function load(chapter: number) {
  loading.value = true
  error.value = ''
  try {
    const result = await fetchSangoChapter(chapter)
    if (currentChapter.value !== chapter) return // 已切回，丢弃过期结果
    data.value = result
    await scrollToTarget()
  } catch (err) {
    if (currentChapter.value !== chapter) return
    error.value = getErrorMessage(err)
  } finally {
    loading.value = false
  }
}

async function scrollToTarget() {
  await nextTick()
  const container = scrollRef.value
  if (!container) return
  const targetId = targetChunkId.value
  const target = targetId ? (data.value?.chunks.find((chunk) => chunk.chunkId === targetId) ?? null) : null
  if (target) {
    const el = container.querySelector(`[data-chunk-id="${target.chunkId}"]`)
    if (el) {
      el.scrollIntoView({ block: 'center' })
      return
    }
  }
  container.scrollTop = 0
}

function goTo(chapter: number) {
  if (chapter === currentChapter.value && data.value) return
  currentChapter.value = chapter
  pendingTitle.value = undefined
  jumpChapter.value = chapter
  data.value = null
  void load(chapter)
}

function goToPrev() {
  if (data.value?.prev) goTo(data.value.prev.chapter)
}

function goToNext() {
  if (data.value?.next) goTo(data.value.next.chapter)
}

function onJump() {
  const next = jumpChapter.value
  if (!isValidChapter(next)) {
    message.warning(`回号需为 ${SANGO_CHAPTER_MIN}~${SANGO_CHAPTER_MAX} 的整数`)
    return
  }
  goTo(next)
}

function onOpenChange(next: boolean) {
  emit('update:open', next)
}
</script>

<style scoped>
.reader-scroll {
  max-height: 70vh;
  overflow: auto;
  padding: 10px;
  border-radius: 12px;
  background: #e8ece6;
}

.reader-paper {
  width: 210mm;
  max-width: 100%;
  margin: 0 auto;
  padding: 16mm 18mm 24mm;
  background: #fffdf8;
  box-shadow: 0 10px 36px rgba(70, 60, 40, 0.28);
  color: #2b2418;
  font-family: Georgia, 'Times New Roman', 'Noto Serif SC', 'Songti SC', 'SimSun', serif;
}

.reader-chapter-title {
  margin: 0 0 20px;
  font-size: 22px;
  font-weight: 700;
  text-align: center;
  letter-spacing: 0.06em;
}

.chunk-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.chunk-row {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 8px 10px;
  border-radius: 8px;
  scroll-margin-block: 24px;
}

.chunk-row.is-target {
  background: #fff3cd;
  box-shadow: inset 0 0 0 2px #f0c36d;
}

.chunk-no {
  flex: 0 0 56px;
  padding-top: 2px;
  color: #a0885a;
  font-family: 'SFMono-Regular', Consolas, monospace;
  font-size: 12px;
  text-align: right;
}

.chunk-text {
  flex: 1;
  margin: 0;
  font-size: 16px;
  line-height: 1.9;
  text-align: justify;
}

.reader-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 48px 0;
}

.reader-state-text {
  color: #7b8a80;
  font-family: 'Noto Sans SC', 'Segoe UI', sans-serif;
  font-size: 13px;
}

.reader-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #e6e9e4;
}

.reader-jump {
  display: flex;
  align-items: center;
  gap: 8px;
}

.reader-jump-label {
  color: #7b8a80;
  font-size: 12px;
}

.reader-jump-input {
  width: 96px;
}
</style>
