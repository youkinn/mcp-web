<template>
  <a-modal
    :open="open"
    :width="fullscreen ? '100%' : 'min(1280px, 96vw)'"
    :wrap-class-name="fullscreen ? 'draftbench-modal-wrap draftbench-fullscreen' : 'draftbench-modal-wrap'"
    :footer="null"
    @update:open="onOpenChange"
  >
    <template #title>
      <div class="draftbench-title-row">
        <span class="draftbench-title-text">草稿台 · 注入实验台</span>
        <a-button class="draftbench-fullscreen-btn" size="small" type="text" @click="fullscreen = !fullscreen">
          <template #icon>
            <FullscreenOutlined v-if="!fullscreen" />
            <FullscreenExitOutlined v-else />
          </template>
          {{ fullscreen ? '退出全屏' : '全屏' }}
        </a-button>
      </div>
    </template>
    <div class="draftbench-body" :class="{ 'draftbench-body-fullscreen': fullscreen }">
      <!-- ① traceId 拉取（验收 5 步骤 1~2） -->
      <div class="trace-bar">
        <span class="trace-label">traceId</span>
        <a-input
          v-model:value="traceIdInput"
          class="trace-input"
          placeholder="粘贴线上日志 traceId（UUID）"
          allow-clear
          @press-enter="onFetchTrace"
        />
        <a-button type="primary" :loading="traceLoading" @click="onFetchTrace">拉取</a-button>
        <span v-if="trace" class="trace-meta">
          查询「{{ trace.userQuery }}」 · 路由 {{ routeSourceLabel(trace.routeSource) }} · {{ formatTime(trace.serverReceivedAt) }}
        </span>
      </div>
      <a-alert v-if="traceError" type="error" show-icon class="trace-error" :message="traceError" />

      <!-- ② 双栏工作区（左拖右添加 / 右内拖拽排序 / 右侧手增与移除） -->
      <div class="workspace">
        <div class="col col-left">
          <div class="col-head">
            <span class="col-title">召回候选源（只读）</span>
            <span v-if="trace" class="col-meta">
              {{ trace.chunks.candidates.length }} 条候选 · 注入 {{ trace.chunks.injectedCount }} · 引用 {{ trace.chunks.citedCount }}
            </span>
          </div>
          <div v-if="traceLoading" class="col-state"><a-spin size="small" /> 拉取中…</div>
          <a-empty v-else-if="!trace" description="输入 traceId 拉取后展示候选" />
          <a-empty v-else-if="trace.chunks.candidates.length === 0" description="该请求无召回候选（检索未命中），可在右侧手增片段后发送" />
          <template v-else>
            <div class="candidate-toolbar">
              <span class="candidate-toolbar-hint">已入清单 {{ addedCandidateCount }}/{{ trace.chunks.candidates.length }}</span>
              <span class="candidate-toolbar-actions">
                <a-button size="small" :disabled="chunkItems.length === 0" @click="clearList">清空发送清单</a-button>
                <a-button size="small" type="dashed" @click="addAllCandidates">一键全部移入发送清单</a-button>
              </span>
            </div>
            <div class="candidate-list">
            <div
              v-for="candidate in trace.chunks.candidates"
              :key="candidate.chunkId"
              class="candidate-item"
              :class="{ 'candidate-added': containsChunkId(candidate.chunkId) }"
              draggable="true"
              @dragstart="onCandidateDragStart($event, candidate)"
              @dragend="onDragEnd"
              @click="onCandidateCardClick(candidate)"
            >
              <div class="candidate-head">
                <span class="candidate-rank">#{{ candidate.rank }}</span>
                <span class="candidate-title" :title="candidate.title">{{ truncate(candidate.title, 34) }}</span>
                <a-tag v-if="candidate.injected" color="green" size="small">注入</a-tag>
                <a-tag v-else color="default" size="small">未注入</a-tag>
                <a-tag v-if="candidate.cited" color="gold" size="small">引用</a-tag>
              </div>
              <div class="candidate-meta">回 {{ candidate.chapter }} · 段 {{ candidate.segFrom }}~{{ candidate.segTo }} · 得分 {{ candidate.finalScore }}</div>
              <p class="candidate-preview" :title="candidate.preview">{{ candidate.preview }}</p>
              <div class="candidate-actions">
                <a-button
                  size="small"
                  type="primary"
                  ghost
                  :disabled="containsChunkId(candidate.chunkId)"
                  @click.stop="addCandidate(candidate)"
                >
                  添加到清单
                </a-button>
                <a-button size="small" type="link" @click.stop="openReaderForCandidate(candidate)">查看原文</a-button>
              </div>
            </div>
            </div>
          </template>
        </div>

        <div class="col col-right">
          <div class="col-head">
            <span class="col-title">发送清单</span>
            <span v-if="chunkItems.length" class="col-meta">{{ chunkItems.length }} 条 · {{ totalChars }} 字</span>
          </div>
          <div class="manual-add">
            <a-button type="dashed" class="manual-btn" @click="openManualAdd">手增片段</a-button>
            <span class="manual-tip">弹窗填写：正文 1~2000 字 + 可选 chunkId；也可「从原文选择」片段回填后编辑</span>
          </div>
          <div
            ref="chunkListRef"
            class="chunk-list"
            :class="{ 'chunk-list-dragover': dragState !== null }"
            @dragover.prevent="onListDragOver"
            @drop.prevent="onChunkListDrop"
          >
            <div
              v-for="(item, index) in chunkItems"
              :key="itemKey(item, index)"
              class="chunk-item"
              :class="{ 'drop-before': dragOverIndex === index }"
              draggable="true"
              @dragstart="onItemDragStart($event, index)"
              @dragend="onDragEnd"
            >
              <div class="chunk-item-head">
                <span class="chunk-item-no">{{ index + 1 }}</span>
                <span class="chunk-item-meta">{{ itemMeta(item) }}</span>
                <a-tag v-if="item.chunkId" size="small" class="chunk-item-chunkid" :title="item.chunkId">{{ shortChunkId(item.chunkId) }}</a-tag>
                <a-button size="small" type="text" danger class="chunk-item-remove" @click="removeItem(index)">移除</a-button>
              </div>
              <p class="chunk-item-text" :title="item.text">{{ truncate(item.text, 90) }}</p>
              <div v-if="item.chunkId && item.chapter != null" class="chunk-item-actions">
                <a-button size="small" type="link" @click="openReaderForItem(item)">查看原文</a-button>
              </div>
            </div>
            <a-empty v-if="chunkItems.length === 0" description="从左侧拖入候选，或手增片段" />
          </div>
        </div>
      </div>

      <!-- ③ 发送操作 -->

      <div class="action-bar">
        <div class="action-summary">
          <span v-if="chunkItems.length">清单 {{ chunkItems.length }} 条 · 共 {{ totalChars }} 字</span>
          <span v-else class="muted">清单为空，无法发送</span>
        </div>
        <div class="action-buttons">
          <a-button @click="clearList">清空</a-button>
          <a-button type="primary" :disabled="!canSend" @click="openConfirm">发送</a-button>
        </div>
      </div>

      <!-- ⑤ 发送记录（弹框内列表） -->
      <div class="records-panel">
        <div class="records-head">
          <span class="records-title">发送记录（草稿台）</span>
          <span class="records-hint">点击行载入继续编辑</span>
          <a-button size="small" @click="reloadRecords">刷新</a-button>
        </div>
        <a-table
          :columns="recordColumns"
          :data-source="records"
          :loading="recordsLoading"
          :pagination="recordPagination"
          :row-key="(row: DraftbenchRecord) => row.traceId"
          size="small"
          class="records-table"
          :row-class-name="rowClassOf"
          :custom-row="rowPropsOf"
          :scroll="recordsTableScroll"
          @change="onRecordTableChange"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'time'">{{ formatTime(record.time) }}</template>
            <template v-else-if="column.key === 'traceId'">
              <a-tooltip placement="topLeft">
                <template #title>{{ record.traceId }}</template>
                <span class="cell-ellipsis">{{ record.traceId }}</span>
              </a-tooltip>
            </template>
            <template v-else-if="column.key === 'query'">
              <a-tooltip placement="topLeft">
                <template #title>{{ record.query }}</template>
                <span class="cell-ellipsis">{{ record.query }}</span>
              </a-tooltip>
            </template>
            <template v-else-if="column.key === 'params'">{{ paramsText(record.params) }}</template>
            <template v-else-if="column.key === 'chunkCount'">{{ record.chunkCount }}</template>
            <template v-else-if="column.key === 'result'">
              <a-tag v-if="record.status === 'failed'" color="error" size="small">失败</a-tag>
              <a-tag v-else color="success" size="small">成功</a-tag>
              <span v-if="record.result" class="record-citations">引用 {{ record.result.citationCount }}</span>
              <a-tooltip v-if="record.status === 'failed' && record.errorMessage" placement="topLeft">
                <template #title>{{ record.errorMessage }}</template>
                <span class="record-error">{{ truncate(record.errorMessage, 30) }}</span>
              </a-tooltip>
            </template>
            <template v-else-if="column.key === 'operation'">
              <a-popconfirm
                title="物理删除，不可恢复"
                ok-text="删除"
                cancel-text="取消"
                :ok-button-props="{ loading: deletingTraceId === record.traceId }"
                @confirm="onDeleteRecord(record)"
              >
                <a-button size="small" type="text" danger @click.stop>删除</a-button>
              </a-popconfirm>
            </template>
          </template>
        </a-table>
      </div>
    </div>
  </a-modal>

  <!-- 发送确认弹框（构造 → 发送的最后一步：query / 片段数 / 总字数 / 本次参数一次过目） -->
  <a-modal
    v-model:open="confirmOpen"
    title="确认发送（草稿台）"
    width="640px"
    wrap-class-name="draftbench-confirm-wrap"
    :footer="null"
  >
    <div class="confirm-body">
      <div class="confirm-field">
        <span class="confirm-label">query</span>
        <a-textarea
          v-model:value="draftQuery"
          class="confirm-query"
          :rows="2"
          placeholder="输入要发送的查询（1~300 字）"
          :maxlength="300"
          show-count
        />
      </div>
      <div class="confirm-meta">片段 {{ chunkItems.length }} 条 · 总字数 {{ totalChars }} 字</div>
      <div class="params-grid">
        <div class="param-item">
          <a-tooltip title="生成温度（0~1）">
            <span class="param-label">temperature</span>
          </a-tooltip>
          <a-input-number v-model:value="draftParams.temperature" class="param-input" :min="0" :max="1" :step="0.1" :precision="2" />
        </div>
        <div class="param-item">
          <a-tooltip title="注入条数上限">
            <span class="param-label">topK</span>
          </a-tooltip>
          <a-input-number v-model:value="draftParams.topK" class="param-input" :min="1" :max="20" :precision="0" />
        </div>
        <div class="param-item">
          <a-tooltip title="注入保底数">
            <span class="param-label">guarantee</span>
          </a-tooltip>
          <a-input-number v-model:value="draftParams.guarantee" class="param-input" :min="0" :max="draftParams.topK" :precision="0" />
        </div>
        <div class="param-item">
          <a-tooltip title="注入总预算">
            <span class="param-label">budget</span>
          </a-tooltip>
          <a-input-number v-model:value="draftParams.budget" class="param-input" :min="1" :max="20000" :precision="0" />
        </div>
      </div>
      <div class="param-note">
        默认值 = 拉取带出的线上实际参数；tailFallback 只读（{{ trace ? (trace.params.tailFallback ? '开' : '关') : '—' }}，随服务端配置，不可覆盖）
      </div>
      <div class="confirm-actions">
        <a-button @click="confirmOpen = false">取消</a-button>
        <a-button type="primary" :loading="sending" @click="onConfirmSend">发送</a-button>
      </div>
    </div>
  </a-modal>

  <!-- 手增片段弹框（第四轮：主区域输入收敛进弹窗，一次填完确认加入；从原文选择片段回填后可再编辑） -->
  <a-modal
    v-model:open="manualOpen"
    title="手增片段"
    width="560px"
    wrap-class-name="draftbench-manual-wrap"
    :footer="null"
    :keyboard="false"
  >
    <div class="manual-body">
      <div class="manual-field">
        <div class="manual-label-row">
          <span class="manual-label">正文</span>
          <span class="manual-hint">必填，1~2000 字</span>
        </div>
        <a-textarea
          v-model:value="manualText"
          :rows="6"
          placeholder="输入要注入的片段原文（1~2000 字）"
          show-count
        />
      </div>
      <div class="manual-field">
        <div class="manual-label-row">
          <span class="manual-label">chunkId</span>
          <span class="manual-hint">选填：填写后参与去重，清单条目展示片段标签</span>
        </div>
        <a-input
          v-model:value="manualChunkId"
          placeholder="如 sanguo-yanyi:0085:c0011"
          allow-clear
        />
      </div>
      <div class="manual-actions">
        <a-button @click="openPicker">从原文选择</a-button>
        <span class="manual-actions-gap" />
        <a-button @click="manualOpen = false">取消</a-button>
        <a-button type="primary" @click="confirmManualAdd">确认加入</a-button>
      </div>
    </div>
  </a-modal>

  <!-- 原文选段选择器（召回候选 / 按章节浏览 / 章节目录三态，点击片段回填手增表单） -->
  <a-modal
    v-model:open="pickerOpen"
    title="从原文选择片段"
    width="860px"
    wrap-class-name="draftbench-picker-wrap"
    :footer="null"
    :keyboard="false"
  >
    <div class="picker-body">
      <a-radio-group :value="pickerTab" size="small" @change="onPickerTabChange">
        <a-radio-button value="candidates">召回候选</a-radio-button>
        <a-radio-button value="toc">章节目录</a-radio-button>
        <a-radio-button value="chapters">按章节浏览</a-radio-button>
      </a-radio-group>

      <!-- 候选态：搜索 + 展开看完整原文与选段 -->
      <div v-if="pickerTab === 'candidates'" class="picker-pane">
        <a-input
          v-model:value="pickerSearch"
          class="picker-search"
          placeholder="搜索回目 / 标题 / chunkId"
          allow-clear
        >
          <template #prefix>
            <SearchOutlined />
          </template>
        </a-input>
        <div class="picker-candidate-list">
          <a-empty
            v-if="filteredPickerCandidates.length === 0"
            description="无匹配候选；可切到「按章节浏览」选任意片段"
          />
          <div
            v-for="candidate in filteredPickerCandidates"
            :key="candidate.chunkId"
            class="picker-candidate"
            :class="{ expanded: expandedCandidateId === candidate.chunkId }"
            @click="toggleCandidateExpand(candidate)"
          >
            <div class="picker-candidate-head">
              <span class="picker-candidate-rank">#{{ candidate.rank }}</span>
              <span class="picker-candidate-title" :title="candidate.title">{{ truncate(candidate.title, 30) }}</span>
              <span class="picker-candidate-meta">{{ shortChunkId(candidate.chunkId) }} · 回 {{ candidate.chapter }} · 段 {{ candidate.segFrom }}~{{ candidate.segTo }}</span>
            </div>
            <p class="picker-candidate-preview">{{ candidate.preview }}</p>
            <div v-if="expandedCandidateId === candidate.chunkId" class="picker-candidate-detail">
              <div class="picker-passage-bar">
                <span class="picker-passage-label">选段</span>
                <p class="picker-passage-text">{{ candidate.preview }}</p>
                <a-button size="small" type="primary" @click.stop="fillBackFromCandidate(candidate)">选此段回填</a-button>
              </div>
              <div v-if="candidateExpandedLoading" class="picker-detail-state">
                <a-spin size="small" />
                <span>原文加载中…</span>
              </div>
              <a-alert v-else-if="candidateExpandedError" type="error" show-icon :message="candidateExpandedError" />
              <div v-else-if="candidateExpandedData" class="picker-chunk-list">
                <div class="picker-chunk-title">
                  第 {{ candidateExpandedData.chapter }} 回 {{ candidateExpandedData.title }} · 完整原文
                </div>
                <div
                  v-for="chunk in candidateExpandedData.chunks"
                  :key="chunk.chunkId"
                  class="picker-chunk-row"
                  :class="{ 'is-target': chunk.chunkId === candidate.chunkId }"
                >
                  <span class="picker-chunk-no">{{ shortChunkId(chunk.chunkId) }}</span>
                  <p class="picker-chunk-text">{{ chunk.text }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 章节态：翻回 + 任意片段点击回填 -->
      <div v-else-if="pickerTab === 'chapters'" class="picker-pane">
        <div class="picker-chapter-toolbar">
          <a-button size="small" :disabled="!pickerChapterData?.prev" @click="goPickerPrev">上一回</a-button>
          <div class="picker-jump">
            <span class="picker-jump-label">回号</span>
            <a-input-number
              v-model:value="pickerJump"
              :controls="false"
              class="picker-jump-input"
              placeholder="1~120"
              @press-enter="onPickerJump"
            />
            <a-button size="small" @click="onPickerJump">跳转</a-button>
          </div>
          <a-button size="small" :disabled="!pickerChapterData?.next" @click="goPickerNext">下一回</a-button>
        </div>
        <div v-if="pickerChapterLoading" class="picker-state">
          <a-spin size="small" />
          <span>原文加载中…</span>
        </div>
        <a-alert v-else-if="pickerChapterError" type="error" show-icon :message="pickerChapterError" />
        <div v-else-if="pickerChapterData" class="picker-chapter-body">
          <div class="picker-chapter-title">第 {{ pickerChapterData.chapter }} 回 {{ pickerChapterData.title }}</div>
          <div class="picker-snippet-list">
            <div
              v-for="chunk in pickerChapterData.chunks"
              :key="chunk.chunkId"
              class="picker-snippet"
              :class="{ 'is-in-list': containsChunkId(chunk.chunkId) }"
              @click="fillBackFromChapterChunk(chunk)"
            >
              <span class="picker-snippet-no">{{ shortChunkId(chunk.chunkId) }}</span>
              <span class="picker-snippet-seg">段 {{ chunk.segFrom }}~{{ chunk.segTo }}</span>
              <p class="picker-snippet-text">{{ chunk.text }}</p>
            </div>
          </div>
          <div class="picker-select-hint">点击任意片段回填手增表单的 chunkId + 正文，可再编辑后确认加入</div>
        </div>
      </div>

      <!-- 目录态：搜索回号 / 回目，点击某回跳转后切回「按章节浏览」展示正文 -->
      <div v-else class="picker-pane">
        <div class="picker-toc">
          <a-input
            v-model:value="pickerTocSearch"
            class="picker-toc-search"
            placeholder="搜索回号 / 回目"
            allow-clear
          >
            <template #prefix>
              <SearchOutlined />
            </template>
          </a-input>
          <div class="picker-toc-list">
            <div
              v-for="row in filteredPickerToc"
              :key="row.chapter"
              class="picker-toc-row"
              :class="{ 'is-current': row.chapter === pickerChapter }"
              @click="pickFromToc(row)"
            >
              <span class="picker-toc-no">第 {{ row.chapter }} 回</span>
              <span class="picker-toc-title">{{ row.title }}</span>
              <span v-if="row.chapter === pickerChapter" class="picker-toc-current">当前</span>
            </div>
            <a-empty v-if="filteredPickerToc.length === 0" description="无匹配回目" />
          </div>
        </div>
      </div>
    </div>
  </a-modal>

  <SangoChapterReader
    v-if="readerTarget"
    v-model:open="readerOpen"
    :chapter="readerTarget.chapter"
    :chapter-title="readerTarget.chapterTitle"
    :chunk-id="readerTarget.chunkId"
  />
</template><script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import {
  deleteDraftbenchRecord,
  fetchDraftbenchRecordDetail,
  fetchDraftbenchRecords,
  fetchDraftbenchTrace,
  fetchSangoChapter,
  getErrorMessage,
  sendDraftbenchChat,
  type DraftbenchCandidate,
  type DraftbenchRecord,
  type DraftbenchSendParams,
  type SangoChapterChunk,
  type SangoChapterData,
} from '../api/client'
import SangoChapterReader from './SangoChapterReader.vue'
import { FullscreenExitOutlined, FullscreenOutlined, SearchOutlined } from '@ant-design/icons-vue'
import { isValidChapter, SANGO_CHAPTER_MAX, SANGO_CHAPTER_MIN, shortChunkId } from '../utils/sangoChapter'
import { SANGO_CHAPTER_TITLES, type SangoChapterTitle } from '../utils/sangoContents'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  (e: 'update:open', open: boolean): void
}>()

