<template>
  <div class="diag-panel">
    <template v-if="view">
      <h4 class="detail-section-title diag-panel-title">检索诊断</h4>

      <!-- 顶部状态条：截断 -->
      <a-alert
        v-if="view.truncatedText"
        type="warning"
        show-icon
        class="diag-alert"
        :message="view.truncatedText"
      />

      <!-- 环境与降级：降级纯 BM25 红色告警 -->
      <a-alert
        v-if="view.env.degradedBm25Only"
        type="error"
        show-icon
        class="diag-alert"
        message="已降级纯 BM25（权重缺失 / 推理失败，本次检索仅词法召回）"
      />

      <!-- 召回漏斗 -->
      <section class="detail-section">
        <h4 class="detail-section-title">召回漏斗</h4>
        <div class="funnel-flow">
          <div class="funnel-stage">
            <div class="funnel-num">{{ view.funnel.lead.value }}</div>
            <div class="funnel-label">{{ view.funnel.lead.label }}</div>
          </div>
          <span class="funnel-arrow">→</span>
          <div class="funnel-stage funnel-branch">
            <div v-for="item in view.funnel.branch" :key="item.key" class="branch-item">
              <div class="funnel-num">{{ item.value }}</div>
              <div class="funnel-label">{{ item.label }}</div>
            </div>
          </div>
          <template v-for="stage in view.funnel.tail" :key="stage.key">
            <span class="funnel-arrow">→</span>
            <div class="funnel-stage" :class="{ 'funnel-topn': stage.topn }" :title="stage.hint">
              <div class="funnel-num">{{ stage.value }}</div>
              <div class="funnel-label">{{ stage.label }}</div>
            </div>
          </template>
        </div>
        <div v-for="hint in view.funnel.hints" :key="hint" class="diag-note">{{ hint }}</div>
      </section>

      <!-- 候选分数表 -->
      <section class="detail-section">
        <h4 class="detail-section-title mt-1!">候选分数</h4>
        <div class="diag-note">{{ view.scoringNote }}</div>
        <a-table
          :columns="scoreColumns"
          :data-source="view.scoreRows"
          :pagination="false"
          :row-key="scoreRowKey"
          :row-class-name="scoreRowClass"
          size="small"
          class="sub-table diag-score-table"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'rank'">
              <span :class="{ 'diag-rank-topn': record.inTopN }">{{ record.rank }}</span>
              <a-tag v-if="record.inTopN" color="green" size="small">top-N</a-tag>
            </template>
            <template v-else-if="column.key === 'chunkId'">
              <a class="chunk-id-link" @click="onOpenReader(record)">{{ record.chunkIdText }}</a>
            </template>
            <template v-else-if="column.key === 'chapter'">{{ record.chapterText }}</template>
            <template v-else-if="column.key === 'bm25Norm'">
              <a-tooltip placement="topLeft">
                <template #title>原始 bm25：{{ record.bm25RawText }}</template>
                <span>{{ record.bm25NormText }}</span>
              </a-tooltip>
            </template>
            <template v-else-if="column.key === 'vectorMap'">
              <a-tooltip placement="topLeft">
                <template #title>原始 cosine：{{ record.cosineRawText }}</template>
                <span>{{ record.vectorMapText }}</span>
              </a-tooltip>
            </template>
            <template v-else-if="column.key === 'labelHit'">
              <a-tag :color="record.labelHit ? 'gold' : 'default'" size="small">{{ record.labelHit ? '是' : '否' }}</a-tag>
            </template>
            <template v-else-if="column.key === 'finalScore'">
              <!-- 浮层逐行给出 finalScore 算式代入过程（finalScoreTitle 为换行拼接），免除手算 -->
              <a-tooltip placement="topLeft">
                <template #title>
                  <div class="diag-tooltip-lines">{{ record.finalScoreTitle }}</div>
                </template>
                <span class="diag-final-score">{{ record.finalScoreText }}</span>
              </a-tooltip>
            </template>
            <template v-else-if="column.key === 'sources'">
              <template v-for="source in record.sources" :key="source.text">
                <!-- 命中标签 tooltip 移到来源列「标签」tag 上（feat-A012 验收 6.2），标签 tag 仅 sources 含 label 时出现 -->
                <a-tooltip v-if="source.text === '标签' && record.hitLabelsTitle" placement="topLeft">
                  <template #title>
                    <div class="diag-tooltip-lines">{{ record.hitLabelsTitle }}</div>
                  </template>
                  <a-tag :color="source.color" size="small" class="diag-source-tag">{{ source.text }}</a-tag>
                </a-tooltip>
                <a-tag v-else :color="source.color" size="small" class="diag-source-tag">{{ source.text }}</a-tag>
              </template>
            </template>
            <template v-else-if="column.key === 'injected'">
              <a-tag :color="record.injectedText === '是' ? 'gold' : 'default'" size="small">{{ record.injectedText }}</a-tag>
            </template>
            <template v-else-if="column.key === 'cited'">
              <a-tag :color="record.citedText === '是' ? 'gold' : 'default'" size="small">{{ record.citedText }}</a-tag>
            </template>
            <template v-else-if="column.key === 'actions'">
              <a-button size="small" @click="onCopyChunkId(record)">复制</a-button>
            </template>
          </template>
        </a-table>
      </section>

      <!-- 第 N+1 名 -->
      <section v-if="view.nextRank" class="detail-section">
        <h4 class="detail-section-title">第 N+1 名</h4>
        <div class="next-rank-card">
          <div class="next-rank-head">
            <a-tag color="orange">rank {{ view.nextRank.rank }}</a-tag>
            <span class="next-rank-gap">差 {{ view.nextRank.gapToTopNText }} 分未进 top-N</span>
          </div>
          <div class="next-rank-meta">
            <div class="meta-row">
              <span class="meta-label">chunkId</span>
              <span class="meta-value">{{ view.nextRank.chunkId }}</span>
            </div>
            <div class="meta-row">
              <span class="meta-label">回目</span>
              <span class="meta-value">{{ view.nextRank.chapterText }}</span>
            </div>
            <div class="meta-row">
              <span class="meta-label">三路分</span>
              <span class="meta-value">
                BM25归一化 {{ view.nextRank.bm25NormText }} · 向量映射 {{ view.nextRank.vectorMapText }} · 标签 {{ view.nextRank.labelHit ? '是' : '否' }} ·
                <a-tooltip placement="topLeft">
                  <template #title>
                    <div class="diag-tooltip-lines">{{ view.nextRank.finalScoreTitle }}</div>
                  </template>
                  <span>最终 {{ view.nextRank.finalScoreText }}</span>
                </a-tooltip>
              </span>
            </div>
            <div class="meta-row">
              <span class="meta-label">原始分</span>
              <span class="meta-value diag-muted">原始 bm25 {{ view.nextRank.bm25RawText }} · 原始 cosine {{ view.nextRank.cosineRawText }}</span>
            </div>
            <div class="meta-row">
              <span class="meta-label">来源</span>
              <span class="meta-value">
                <a-tag
                  v-for="source in view.nextRank.sources"
                  :key="source.text"
                  :color="source.color"
                  size="small"
                >
                  {{ source.text }}
                </a-tag>
                <span v-if="view.nextRank.sources.length === 0">—</span>
              </span>
            </div>
          </div>
        </div>
      </section>

      <!-- query 处理链 -->
      <section class="detail-section">
        <h4 class="detail-section-title">Query 处理链</h4>
        <div class="query-chain">
          <div class="chain-step">
            <div class="chain-label">原始 query</div>
            <div class="chain-value">{{ view.query.raw }}</div>
          </div>
          <span class="funnel-arrow">→</span>
          <div class="chain-step">
            <div class="chain-label">alias 归一化</div>
            <div class="chain-value">{{ view.query.normalized }}</div>
          </div>
          <span class="funnel-arrow">→</span>
          <div class="chain-step">
            <div class="chain-label">分词 tokens</div>
            <div class="chain-value">
              <a-tag
                v-for="token in view.query.tokens"
                :key="token"
                color="blue"
                size="small"
                class="diag-token"
              >
                {{ token }}
              </a-tag>
              <span v-if="view.query.tokens.length === 0" class="diag-muted">（无）</span>
            </div>
          </div>
        </div>
      </section>

      <!-- 环境与降级 -->
      <section class="detail-section">
        <h4 class="detail-section-title">环境与降级</h4>
        <div class="env-grid">
          <div class="env-item">
            <span class="env-label">向量 scheme</span>
            <span class="env-value">{{ view.env.vectorSchemeText }}</span>
          </div>
          <div class="env-item">
            <span class="env-label">语料 chunk 数</span>
            <span class="env-value">{{ view.env.corpusChunks }}</span>
          </div>
          <div class="env-item">
            <span class="env-label">alias 条数</span>
            <span class="env-value">{{ view.env.aliasCount }}</span>
          </div>
          <div class="env-item">
            <span class="env-label">向量维度</span>
            <span class="env-value">{{ view.env.vectorDimText }}</span>
          </div>
        </div>
      </section>

      <!-- 死亡意图 -->
      <section v-if="view.deathIntent.detected && view.deathIntent.pinned" class="detail-section">
        <h4 class="detail-section-title">死亡意图</h4>
        <div class="death-intent">
          <a-tag color="error">已判定死亡意图并置顶</a-tag>
          <span class="diag-hint">被置顶候选：</span>
          <a-tag v-for="chunkId in view.deathIntent.chunkIds" :key="chunkId" color="orange" size="small">
            {{ chunkId }}
          </a-tag>
        </div>
      </section>

      <!-- 自洽检查 -->
      <section v-if="view.selfConsistency.citationMismatch || view.selfConsistency.citedOutsideTopN" class="detail-section">
        <h4 class="detail-section-title">自洽检查</h4>
        <a-alert
          v-if="view.selfConsistency.citationMismatch"
          type="warning"
          show-icon
          class="diag-alert"
          :message="view.selfConsistency.citationMismatchText"
        />
        <a-alert
          v-if="view.selfConsistency.citedOutsideTopN"
          type="error"
          show-icon
          class="diag-alert"
          message="存在被引用（cited=true）但未进 top-N 的候选，请核对引用链路"
        />
      </section>
    </template>
    <div v-else class="diag-empty">该调用无检索诊断</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { message } from 'ant-design-vue'
import type { RetrievalDiagnostics } from '../api/client'
import { buildDiagnosticsView, scoreRowClass, type ScoreRowView } from '../utils/retrievalDiagnostics'
import { copyText } from '../utils/clipboard'

const props = defineProps<{
  diagnostics: RetrievalDiagnostics | null
  citationCount?: number | null
}>()

const emit = defineEmits<{
  (e: 'open-reader', target: { chapter: number; title: string; chunkId: string }): void
}>()

const view = computed(() => buildDiagnosticsView(props.diagnostics, props.citationCount ?? null))

const scoreColumns = [
  { key: 'rank', title: '排名', width: 120 },
  { key: 'chunkId', title: 'chunkId', width: 210 },
  { key: 'chapter', title: '回目', width: 430 },
  { key: 'bm25Norm', title: 'BM25归一化', width: 130, align: 'center' },
  { key: 'vectorMap', title: '向量映射', width: 100, align: 'center' },
  { key: 'labelHit', title: '标签命中', width: 100, align: 'center' },
  { key: 'finalScore', title: '最终分', width: 80, align: 'center' },
  { key: 'sources', title: '来源', width: 180, align: 'center' },
  { key: 'injected', title: '进注入视图', width: 130, align: 'center' },
  { key: 'cited', title: '被引用', width: 90, align: 'center' },
  { key: 'actions', title: '操作', width: 80, align: 'center' },
]