// ── 弹框全屏（提测反馈：关闭 X 左侧全屏按钮；打开默认全屏，每次打开置 true，可随时退出）──
const fullscreen = ref(false)

// ── 常量（§3.2 / §4.1 / §4.2 客户端先行拦截口径，与服务端文案一致）──

const MAX_CHUNKS = 20
const MAX_CHUNK_TEXT = 2000
const MAX_QUERY = 300
const DEFAULT_PARAMS: DraftbenchSendParams = { temperature: 0.7, topK: 10, guarantee: 5, budget: 2000 }

const TRUNCATION_MARK = '…（已截断）'

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function formatTime(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}${TRUNCATION_MARK}`
}

const ROUTE_SOURCE_LABELS: Record<string, string> = {
  label: '标签',
  keyword: '关键词',
  vector: '向量',
  classify: '分类',
  free: '自由',
}

function routeSourceLabel(source: string | null | undefined): string {
  return source && ROUTE_SOURCE_LABELS[source] ? ROUTE_SOURCE_LABELS[source] : source ?? '—'
}

// ── ① trace 拉取 ──

const traceIdInput = ref('')
const traceLoading = ref(false)
const traceError = ref('')
const trace = ref<Awaited<ReturnType<typeof fetchDraftbenchTrace>> | null>(null)

async function onFetchTrace() {
  const traceId = traceIdInput.value.trim()
  if (!traceId) {
    message.warning('请输入 traceId')
    return
  }
  traceLoading.value = true
  traceError.value = ''
  try {
    const data = await fetchDraftbenchTrace(traceId)
    trace.value = data
    draftQuery.value = data.userQuery
    draftParams.temperature = data.params.temperature
    draftParams.topK = data.params.topK
    draftParams.guarantee = data.params.guarantee
    draftParams.budget = data.params.budget
    chunkItems.value = []
  } catch (err) {
    traceError.value = getErrorMessage(err)
  } finally {
    traceLoading.value = false
  }
}

// ── ② 发送清单构造 ──

interface ListItem {
  chunkId?: string
  text: string
  chapter?: number
  title?: string
}

const chunkItems = ref<ListItem[]>([])
const manualText = ref('')
const manualChunkId = ref('')
const manualOpen = ref(false)
const manualSource = ref<{ chunkId: string; chapter: number; title: string } | null>(null)
const chunkListRef = ref<HTMLElement | null>(null)

const totalChars = computed(() => chunkItems.value.reduce((sum, item) => sum + item.text.length, 0))

function containsChunkId(chunkId: string): boolean {
  return chunkItems.value.some((item) => item.chunkId === chunkId)
}

const addedCandidateCount = computed(() =>
  (trace.value?.chunks.candidates ?? []).filter((candidate) => containsChunkId(candidate.chunkId)).length,
)

function itemKey(item: ListItem, index: number): string {
  return item.chunkId ?? `manual-${index}`
}

function itemMeta(item: ListItem): string {
  const parts: string[] = []
  if (item.chapter != null) parts.push(`回 ${item.chapter}`)
  if (item.title) parts.push(item.title)
  return parts.length ? parts.join(' · ') : '手增片段'
}

function addCandidate(candidate: DraftbenchCandidate) {
  if (containsChunkId(candidate.chunkId)) {
    message.info('该候选已在发送清单中')
    return
  }
  if (chunkItems.value.length >= MAX_CHUNKS) {
    message.warning('发送清单最多 20 条')
    return
  }
  chunkItems.value.unshift({
    chunkId: candidate.chunkId,
    text: candidate.preview,
    chapter: candidate.chapter,
    title: candidate.title,
  })
}

function addAllCandidates() {
  const candidates = trace.value?.chunks.candidates ?? []
  if (candidates.length === 0) return
  if (chunkItems.value.length >= MAX_CHUNKS) {
    message.warning('发送清单已满（最多 20 条）')
    return
  }
  let added = 0
  let already = 0
  for (const candidate of candidates) {
    if (chunkItems.value.length >= MAX_CHUNKS) break
    if (containsChunkId(candidate.chunkId)) {
      already += 1
      continue
    }
    chunkItems.value.push({
      chunkId: candidate.chunkId,
      text: candidate.preview,
      chapter: candidate.chapter,
      title: candidate.title,
    })
    added += 1
  }
  if (added === 0) {
    message.info('候选均已加入发送清单')
  } else if (chunkItems.value.length >= MAX_CHUNKS) {
    message.warning(`已移入 ${added} 条；发送清单已满（最多 20 条），其余候选未加入`)
  } else if (already > 0) {
    message.success(`已移入 ${added} 条（另有 ${already} 条已在清单中）`)
  } else {
    message.success(`已全部移入发送清单（${added} 条）`)
  }
}

function removeItem(index: number) {
  chunkItems.value.splice(index, 1)
}

function clearList() {
  chunkItems.value = []
}

function openManualAdd() {
  manualText.value = ''
  manualChunkId.value = ''
  manualSource.value = null
  manualOpen.value = true
}

function confirmManualAdd() {
  const text = manualText.value.trim()
  if (!text) {
    message.warning('片段文本不能为空')
    return
  }
  if (text.length > MAX_CHUNK_TEXT) {
    message.error('单条片段不能超过 2000 字')
    return
  }
  const chunkId = manualChunkId.value.trim() || undefined
  if (chunkId && containsChunkId(chunkId)) {
    message.warning('该 chunkId 已在发送清单中')
    return
  }
  if (chunkItems.value.length >= MAX_CHUNKS) {
    message.warning('发送清单最多 20 条')
    return
  }
  const item: ListItem = { chunkId, text }
  // 原文选择器回填的片段：chunkId 未被改动才带上章节信息，清单条目可跳原文（手增表单仍只填正文 + chunkId）
  if (chunkId && manualSource.value && manualSource.value.chunkId === chunkId) {
    item.chapter = manualSource.value.chapter
    item.title = manualSource.value.title
  }
  // 负责人 9.3 口径：新增到清单默认放最前面（候选单加 / 手增弹窗 / 原文选段回填均 unshift）；一键全部移入保持候选顺序 push
  chunkItems.value.unshift(item)
  manualText.value = ''
  manualChunkId.value = ''
  manualSource.value = null
  manualOpen.value = false
}

// ── 拖拽：左拖右添加 / 右内排序 ──

const dragState = ref<{ kind: 'candidate'; candidate: DraftbenchCandidate } | { kind: 'item'; index: number } | null>(null)
const dragOverIndex = ref<number | null>(null)
// 整条可点看原文（拖拽后松开会在同元素触发 click）：拖拽开始记时，400ms 内的 click 视为拖拽残留，跳过
let lastCandidateDragAt = 0

function onCandidateDragStart(e: DragEvent, candidate: DraftbenchCandidate) {
  lastCandidateDragAt = Date.now()
  dragState.value = { kind: 'candidate', candidate }
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'copy'
    e.dataTransfer.setData('text/plain', candidate.chunkId)
  }
  dragOverIndex.value = null
}

// 整条点击打开原文阅读器（辅助找原文）；内部按钮各自 @click.stop 避免冒泡
function onCandidateCardClick(candidate: DraftbenchCandidate) {
  if (Date.now() - lastCandidateDragAt < 400) return
  openReaderForCandidate(candidate)
}

function onItemDragStart(e: DragEvent, index: number) {
  dragState.value = { kind: 'item', index }
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
  }
  dragOverIndex.value = null
}

function onDragEnd() {
  dragState.value = null
  dragOverIndex.value = null
}

function dropIndexFromEvent(e: DragEvent): number {
  const el = chunkListRef.value
  if (!el || chunkItems.value.length === 0) return 0
  const items = Array.from(el.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement && child.classList.contains('chunk-item'),
  )
  for (let i = 0; i < items.length; i++) {
    const rect = items[i].getBoundingClientRect()
    if (e.clientY < rect.top + rect.height / 2) return i
  }
  return items.length
}

function onListDragOver(e: DragEvent) {
  dragOverIndex.value = dropIndexFromEvent(e)
}

function onChunkListDrop(e: DragEvent) {
  dragOverIndex.value = null
  const state = dragState.value
  dragState.value = null
  if (!state) return
  const target = dropIndexFromEvent(e)
  if (state.kind === 'candidate') {
    const candidate = state.candidate
    if (containsChunkId(candidate.chunkId)) {
      message.info('该候选已在发送清单中')
      return
    }
    if (chunkItems.value.length >= MAX_CHUNKS) {
      message.warning('发送清单最多 20 条')
      return
    }
    chunkItems.value.splice(target, 0, {
      chunkId: candidate.chunkId,
      text: candidate.preview,
      chapter: candidate.chapter,
      title: candidate.title,
    })
  } else {
    const from = state.index
    if (from === target) return
    let insertAt = target
    if (from < insertAt) insertAt -= 1
    const items = chunkItems.value.slice()
    const [moved] = items.splice(from, 1)
    items.splice(insertAt, 0, moved)
    chunkItems.value = items
  }
}// ── ③ 发送确认与发送 ──

const confirmOpen = ref(false)
const sending = ref(false)
const draftQuery = ref('')
const draftParams = reactive<DraftbenchSendParams>({ ...DEFAULT_PARAMS })

const canSend = computed(() => chunkItems.value.length > 0 && !sending.value)

function openConfirm() {
  if (chunkItems.value.length === 0) {
    message.warning('发送清单不能为空')
    return
  }
  confirmOpen.value = true
}

function onConfirmSend() {
  const query = draftQuery.value.trim()
  if (!query) {
    message.error('查询内容不能为空')
    return
  }
  if (query.length > MAX_QUERY) {
    message.error('查询内容不能超过 300 字')
    return
  }
  if (chunkItems.value.length === 0) {
    message.error('发送清单不能为空')
    return
  }
  if (chunkItems.value.length > MAX_CHUNKS) {
    message.error('发送清单最多 20 条')
    return
  }
  for (const item of chunkItems.value) {
    const text = item.text.trim()
    if (!text) {
      message.error('片段文本不能为空')
      return
    }
    if (text.length > MAX_CHUNK_TEXT) {
      message.error('单条片段不能超过 2000 字')
      return
    }
  }
  const p = draftParams
  if (typeof p.temperature !== 'number' || p.temperature < 0 || p.temperature > 1) {
    message.error('temperature 需为 0~1 的数字')
    return
  }
  if (!Number.isInteger(p.topK) || p.topK < 1 || p.topK > MAX_CHUNKS) {
    message.error('topK 需为 1~20 的整数')
    return
  }
  if (!Number.isInteger(p.guarantee) || p.guarantee < 0 || p.guarantee > p.topK) {
    message.error('guarantee 需为 0~topK 的整数')
    return
  }
  if (!Number.isInteger(p.budget) || p.budget < 1 || p.budget > 20000) {
    message.error('budget 需为 1~20000 的整数')
    return
  }
  void doSend(query)
}

async function doSend(query: string) {
  sending.value = true
  confirmOpen.value = false
  try {
    await sendDraftbenchChat({
      query,
      chunks: chunkItems.value.map((item) => ({
        chunkId: item.chunkId ?? undefined,
        text: item.text.trim(),
        chapter: item.chapter ?? undefined,
        title: item.title ?? undefined,
      })),
      params: { ...draftParams },
    })
    // 需求变更（负责人 2026-09-27）：发送后不展示结果区，统一走日志页「来源=草稿台」查看
    message.success('已发送，可在日志页「来源=草稿台」查看')
  } catch (err) {
    message.error(getErrorMessage(err))
  } finally {
    sending.value = false
    void reloadRecords()
  }
}

// ── ⑤ 发送记录 ──

const records = ref<DraftbenchRecord[]>([])
const recordsLoading = ref(false)
const recordPageNo = ref(1)
const recordPageSize = ref(10)
const recordTotal = ref(0)

// 全屏下发送记录压缩为独立滚动区（antd sticky 表头）；普通形态保持弹框整体滚动
const recordsTableScroll = computed(() =>
  fullscreen.value ? { y: Math.max(90, Math.round(window.innerHeight * 0.24) - 100) } : undefined,
)

function paramsText(p: DraftbenchSendParams): string {
  return `T ${p.temperature} · K ${p.topK} · G ${p.guarantee} · B ${p.budget}`
}

const recordColumns = [
  { key: 'time', title: '时间', width: 150 },
  { key: 'traceId', title: 'traceId', width: 220, ellipsis: true },
  { key: 'query', title: 'query', width: 220, ellipsis: true },
  { key: 'params', title: '本次参数', width: 170 },
  { key: 'chunkCount', title: '片段数', width: 70, align: 'center' },
  { key: 'result', title: '结果', width: 190 },
  { key: 'operation', title: '操作', width: 80, align: 'center' },
]

const recordPagination = computed(() => ({
  current: recordPageNo.value,
  pageSize: recordPageSize.value,
  total: recordTotal.value,
  showSizeChanger: true,
  showTotal: (t: number) => `共 ${t} 条`,
  buildOptionText: (opt: { value: string | number }) => `${opt.value}条/页`,
}))

function rowClassOf(): string {
  return 'record-row'
}

// antd-vue v4 表格无 row-click 事件，行点击走 customRow 注入（点击行载入记录继续编辑，§5）
function rowPropsOf(record: DraftbenchRecord): Record<string, unknown> {
  return {
    onClick: () => void onRecordRowClick(record),
  }
}

async function reloadRecords() {
  recordsLoading.value = true
  try {
    const data = await fetchDraftbenchRecords({ pageNo: recordPageNo.value, pageSize: recordPageSize.value })
    records.value = data.list
    recordTotal.value = data.total
  } catch (err) {
    message.error(getErrorMessage(err))
  } finally {
    recordsLoading.value = false
  }
}

function onRecordTableChange(pagination: { current?: number; pageSize?: number }) {
  recordPageNo.value = pagination.current ?? 1
  recordPageSize.value = pagination.pageSize ?? 10
  void reloadRecords()
}

async function onRecordRowClick(record: DraftbenchRecord) {
  try {
    const detail = await fetchDraftbenchRecordDetail(record.traceId)
    traceIdInput.value = detail.traceId
    draftQuery.value = detail.query
    chunkItems.value = detail.chunks.map((item) => ({
      chunkId: item.chunkId ?? undefined,
      text: item.text,
      chapter: item.chapter ?? undefined,
      title: item.title ?? undefined,
    }))
    draftParams.temperature = detail.params.temperature
    draftParams.topK = detail.params.topK
    draftParams.guarantee = detail.params.guarantee
    draftParams.budget = detail.params.budget
    // 需求变更（负责人 2026-09-27）：记录载入仅回填编辑框继续编辑，结果查看统一走日志页
    message.success('已载入草稿台记录，可继续编辑')
  } catch (err) {
    message.error(getErrorMessage(err))
  }
}

const deletingTraceId = ref<string | null>(null)

async function onDeleteRecord(record: DraftbenchRecord) {
  if (deletingTraceId.value) return
  deletingTraceId.value = record.traceId
  try {
    await deleteDraftbenchRecord(record.traceId)
    message.success('记录已删除')
    // 当前页删空且非第一页时回退一页，避免停留在空页
    if (records.value.length === 1 && recordPageNo.value > 1) {
      recordPageNo.value -= 1
    }
    await reloadRecords()
  } catch (err) {
    message.error(getErrorMessage(err))
  } finally {
    deletingTraceId.value = null
  }
}

// ── 原文阅读器（feat-A010 复用）──

interface ReaderTarget {
  chapter: number
  chapterTitle?: string
  chunkId?: string
}

const readerOpen = ref(false)
const readerTarget = ref<ReaderTarget | null>(null)

function openReaderForCandidate(candidate: DraftbenchCandidate) {
  readerTarget.value = { chapter: candidate.chapter, chapterTitle: candidate.title, chunkId: candidate.chunkId }
  readerOpen.value = true
}

function openReaderForItem(item: ListItem) {
  if (item.chapter == null) return
  readerTarget.value = { chapter: item.chapter, chapterTitle: item.title, chunkId: item.chunkId }
  readerOpen.value = true
}

// ── 原文选段选择器（第四轮：手增表单「从原文选择」入口）──

const pickerOpen = ref(false)
const pickerTab = ref<'candidates' | 'chapters' | 'toc'>('candidates')
const pickerSearch = ref('')

// 候选态：展开条目看完整原文 + 选段
const expandedCandidateId = ref<string | null>(null)
const candidateExpandedData = ref<SangoChapterData | null>(null)
const candidateExpandedLoading = ref(false)
const candidateExpandedError = ref('')

// 章节态：任意章节片段列表（复用 A010 fetchSangoChapter，缓存模块级共享）
const pickerChapter = ref(SANGO_CHAPTER_MIN)
const pickerChapterData = ref<SangoChapterData | null>(null)
const pickerChapterLoading = ref(false)
const pickerChapterError = ref('')
const pickerJump = ref<number | null>(SANGO_CHAPTER_MIN)
const pickerTocSearch = ref('')

// 初始展示该请求召回候选；首次进章节态默认落在首个候选所在回（无候选则第 1 回）
function openPicker() {
  pickerTab.value = 'candidates'
  pickerSearch.value = ''
  pickerTocSearch.value = ''
  expandedCandidateId.value = null
  candidateExpandedData.value = null
  candidateExpandedError.value = ''
  const startChapter = (trace.value?.chunks.candidates ?? [])[0]?.chapter ?? SANGO_CHAPTER_MIN
  pickerOpen.value = true
  goPickerTo(startChapter)
}

function onPickerTabChange(e: { target: { value: unknown } }) {
  const raw = e.target.value
  const nextTab = raw === 'chapters' ? 'chapters' : raw === 'toc' ? 'toc' : 'candidates'
  pickerTab.value = nextTab
  if (nextTab === 'candidates') {
    pickerTocSearch.value = ''
  }
  if (pickerTab.value === 'chapters' && !pickerChapterData.value && !pickerChapterLoading.value) {
    void loadPickerChapter(pickerChapter.value)
  }
}

const filteredPickerCandidates = computed(() => {
  const q = pickerSearch.value.trim().toLowerCase()
  const candidates = trace.value?.chunks.candidates ?? []
  if (!q) return candidates
  return candidates.filter(
    (c) =>
      c.title.toLowerCase().includes(q) ||
      String(c.chapter).includes(q) ||
      c.chunkId.toLowerCase().includes(q) ||
      shortChunkId(c.chunkId).toLowerCase().includes(q),
  )
})

async function toggleCandidateExpand(candidate: DraftbenchCandidate) {
  if (expandedCandidateId.value === candidate.chunkId) {
    expandedCandidateId.value = null
    candidateExpandedData.value = null
    candidateExpandedError.value = ''
    return
  }
  expandedCandidateId.value = candidate.chunkId
  candidateExpandedLoading.value = true
  candidateExpandedError.value = ''
  try {
    const result = await fetchSangoChapter(candidate.chapter)
    if (expandedCandidateId.value !== candidate.chunkId) return // 已切到别的候选，丢弃过期结果
    candidateExpandedData.value = result
  } catch (err) {
    if (expandedCandidateId.value !== candidate.chunkId) return
    candidateExpandedError.value = getErrorMessage(err)
  } finally {
    if (expandedCandidateId.value === candidate.chunkId) candidateExpandedLoading.value = false
  }
}

async function loadPickerChapter(chapter: number) {
  pickerChapterLoading.value = true
  try {
    const result = await fetchSangoChapter(chapter)
    if (pickerChapter.value !== chapter) return // 已切回，丢弃过期结果
    pickerChapterData.value = result
  } catch (err) {
    if (pickerChapter.value !== chapter) return
    pickerChapterError.value = getErrorMessage(err)
  } finally {
    if (pickerChapter.value === chapter) pickerChapterLoading.value = false
  }
}

function goPickerTo(chapter: number) {
  if (chapter === pickerChapter.value && pickerChapterData.value) return
  pickerChapter.value = chapter
  pickerJump.value = chapter
  pickerChapterData.value = null
  pickerChapterError.value = ''
  void loadPickerChapter(chapter)
}

function goPickerPrev() {
  if (pickerChapterData.value?.prev) goPickerTo(pickerChapterData.value.prev.chapter)
}

function goPickerNext() {
  if (pickerChapterData.value?.next) goPickerTo(pickerChapterData.value.next.chapter)
}

function onPickerJump() {
  const next = pickerJump.value
  if (!isValidChapter(next)) {
    message.warning(`回号需为 ${SANGO_CHAPTER_MIN}~${SANGO_CHAPTER_MAX} 的整数`)
    return
  }
  goPickerTo(next)
}

// 章节目录：回号 / 回目关键字过滤 SANGO_CHAPTER_TITLES（120 回固定数据，见 utils/sangoContents.ts）
const filteredPickerToc = computed(() => {
  const q = pickerTocSearch.value.trim().toLowerCase()
  if (!q) return SANGO_CHAPTER_TITLES
  return SANGO_CHAPTER_TITLES.filter(
    (row) => String(row.chapter).includes(q) || row.title.toLowerCase().includes(q),
  )
})

// 目录点击某回：复用 goPickerTo 跳转，切回「按章节浏览」展示正文并清空搜索
function pickFromToc(row: SangoChapterTitle) {
  goPickerTo(row.chapter)
  pickerTab.value = 'chapters'
  pickerTocSearch.value = ''
}

// 点击候选选段 / 章节片段 → 回填手增表单（chunkId + 正文），可再编辑后确认加入
function fillBackFromCandidate(candidate: DraftbenchCandidate) {
  manualChunkId.value = candidate.chunkId
  manualText.value = candidate.preview
  manualSource.value = { chunkId: candidate.chunkId, chapter: candidate.chapter, title: candidate.title }
  pickerOpen.value = false
}

function fillBackFromChapterChunk(chunk: SangoChapterChunk) {
  if (!pickerChapterData.value) return
  manualChunkId.value = chunk.chunkId
  manualText.value = chunk.text
  manualSource.value = {
    chunkId: chunk.chunkId,
    chapter: pickerChapterData.value.chapter,
    title: pickerChapterData.value.title,
  }
  pickerOpen.value = false
}

// ── 开关 ──

function onOpenChange(open: boolean) {
  emit('update:open', open)
}

// 验收 20：关闭草稿台后重置编辑状态（traceId / 拉取结果 / 发送清单 / 手增 / 本次参数 / query / 错误提示 / 选择器），
// 发送记录列表与页码不重置（重新打开时 reloadRecords 加载最新）；fullscreen 交由既有 watch 每次打开置 true
function resetDraftState() {
  traceIdInput.value = ''
  traceLoading.value = false
  traceError.value = ''
  trace.value = null
  chunkItems.value = []
  manualText.value = ''
  manualChunkId.value = ''
  manualSource.value = null
  manualOpen.value = false
  confirmOpen.value = false
  sending.value = false
  draftQuery.value = ''
  Object.assign(draftParams, DEFAULT_PARAMS)
  dragState.value = null
  dragOverIndex.value = null
  readerOpen.value = false
  readerTarget.value = null
  pickerOpen.value = false
  pickerTab.value = 'candidates'
  pickerSearch.value = ''
  pickerTocSearch.value = ''
  expandedCandidateId.value = null
  candidateExpandedData.value = null
  candidateExpandedLoading.value = false
  candidateExpandedError.value = ''
  pickerChapter.value = SANGO_CHAPTER_MIN
  pickerChapterData.value = null
  pickerChapterLoading.value = false
  pickerChapterError.value = ''
  pickerJump.value = SANGO_CHAPTER_MIN
}

// 第 14 条：全屏时锁死页面级滚动——背景页内容撑出的 html 滚动条会残留在全屏形态右缘且滚不动；
// 退出全屏 / 关闭弹框时恢复，普通形态页面滚动保持既有行为
let prevHtmlOverflow = ''
function syncPageScrollLock() {
  const root = document.documentElement
  const locked = props.open && fullscreen.value
  if (locked && root.style.overflow !== 'hidden') {
    prevHtmlOverflow = root.style.overflow
    root.style.overflow = 'hidden'
  } else if (!locked && root.style.overflow === 'hidden') {
    root.style.overflow = prevHtmlOverflow
  }
}
watch(
  () => props.open,
  (open) => {
    if (open) {
      fullscreen.value = true
    } else {
      resetDraftState()
    }
    syncPageScrollLock()
    void reloadRecords()
  },
)
watch(fullscreen, syncPageScrollLock)
onBeforeUnmount(() => {
  if (document.documentElement.style.overflow === 'hidden') {
    document.documentElement.style.overflow = prevHtmlOverflow
  }
})
</script><style scoped>
.draftbench-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* ① trace 拉取 */
.trace-bar {
  display: flex;
  align-items: center;
  gap: 10px;
}

.trace-label {
  flex: 0 0 auto;
  color: #718078;
  font-size: 13px;
}

.trace-input {
  width: 360px;
}

.trace-meta {
  overflow: hidden;
  color: #718078;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trace-error {
  margin-bottom: 0;
}

/* ② 双栏（固定可视高度，两栏内部各自独立滚动，可滚动区填满容器） */
.workspace {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  /* 普通形态：不设高度上限，弹框随内容长高、页面可竖直滚动（第三轮验收第 7 条）；
     内容不足时保底一个工作高度，两栏内部列表在容器内各自滚动 */
  min-height: min(52vh, 620px);
}

.col {
  display: flex;
  flex-direction: column;
  min-width: 0;
  border: 1px solid #d7e0d7;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.82);
  overflow: hidden;
}

.col-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid #e5eae5;
  background: #f2f6f1;
}

.col-title {
  color: #163c32;
  font-size: 13px;
  font-weight: 600;
}

.col-meta {
  color: #718078;
  font-size: 12px;
}

.col-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px 0;
  color: #718078;
  font-size: 13px;
}

.candidate-list {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  gap: 8px;
  min-height: 0;
  padding: 10px;
  overflow-y: auto;
  scrollbar-gutter: stable;
}

/* 候选列空态：插图 + 文案整体在容器内水平 + 垂直居中（仅空态渲染，不影响列表形态） */
.col-left :deep(.ant-empty) {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 16px 0;
}

/* 去掉 ant 空态默认 description 的底部 margin：否则 flex 按含尾部的整行居中，视觉块偏高 */
.col-left :deep(.ant-empty-description) {
  margin-bottom: 0;
}

/* 右栏发送清单空态：与左栏候选空态一致的插图+文案整体居中（仅空态渲染，不影响列表形态） */
.col-right :deep(.ant-empty) {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 16px 0;
}

.col-right :deep(.ant-empty-description) {
  margin-bottom: 0;
}

.candidate-item {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 10px 12px;
  border: 1px solid #dde5dd;
  border-radius: 9px;
  background: #fff;
  cursor: grab;
  transition: border-color 0.15s;
}

.candidate-item:hover {
  border-color: #b17837;
}

.candidate-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid #e5eae5;
  background: rgba(242, 246, 241, 0.6);
}

.candidate-toolbar-hint {
  color: #718078;
  font-size: 12px;
}

.candidate-toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 全屏形态：弹框 body 内收敛滚动，工作区占满剩余高度，发送记录压缩为独立滚动栏 */
.draftbench-body-fullscreen {
  flex: 1;
  min-height: 0;
  height: 100%;
}

.draftbench-body-fullscreen .workspace {
  flex: 1;
  min-height: 0;
  height: auto;
}

.draftbench-body-fullscreen .records-panel {
  display: flex;
  flex-direction: column;
  flex: 0 0 auto;
  max-height: 24vh;
}

.candidate-item.candidate-added {
  background: #f3f8f4;
  border-color: #b9d3c0;
  opacity: 0.72;
}

.candidate-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.candidate-rank {
  flex: 0 0 auto;
  color: #a0885a;
  font-family: 'SFMono-Regular', Consolas, monospace;
  font-size: 12px;
}

.candidate-title {
  overflow: hidden;
  flex: 1;
  color: #163c32;
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.candidate-meta {
  color: #718078;
  font-size: 12px;
}

.candidate-preview {
  display: -webkit-box;
  overflow: hidden;
  margin: 0;
  color: #43524b;
  font-size: 12px;
  line-height: 1.6;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.candidate-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
}

/* 右侧清单 */
.manual-add {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 10px 0;
}

.manual-btn {
  flex: 0 0 auto;
}

.manual-tip {
  flex: 1;
  color: #9aa69e;
  font-size: 11px;
  line-height: 1.5;
}

.chunk-list {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  margin: 10px;
  padding: 10px;
  border: 2px dashed #cfd9cf;
  border-radius: 10px;
  overflow-y: auto;
  scrollbar-gutter: stable;
  transition: border-color 0.15s, background 0.15s;
}

.chunk-list-dragover {
  border-color: #2e6d56;
  background: #f0f7f1;
}

.chunk-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  border: 1px solid #dde5dd;
  border-radius: 8px;
  background: #fff;
  cursor: grab;
}

.chunk-item.drop-before {
  border-top: 3px solid #2e6d56;
}

.chunk-item-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.chunk-item-no {
  flex: 0 0 auto;
  color: #a0885a;
  font-family: 'SFMono-Regular', Consolas, monospace;
  font-size: 12px;
}

.chunk-item-meta {
  overflow: hidden;
  flex: 1;
  color: #163c32;
  font-size: 12px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chunk-item-chunkid {
  font-family: 'SFMono-Regular', Consolas, monospace;
}

.chunk-item-remove {
  flex: 0 0 auto;
}

.chunk-item-text {
  margin: 0;
  color: #43524b;
  font-size: 12px;
  line-height: 1.6;
}

.chunk-item-actions {
  display: flex;
  justify-content: flex-end;
}

/* 弹框标题行（全屏按钮，预留关闭 X 位置） */
.draftbench-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.draftbench-fullscreen-btn {
  color: #43524b;
}

/* ③ 操作条 */
.action-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.action-summary {
  color: #43524b;
  font-size: 13px;
}

.muted {
  color: #9aa69e;
}

.action-buttons {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* ⑤ 记录 */
.records-panel {
  border: 1px solid #d7e0d7;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.82);
  overflow: hidden;
}

.records-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid #e5eae5;
  background: #f2f6f1;
}

.records-title {
  color: #163c32;
  font-size: 13px;
  font-weight: 600;
}

.records-hint {
  flex: 1;
  color: #9aa69e;
  font-size: 12px;
}

.records-table :deep(.record-row) {
  cursor: pointer;
}

.cell-ellipsis {
  display: block;
  overflow: hidden;
  max-width: 100%;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.record-citations {
  margin-left: 6px;
  color: #718078;
  font-size: 11px;
}

.record-error {
  margin-left: 6px;
  color: #c25b5b;
  font-size: 11px;
}

/* 确认弹框 */
.confirm-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.confirm-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.confirm-label {
  color: #43524b;
  font-size: 13px;
  font-weight: 600;
}

.confirm-meta {
  color: #718078;
  font-size: 12px;
}

.params-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}

.param-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.param-label {
  color: #718078;
  font-size: 12px;
}

.param-input {
  width: 100%;
}

.param-note {
  color: #9aa69e;
  font-size: 11px;
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* 手增弹框 + 原文选择器（第四轮） */
.manual-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.manual-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.manual-label-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.manual-label {
  color: #43524b;
  font-size: 13px;
  font-weight: 600;
}

.manual-hint {
  color: #9aa69e;
  font-size: 11px;
}

.manual-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.manual-actions-gap {
  flex: 1;
}

.picker-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.picker-pane {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}

.picker-search {
  flex: 0 0 auto;
}

.picker-candidate-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: calc(100vh - 340px);
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.picker-candidate {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 9px 12px;
  border: 1px solid #dde5dd;
  border-radius: 9px;
  background: #fff;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.picker-candidate:hover {
  border-color: #b17837;
}

.picker-candidate.expanded {
  border-color: #2e6d56;
  background: #f7fbf8;
}

.picker-candidate-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.picker-candidate-rank {
  flex: 0 0 auto;
  color: #a0885a;
  font-family: 'SFMono-Regular', Consolas, monospace;
  font-size: 12px;
}

.picker-candidate-title {
  overflow: hidden;
  flex: 1;
  color: #163c32;
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.picker-candidate-meta {
  flex: 0 0 auto;
  color: #718078;
  font-size: 11px;
}

.picker-candidate-preview {
  display: -webkit-box;
  overflow: hidden;
  margin: 0;
  color: #43524b;
  font-size: 12px;
  line-height: 1.6;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.picker-candidate-detail {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.picker-passage-bar {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 10px;
  border: 1px dashed #c9b78a;
  border-radius: 8px;
  background: #fffaf0;
}

.picker-passage-label {
  flex: 0 0 auto;
  padding-top: 2px;
  color: #a0885a;
  font-size: 12px;
  font-weight: 600;
}

.picker-passage-text {
  flex: 1;
  max-height: 96px;
  margin: 0;
  overflow-y: auto;
  color: #5a4a2a;
  font-size: 13px;
  line-height: 1.7;
}

.picker-detail-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 18px 0;
  color: #718078;
  font-size: 13px;
}

.picker-chunk-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 300px;
  padding: 4px 6px;
  border: 1px solid #e5eae5;
  border-radius: 8px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.picker-chunk-title {
  padding: 6px 4px;
  color: #718078;
  font-size: 12px;
  font-weight: 600;
}

.picker-chunk-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 6px;
}

.picker-chunk-row.is-target {
  background: #fff3cd;
  box-shadow: inset 0 0 0 2px #f0c36d;
}

.picker-chunk-no {
  flex: 0 0 52px;
  padding-top: 2px;
  color: #a0885a;
  font-family: 'SFMono-Regular', Consolas, monospace;
  font-size: 11px;
  text-align: right;
}

.picker-chunk-text {
  flex: 1;
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  text-align: justify;
}

.picker-chapter-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.picker-jump {
  display: flex;
  align-items: center;
  gap: 8px;
}

.picker-jump-label {
  color: #718078;
  font-size: 12px;
}

.picker-jump-input {
  width: 88px;
}

.picker-toc {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border: 1px solid #dde5dd;
  border-radius: 9px;
  background: #fbfcf9;
}

.picker-toc-search {
  flex: 0 0 auto;
}

.picker-toc-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: calc(100vh - 347px);
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.picker-toc-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
}

.picker-toc-row:hover {
  background: #eef5ef;
}

.picker-toc-row.is-current {
  background: #e2efe6;
  box-shadow: inset 0 0 0 1px #2e6d56;
}

.picker-toc-no {
  flex: 0 0 58px;
  color: #a0885a;
  font-family: 'SFMono-Regular', Consolas, monospace;
  font-size: 12px;
  text-align: right;
}

.picker-toc-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #2b2418;
  font-size: 13px;
}

.picker-toc-current {
  flex: 0 0 auto;
  color: #2e6d56;
  font-size: 11px;
  font-weight: 600;
}

.picker-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 28px 0;
  color: #718078;
  font-size: 13px;
}

.picker-chapter-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.picker-chapter-title {
  color: #163c32;
  font-size: 14px;
  font-weight: 600;
}

.picker-snippet-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: calc(100vh - 380px);
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.picker-snippet {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid #dde5dd;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.picker-snippet:hover {
  border-color: #2e6d56;
  background: #f4faf6;
}

.picker-snippet.is-in-list {
  opacity: 0.62;
}

.picker-snippet-no {
  flex: 0 0 52px;
  padding-top: 1px;
  color: #a0885a;
  font-family: 'SFMono-Regular', Consolas, monospace;
  font-size: 11px;
  text-align: right;
}

.picker-snippet-seg {
  flex: 0 0 auto;
  padding-top: 1px;
  color: #718078;
  font-size: 11px;
}

.picker-snippet-text {
  flex: 1;
  margin: 0;
  color: #2b2418;
  font-size: 13px;
  line-height: 1.7;
  text-align: justify;
}

.picker-select-hint {
  color: #9aa69e;
  font-size: 11px;
}
</style>

<!-- 弹框 teleport 到 body，scoped 选择器够不到 .ant-modal，故用 wrapClassName 挂载的非 scoped 样式块；选择器统一挂在 wrap class 下，不外泄 -->
<style>
.draftbench-modal-wrap.ant-modal-wrap,
.draftbench-confirm-wrap.ant-modal-wrap,
.draftbench-manual-wrap.ant-modal-wrap,
.draftbench-picker-wrap.ant-modal-wrap {
  overscroll-behavior: contain;
}

/* 全屏按钮与关闭 X 并排：header 右侧预留（X 绝对定位在 content 右上角） */
.draftbench-modal-wrap .ant-modal-header {
  padding-right: 72px;
}

/* 全屏形态：弹框铺满视口；wrap/content/body 均不再滚动，纵向滚动收敛到工作区内部列表（问题 5） */
.draftbench-modal-wrap.draftbench-fullscreen.ant-modal-wrap {
  padding: 0;
  overflow: hidden;
}

.draftbench-modal-wrap.draftbench-fullscreen .ant-modal {
  top: 0 !important;
  margin: 0;
  width: 100%;
  max-width: none;
  min-width: 0;
  height: 100%;
}

.draftbench-modal-wrap.draftbench-fullscreen .ant-modal-content {
  display: flex;
  height: 100vh;
  flex-direction: column;
  border-radius: 0;
  overflow: hidden;
}

.draftbench-modal-wrap.draftbench-fullscreen .ant-modal-body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  max-height: none !important;
  overflow: hidden !important;
}
</style>