function scoreRowKey(record: ScoreRowView): string {
  return record.key
}

// chunkId 点击 → 打开原文阅读器并定位该片段（入参直接取 candidates 的 chapter / title，feat-A010 验收 5）
function onOpenReader(record: ScoreRowView) {
  emit('open-reader', { chapter: record.chapter, title: record.title, chunkId: record.chunkId })
}

// 操作列「复制」：复制该行完整 chunkId，成功反馈，不打开阅读器（feat-A010 验收 5a）
function onCopyChunkId(record: ScoreRowView) {
  void copyText(record.chunkId).then((ok) => {
    if (ok) {
      message.success('已复制 chunkId')
    } else {
      message.error('复制失败，请手动选择复制')
    }
  })
}
</script>

<style scoped>
.diag-panel {
  padding: 2px 4px 2px 10px;
}

.diag-panel-title {
  margin-bottom: 12px;
}

.diag-alert {
  margin-bottom: 14px;
}

.diag-empty {
  padding: 6px 0;
  color: #9aa69e;
  font-size: 12px;
}

/* 召回漏斗 */
.funnel-flow {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: #fafbf9;
  border: 1px solid #e3e9e2;
  border-radius: 10px;
}

.funnel-stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 64px;
  padding: 6px 10px;
  background: #fff;
  border: 1px solid #d9e3db;
  border-radius: 8px;
}

.funnel-branch {
  flex-direction: row;
  gap: 14px;
  border-style: dashed;
}

.branch-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.funnel-topn .funnel-num {
  color: #389e0d;
}

.funnel-num {
  color: #163c32;
  font-size: 16px;
  font-weight: 700;
  line-height: 1.2;
}

.funnel-label {
  color: #7b8a80;
  font-size: 11px;
  white-space: nowrap;
}

.funnel-arrow {
  color: #b3bfb6;
  font-size: 14px;
}

/* 候选分数表 */
.diag-score-table :deep(.diag-row-in-topn td) {
  background: #f6ffed;
}

.diag-rank-topn {
  margin-right: 4px;
  color: #389e0d;
  font-weight: 700;
}

.diag-cited-tag {
  margin-left: 6px;
}

/* chunkId 可点击入口（feat-A010）：点开原文阅读器定位该片段 */
.chunk-id-link {
  color: #2e6d56;
  text-decoration: underline;
  cursor: pointer;
}

.chunk-id-link:hover {
  color: #b17837;
}

/* 被引用行高亮：青底，覆盖绿底以便一眼看到被引用的那条 */
.diag-score-table :deep(.diag-row-cited td) {
  background: #e6fffb;
}

.diag-note {
  margin-top: 6px;
  color: #9aa69e;
  font-size: 12px;
  line-height: 1.6;
}

.diag-final-score {
  font-weight: 600;
}

.diag-source-tag {
  margin: 2px 2px 0 0;
}

/* 第 N+1 名 */
.next-rank-card {
  padding: 10px 12px;
  background: #fffbf0;
  border: 1px solid #ffe7ba;
  border-radius: 10px;
}

.next-rank-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.next-rank-gap {
  color: #d46b08;
  font-size: 13px;
  font-weight: 600;
}

.next-rank-meta .meta-row {
  display: flex;
  gap: 8px;
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.6;
}

.meta-label {
  flex: none;
  width: 56px;
  color: #7b8a80;
}

.meta-value {
  color: #163c32;
}

/* Query 处理链 */
.query-chain {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: #fafbf9;
  border: 1px solid #e3e9e2;
  border-radius: 10px;
}

.chain-step {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 340px;
}

.chain-label {
  color: #7b8a80;
  font-size: 11px;
}

.chain-value {
  color: #163c32;
  font-size: 13px;
  word-break: break-all;
}

.diag-token {
  margin: 2px 2px 0 0;
}

.diag-muted {
  color: #9aa69e;
  font-size: 12px;
}

/* 环境与降级 */
.env-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 8px;
  padding: 10px 12px;
  background: #fafbf9;
  border: 1px solid #e3e9e2;
  border-radius: 10px;
}

.env-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.env-label {
  color: #7b8a80;
  font-size: 11px;
}

.env-value {
  color: #163c32;
  font-size: 13px;
  font-weight: 600;
}

/* 死亡意图 */
.death-intent {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  background: #fff1f0;
  border: 1px solid #ffccc7;
  border-radius: 10px;
}

.diag-hint {
  color: #cf1322;
  font-size: 12px;
}
</style>

<!-- tooltip 内容渲染在 body 下的浮层，scoped 选择器打不到，故单开非 scoped 块（口径同 LogsView 的 .dur-tooltip） -->
<style>
/* 标签命中 tooltip：多标签逐行展示（hitLabelsTitle 为 \n 拼接） */
.diag-tooltip-lines {
  white-space: pre-line;
}
</style>
