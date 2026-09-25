<template>
  <main class="logs-page">
    <div class="page-shell">
      <header class="site-header">
        <RouterLink to="/" class="brand">
          <span class="brand-mark">M</span>
          <span class="brand-copy">
            <span class="brand-name">MCP WORKSPACE</span>
            <span class="brand-caption">Log tracking</span>
          </span>
        </RouterLink>
        <div class="header-actions">
          <RouterLink to="/benchmark">
            <a-button size="small">评测控制台</a-button>
          </RouterLink>
          <RouterLink to="/cache">
            <a-button size="small">缓存控制台</a-button>
          </RouterLink>
          <RouterLink to="/chat">
            <a-button size="small">← 返回聊天</a-button>
          </RouterLink>
          <a-tag color="green">服务就绪</a-tag>
        </div>
      </header>

      <a-tabs v-model:activeKey="activeTab" class="logs-tabs" size="large">
        <a-tab-pane key="list">
          <template #tab><span class="tab-label">日志列表</span></template>

          <div class="query-card">
            <div class="query-row">
              <div class="query-item">
                <span class="query-label">类型</span>
                <a-select v-model:value="query.logType" class="query-control query-select">
                  <a-select-option value="">全部</a-select-option>
                  <a-select-option value="chat">对话</a-select-option>
                  <a-select-option value="quiz">答题</a-select-option>
                </a-select>
              </div>
              <div class="query-item">
                <span class="query-label">项目</span>
                <a-select v-model:value="query.domain" class="query-control query-select">
                  <a-select-option value="">全部</a-select-option>
                  <a-select-option value="weather">天气</a-select-option>
                  <a-select-option value="fengyunsanguo">风云三国</a-select-option>
                  <a-select-option value="sango-novel">三国演义</a-select-option>
                </a-select>
              </div>
              <div class="query-item">
                <span class="query-label">时间范围</span>
                <a-range-picker v-model:value="query.dateRange" value-format="YYYY-MM-DD" :placeholder="['开始日期', '结束日期']" class="query-control query-range" @change="onListRangeChange" />
              </div>
              <div class="query-item">
                <span class="query-label">traceId</span>
                <a-input v-model:value="query.traceId" class="query-control" placeholder="精确匹配" allow-clear />
              </div>
              <div class="query-item">
                <span class="query-label">关键字</span>
                <a-input v-model:value="query.keyword" class="query-control" placeholder="匹配用户输入" allow-clear />
              </div>
              <div class="query-item">
                <span class="query-label">状态</span>
                <a-select v-model:value="query.status" class="query-control query-select">
                  <a-select-option value="">全部</a-select-option>
                  <a-select-option value="success">成功</a-select-option>
                  <a-select-option value="failed">失败</a-select-option>
                </a-select>
              </div>
              <div class="query-item">
                <span class="query-label">响应码</span>
                <a-input-number v-model:value="query.responseCode" class="query-control" :min="100" :max="599" placeholder="如 500" />
              </div>
              <div class="query-actions">
                <a-button type="primary" :loading="listLoading" @click="onSearch">查 询</a-button>
                <a-button @click="onReset">重 置</a-button>
              </div>
            </div>
          </div>

          <div class="table-card">
            <a-table
              :columns="columns"
              :data-source="rows"
              :loading="listLoading"
              :row-key="rowKeyTrace"
              :pagination="pagination"
              :scroll="{ x: 'max-content' }"
              v-model:expandedRowKeys="expandedRowKeys"
              :expand-row-by-click="false"
              @change="onTableChange"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'time'">{{ formatTime(record.serverReceivedAt) }}</template>

                <template v-else-if="column.key === 'logType'">
                  <a-tooltip :open="typeBadgeTitle(record) || cacheHitLineOf(record) ? undefined : false" placement="top">
                    <template #title>
                      <div class="line-tooltip">
                        <div v-if="typeBadgeTitle(record)">{{ typeBadgeTitle(record) }}</div>
                        <div v-if="cacheHitLineOf(record)" :class="cacheHitLineOf(record)?.cls">{{ cacheHitLineOf(record)?.text }}</div>
                      </div>
                    </template>
                    <a-tag class="log-type-tag">{{ LOG_TYPE_LABELS[record.logType] ?? record.logType }}</a-tag>
                  </a-tooltip>
                </template>

                <template v-else-if="column.key === 'userInput'">
                  <a-tooltip placement="topLeft">
                    <template #title>{{ record.userInput }}</template>
                    <span class="cell-ellipsis">{{ truncateText(record.userInput, 200) }}</span>
                  </a-tooltip>
                </template>

                <template v-else-if="column.key === 'domain'">{{ record.domain || '—' }}</template>

                <template v-else-if="column.key === 'status'">
                  <a-tooltip v-if="record.status === 'failed'" placement="topLeft">
                    <template #title>{{ errorDetailText(record) }}</template>
                    <a-tag color="error">失败</a-tag>
                  </a-tooltip>
                  <a-tag v-else color="success">成功</a-tag>
                </template>
                <template v-else-if="column.key === 'durations'">
                  <a-tooltip placement="topLeft">
                    <template #title>
                      <div class="line-tooltip">
                        <div v-for="line in durationTooltipLines(record)" :key="line.text" :class="{ 'line-tooltip-indent': line.indent }">{{ line.text }}</div>
                      </div>
                    </template>
                    <div class="dur-total">{{ formatDuration(record.durations.total) }}</div>
                  </a-tooltip>
                </template>

                <template v-else-if="column.key === 'tokens'">
                  <a-tooltip placement="topLeft">
                    <template #title>输入 {{ formatTokens(record.tokens?.input ?? null) }} / 输出 {{ formatTokens(record.tokens?.output ?? null) }}</template>
                    <span>{{ tokenTotalText(record.tokens) }}</span>
                  </a-tooltip>
                </template>

                <template v-else-if="column.key === 'actions'">
                  <a-button size="small" @click="copyTraceId(record.traceId)">复制</a-button>
                </template>

              </template>

              <template #expandedRowRender="{ record }">
                <div class="detail-panel">
                  <a-spin v-if="detailOf(record.traceId)?.loading" />
                  <a-empty v-else-if="detailOf(record.traceId)?.error" :description="detailOf(record.traceId)?.error" />
                  <template v-else-if="detailOf(record.traceId)?.data">
                    <section v-if="detailOf(record.traceId)?.data?.log.answer || detailOf(record.traceId)?.data?.log.citations" class="detail-section">
                      <h4 class="detail-section-title">
                        回答
                        <a-tag v-if="hasTruncation(detailOf(record.traceId)?.data?.log.answer ?? '')" color="warning" size="small">已截断</a-tag>
                      </h4>
                      <pre class="answer-pre">{{ detailOf(record.traceId)?.data?.log.answer || '—' }}</pre>
                    </section>

                    <section v-if="detailOf(record.traceId)?.data?.log.citations" class="detail-section">
                      <h4 class="detail-section-title">
                        引用（citations）
                        <a-tag v-if="hasTruncation(detailOf(record.traceId)?.data?.log.citations ?? '')" color="warning" size="small">已截断</a-tag>
                      </h4>
                      <div v-if="citationsData(record)" class="json-viewer-wrap sub-viewer">
                        <vue-json-pretty
                          :data="citationsData(record)"
                          theme="light"
                          :deep="2"
                          show-length
                          :collapsed-on-click-brackets="true"
                        />
                      </div>
                      <pre v-else class="json-pre">{{ readableText(detailOf(record.traceId)?.data?.log.citations ?? '') }}</pre>
                    </section>

                    <section v-if="cacheOf(record)" class="detail-section">
                      <h4 class="detail-section-title">缓存判定</h4>
                      <div class="cache-card">
                        <div class="cache-card-head">
                          <a-tag :color="cacheBadgeOf(record).color" class="cache-badge-tag">{{ cacheBadgeOf(record).text }}</a-tag>
                          <span class="cache-judge-time">{{ cacheOf(record)?.hit === true ? '命中时间' : '判定时间' }} {{ formatTime(cacheOf(record)?.createdAt ?? 0) }}</span>
                        </div>
                        <div class="cache-card-meta">
                          <div class="cache-meta-row">
                            <span class="cache-meta-label">用户输入原文</span>
                            <span class="cache-meta-value">{{ cacheOf(record)?.userQuery }}</span>
                          </div>
                          <div class="cache-meta-row">
                            <span class="cache-meta-label">{{ cacheOf(record)?.hit === true ? '命中条目原文' : '最相近条目原文' }}</span>
                            <span class="cache-meta-value" :class="{ 'cache-nearest-em': cacheOf(record)?.reason === 'miss-gray' }">{{ cacheOf(record)?.nearestQuery || '—' }}</span>
                          </div>
                          <div class="cache-meta-row">
                            <span class="cache-meta-label">相似度</span>
                            <span class="cache-meta-value cache-sim">{{ formatSimilarity(cacheOf(record)?.similarity ?? null) }}</span>
                          </div>
                          <div class="cache-meta-row">
                            <span class="cache-meta-label">命中线</span>
                            <span class="cache-meta-value">{{ formatHitLine(cacheOf(record)?.hitLine ?? 0) }}</span>
                          </div>
                          <div v-if="cacheOf(record)?.lookupMs != null" class="cache-meta-row">
                            <span class="cache-meta-label">判定耗时</span>
                            <span class="cache-meta-value">{{ formatDuration(cacheOf(record)?.lookupMs) }}</span>
                          </div>
                        </div>
                        <div class="cache-formula-line">{{ cacheFormulaTextOf(record) }}</div>
                        <div class="cache-mark-row">
                          <span class="cache-mark-hint">标记误判（标记人）</span>
                          <a-input v-model:value="cacheMarkedBy[record.traceId]" size="small" class="cache-mark-input" placeholder="控制台" />
                          <a-button v-if="cacheOf(record)?.marked === true" size="small" :loading="cacheMarkBusy[record.traceId]" :disabled="cacheLogIdOf(record) === null" @click="onCacheUnmark(record)">取消标记</a-button>
                          <a-button v-else size="small" type="primary" ghost :loading="cacheMarkBusy[record.traceId]" :disabled="cacheLogIdOf(record) === null" @click="onCacheMark(record)">标记误判</a-button>
                          <span v-if="cacheLogIdOf(record) === null" class="cache-mark-disabled-hint">待接口补充 cacheLogId 后可操作</span>
                        </div>
                      </div>
                    </section>

                    <section class="detail-section">
                      <h4 class="detail-section-title">LLM 调用（{{ detailOf(record.traceId)?.data?.llmCalls.length ?? 0 }}）</h4>
                      <a-table
                        v-if="(detailOf(record.traceId)?.data?.llmCalls.length ?? 0) > 0"
                        :data-source="detailOf(record.traceId)?.data?.llmCalls"
                        :columns="llmColumns"
                        :pagination="false"
                        :row-key="rowKeySeq"
                        size="small"
                        class="sub-table"
                      >
                        <template #headerCell="{ column }">
                          <template v-if="column.key === 'outputTokens'">
                            <a-tooltip placement="top">
                              <template #title>completionTokens = 模型本次调用输出的全部 token 数（含思考 reasoningTokens）</template>
                              <span>{{ column.title }}</span>
                            </a-tooltip>
                          </template>
                          <template v-else>{{ column.title }}</template>
                        </template>
                        <template #bodyCell="{ column, record: call }">
                          <template v-if="column.key === 'stage'">
                            <span class="llm-seq">#{{ call.seq }}</span> {{ call.stage }}
                          </template>
                          <template v-else-if="column.key === 'model'">
                            <a-tooltip v-if="call.finishReason" placement="topLeft">
                              <template #title>finish_reason：{{ finishReasonLabel(call.finishReason) }}</template>
                              <span>{{ call.model }}</span>
                            </a-tooltip>
                            <span v-else>{{ call.model }}</span>
                          </template>
                          <template v-else-if="column.key === 'temperature'">
                            {{ call.temperature ?? '—' }}
                          </template>
                          <template v-else-if="column.key === 'inputTokens'">
                            <a-tooltip v-if="call.inputBreakdown" placement="topLeft">
                              <template #title>
                                <div class="token-tooltip">
                                  <div class="token-tooltip-title">输入分段（估算）</div>
                                  <div>系统提示（system） {{ formatTokens(call.inputBreakdown.system) }}</div>
                                  <div>用户输入（user） {{ formatTokens(call.inputBreakdown.user) }}</div>
                                  <div>检索注入（injected） {{ formatTokens(call.inputBreakdown.injected) }}</div>
                                </div>
                              </template>
                              <span class="token-cell">{{ formatTokens(call.promptTokens) }}</span>
                            </a-tooltip>
                            <span v-else class="token-cell">{{ formatTokens(call.promptTokens) }}</span>
                          </template>
                          <template v-else-if="column.key === 'outputTokens'">
                            <a-tooltip v-if="call.reasoningTokens != null || call.maxTokens != null" placement="topLeft">
                              <template #title>
                                <div class="token-tooltip">
                                  <div class="token-tooltip-title">输出 Token = 思考 + 正文</div>
                                  <div v-if="call.reasoningTokens != null">思考（reasoningTokens） {{ formatTokens(call.reasoningTokens) }}</div>
                                  <div>正文（completionTokens − reasoningTokens）= {{ bodyTokensEquationOf(call) }}</div>
                                  <div v-if="call.maxTokens != null">上限（max_tokens）{{ formatTokens(call.maxTokens) }}</div>
                                </div>
                              </template>
                              <span class="token-cell">{{ formatTokens(call.completionTokens) }}</span>
                            </a-tooltip>
                            <span v-else class="token-cell">{{ formatTokens(call.completionTokens) }}</span>
                          </template>
                          <template v-else-if="column.key === 'cachedTokens'">
                            {{ formatTokens(call.cachedTokens) }}
                          </template>
                          <template v-else-if="column.key === 'time'">
                            <template v-if="call.responseAt !== null">
                              <a-tooltip placement="topLeft">
                                <template #title>{{ formatTime(call.requestAt, true) }} ～ {{ formatTime(call.responseAt, true) }}</template>
                                <span class="dur-simple">{{ formatDuration(call.responseAt - call.requestAt) }}</span>
                              </a-tooltip>
                            </template>
                            <div v-else class="sub-meta err-text">未返回</div>
                          </template>
                          <template v-else-if="column.key === 'status'">
                            <a-tooltip v-if="call.status === 'failed' && call.errorMessage" placement="topLeft">
                              <template #title>{{ call.errorMessage }}</template>
                              <a-tag color="error">失败</a-tag>
                            </a-tooltip>
                            <a-tag v-else :color="call.status === 'failed' ? 'error' : 'success'">{{ call.status === 'failed' ? '失败' : '成功' }}</a-tag>
                          </template>
                          <template v-else-if="column.key === 'content'">
                            <div class="content-actions">
                              <a-button v-if="call.requestSummary" size="small" @click="openJsonModal('LLM 入参 #' + call.seq, call.requestSummary)">入参</a-button>
                              <a-button v-if="call.responseSummary" size="small" @click="openJsonModal('LLM 出参 #' + call.seq, call.responseSummary)">出参</a-button>
                              <a-button
                                v-if="call.toolCalls && call.toolCalls.trim() && call.toolCalls.trim() !== '[]'"
                                size="small"
                                @click="openJsonModal('LLM 工具声明 #' + call.seq, call.toolCalls)"
                              >工具声明</a-button>
                            </div>
                          </template>
                        </template>
                      </a-table>
                      <div v-else class="sub-empty">无 LLM 调用</div>
                    </section>
                    <section class="detail-section">
                      <h4 class="detail-section-title">工具调用（{{ detailOf(record.traceId)?.data?.toolCalls.length ?? 0 }}）</h4>
                      <div v-if="cacheOf(record)?.hit === true" class="cache-no-retrieval">
                        <a-tag color="green">缓存命中，未走检索</a-tag>
                        <span class="cache-no-retrieval-hint">本次请求命中缓存：0 次检索、0 次 LLM 调用，不展示检索诊断</span>
                      </div>
                      <a-table
                        v-else-if="(detailOf(record.traceId)?.data?.toolCalls.length ?? 0) > 0"
                        :data-source="detailOf(record.traceId)?.data?.toolCalls"
                        :columns="toolColumns"
                        :pagination="false"
                        :row-key="rowKeySeq"
                        size="small"
                        class="sub-table"
                        :expandable="toolExpandableOf(record)"
                      >
                        <template #bodyCell="{ column, record: call }">
                          <template v-if="column.key === 'mcpServer'">
                            {{ call.mcpServer }}
                          </template>
                          <template v-else-if="column.key === 'toolName'">
                            <span class="tool-name">{{ call.toolName }}</span>
                          </template>
                          <template v-else-if="column.key === 'caller'">
                            {{ callerStageLabel(call) }}
                          </template>
                          <template v-else-if="column.key === 'time'">
                            <template v-if="call.callReturnedAt !== null">
                              <a-tooltip placement="topLeft">
                                <template #title>
                                  <template v-if="timingLinesOf(call)">
                                    <div v-for="line in timingLinesOf(call)" :key="line">{{ line }}</div>
                                  </template>
                                  <div v-else>{{ formatTime(call.callSentAt, true) }} ～ {{ formatTime(call.callReturnedAt, true) }}</div>
                                </template>
                                <span class="dur-simple">{{ formatDuration(call.callReturnedAt - call.callSentAt) }}</span>
                              </a-tooltip>
                            </template>
                            <div v-else class="sub-meta err-text">未返回</div>
                          </template>
                          <template v-else-if="column.key === 'status'">
                            <a-tag :color="call.status === 'failed' ? 'error' : 'success'">{{ call.status === 'failed' ? '失败' : '成功' }}</a-tag>
                            <div v-if="call.status === 'failed' && call.errorMessage" class="sub-meta err-text">{{ call.errorMessage }}</div>
                          </template>
                          <template v-else-if="column.key === 'content'">
                            <div class="content-actions">
                              <a-button v-if="call.argsSummary" size="small" @click="openJsonModal('工具入参 #' + call.seq, call.argsSummary)">入参</a-button>
                              <a-button v-if="call.resultSummary" size="small" @click="openJsonModal('工具出参 #' + call.seq, call.resultSummary)">出参</a-button>
                            </div>
                          </template>
                        </template>
                        <template #expandedRowRender="{ record: call }">
                          <RetrievalDiagnosticsPanel
                            :diagnostics="call.diagnostics ?? null"
                            :citation-count="citationCountOf(record)"
                            @open-reader="onOpenReader"
                          />
                        </template>
                      </a-table>
                      <div v-else class="sub-empty">无工具调用</div>
                    </section>
                  </template>
                </div>
              </template>
            </a-table>
          </div>
        </a-tab-pane>

        <a-tab-pane key="stats">
          <template #tab><span class="tab-label">Token 统计</span></template>

          <div class="query-card">
            <div class="query-row stats-query-row">
              <div class="query-item">
                <span class="query-label">时间段</span>
                <a-radio-group v-model:value="rangePreset" @change="onPresetChange" class="preset-radios">
                  <a-radio-button value="today">今天</a-radio-button>
                  <a-radio-button value="7d">近 7 天</a-radio-button>
                  <a-radio-button value="30d">近 30 天</a-radio-button>
                  <a-radio-button value="custom">自定义</a-radio-button>
                </a-radio-group>
                <a-range-picker v-model:value="customRange" value-format="YYYY-MM-DD" :placeholder="['开始日期', '结束日期']" class="query-range" @change="onCustomRangeChange" />
              </div>
              <div class="query-item">
                <span class="query-label">粒度</span>
                <a-radio-group v-model:value="granularity" @change="onGranularityChange">
                  <a-radio-button value="day">按天</a-radio-button>
                  <a-radio-button value="hour">按小时</a-radio-button>
                </a-radio-group>
              </div>
              <div class="query-actions">
                <a-button type="primary" :loading="statsLoading" @click="onRefreshStats">刷 新</a-button>
              </div>
            </div>
          </div>

          <div class="stats-card">
            <div class="stats-head">
              <div class="stats-range-info">
                <span v-if="statsRangeLabel" class="stats-range-label">{{ statsRangeLabel }}</span>
                <span class="stats-granularity-hint">日界：上海时区（UTC+8） · 实际粒度：{{ granularity === 'day' ? '按天' : '按小时' }}</span>
              </div>
              <div v-if="statsData" class="stats-summary">
                <span class="summary-item">区间总 Token：{{ formatTokens(statsSummary.totalTokens) }}</span>
                <span class="summary-item">缓存命中率：{{ statsSummary.hitRateText }}</span>
              </div>
            </div>
            <a-spin :spinning="statsLoading">
              <div ref="chartEl" class="chart-canvas"></div>
            </a-spin>
            <div v-if="statsData && statsData.buckets.length === 0 && !statsLoading" class="chart-empty">
              <a-empty description="该时间段暂无 token 数据" />
            </div>
          </div>
        </a-tab-pane>
      </a-tabs>

      <a-modal
        v-model:open="contentModalOpen"
        :title="contentModal?.title"
        :footer="null"
        width="min(900px, 94vw)"
        @cancel="closeContentModal"
      >
        <div v-if="jsonViewData" class="json-viewer-wrap modal-json">
          <vue-json-pretty
            :key="contentModal?.title"
            :data="jsonViewData"
            theme="light"
            :deep="2"
            show-length
            :collapsed-on-click-brackets="true"
          />
        </div>
        <pre v-else class="json-pre modal-json">{{ readableText(contentModal?.body ?? '') }}</pre>
      </a-modal>

      <SangoChapterReader
        v-if="readerTarget"
        v-model:open="readerOpen"
        :chapter="readerTarget.chapter"
        :chapter-title="readerTarget.chapterTitle"
        :chunk-id="readerTarget.chunkId"
      />
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import { useRoute, useRouter } from 'vue-router'
import { init as initChart, use } from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsType } from 'echarts/core'
import VueJsonPretty from 'vue-json-pretty'
import 'vue-json-pretty/lib/styles.css'

use([BarChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])
import {
  fetchLogDetail,
  fetchLogList,
  fetchTokenStats,
  getErrorMessage,
  markMisjudge,
  unmarkMisjudge,
  type CacheLogRecord,
  type LogDetail,
  type LlmCallRecord,
  type LogListItem,
  type LogListQuery,
  type RouteSource,
  type ToolCallRecord,
  type TokenStatsData,
} from '../api/client'
import RetrievalDiagnosticsPanel from '../components/RetrievalDiagnosticsPanel.vue'
import SangoChapterReader from '../components/SangoChapterReader.vue'
import { copyText } from '../utils/clipboard'
import { timingLines } from '../utils/retrievalDiagnostics'
import {
  cacheBadge,
  cacheFormulaText,
  cacheHitTooltipText,
  formatHitLine,
  formatSimilarity,
} from '../utils/cacheDiagnostics'

// ── 通用格式化 ──

const TRUNCATION_MARK = '…（已截断）'
const DAY_MS = 24 * 60 * 60 * 1000
const SHANGHAI_UTC_OFFSET_MS = 8 * 60 * 60 * 1000
const LOG_TYPE_LABELS: Record<string, string> = { chat: '对话', quiz: '答题' }

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function pad3(n: number): string {
  return String(n).padStart(3, '0')
}

function formatTime(ms: number, withMillis = false): string {
  const d = new Date(ms)
  const base = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
  return withMillis ? `${base}.${pad3(d.getMilliseconds())}` : base
}

function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—'
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${parseFloat((ms / 1000).toFixed(1))}s`
}

function formatTokens(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return n.toLocaleString('en-US')
}

function tokenTotalText(tokens: { input: number | null; output: number | null } | null | undefined): string {
  if (tokens === null || tokens === undefined) return '—'
  if ((tokens.input === null || tokens.input === undefined) && (tokens.output === null || tokens.output === undefined)) return '—'
  return formatTokens((tokens.input ?? 0) + (tokens.output ?? 0))
}

const CALLER_LABELS: Record<string, string> = {
  server: '服务端',
  model: '大模型',
}

const STAGE_LABELS: Record<string, string> = {
  l3: 'L3 预检',
  fastpath: '域快路径',
  classify: '分类轮预调',
  generation: '生成轮调用',
  admin: '后台直调',
}

function callerStageLabel(call: { caller?: string | null; stage?: string | null }): string {
  const parts: string[] = []
  const caller = call.caller ?? null
  const stage = call.stage ?? null
  if (caller && CALLER_LABELS[caller]) parts.push(CALLER_LABELS[caller])
  if (stage && STAGE_LABELS[stage]) parts.push(STAGE_LABELS[stage])
  return parts.length ? parts.join(' · ') : '—'
}

// 检索分阶段耗时（feat-A013 验收）：timing 缺失返回 null，工具调用耗时 tooltip 不追加 4 行
function timingLinesOf(call: ToolCallRecord): string[] | null {
  return timingLines(call.diagnostics?.timing)
}

// ── 路由来源 / 重试标记（feat-A012）──

const ROUTE_SOURCE_LABELS: Record<RouteSource, string> = {
  label: '标签路由（label）',
  keyword: '关键词路由（keyword）',
  vector: '向量路由（vector）',
  classify: '分类路由（classify）',
  free: '自由路由（free）',
}

function routeSourceLabel(source: RouteSource | null | undefined): string {
  return source ? ROUTE_SOURCE_LABELS[source] : '—'
}

// 类型列 hover（feat-A012 验收 1）：有哪项列哪项，两项都无返回空串（不弹浮层）
function typeBadgeTitle(record: LogListItem): string {
  const lines: string[] = []
  if (record.routeSource != null) lines.push(`路由来源：${routeSourceLabel(record.routeSource)}`)
  if (record.hasRetry === true) lines.push('重试：存在变参重试（attempt=2）')
  return lines.join('\n')
}

// 类型列 hover 缓存行（feat-A013 §4.2）：cacheHit 非 null 时追加一行「缓存命中」（绿）/「缓存未命中」（灰）
function cacheHitLineOf(record: LogListItem): { text: string; cls: string } | null {
  const text = cacheHitTooltipText(record.cacheHit)
  if (!text) return null
  return { text, cls: text === '缓存命中' ? 'cache-line-hit' : 'cache-line-miss' }
}

// ── 缓存判定卡片（feat-A013 §3.10 / §4.2）──

function cacheOf(record: LogListItem): CacheLogRecord | null {
  return detailOf(record.traceId)?.data?.cache ?? null
}

function cacheBadgeOf(record: LogListItem) {
  const cache = cacheOf(record)
  return cache === null ? { text: '未命中（低相似）', color: 'default' } : cacheBadge(cache)
}

function cacheFormulaTextOf(record: LogListItem): string {
  const cache = cacheOf(record)
  return cache ? cacheFormulaText(cache) : ''
}

// §3.9 标记按 cache_logs id；§3.10 data.cache 未承诺该字段，缺失时禁用卡片标记（待接口补充）
function cacheLogIdOf(record: LogListItem): number | null {
  return cacheOf(record)?.cacheLogId ?? null
}

// 标记人输入框，缺省「控制台」（接口文档 §3.9）
const cacheMarkedBy = reactive<Record<string, string>>({})
const cacheMarkBusy = reactive<Record<string, boolean>>({})

function markByOf(traceId: string): string {
  return (cacheMarkedBy[traceId] ?? '').trim() || '控制台'
}

async function refreshCacheDetail(traceId: string) {
  try {
    const data = await fetchLogDetail(traceId)
    if (detailState[traceId]) detailState[traceId].data = data
  } catch (err) {
    message.error(getErrorMessage(err))
  }
}

async function onCacheMark(record: LogListItem) {
  const cacheLogId = cacheLogIdOf(record)
  if (cacheLogId === null) return
  cacheMarkBusy[record.traceId] = true
  try {
    await markMisjudge(cacheLogId, markByOf(record.traceId))
    message.success('已标记为误判')
    await refreshCacheDetail(record.traceId)
  } catch (err) {
    message.error(getErrorMessage(err))
  } finally {
    cacheMarkBusy[record.traceId] = false
  }
}

async function onCacheUnmark(record: LogListItem) {
  const cacheLogId = cacheLogIdOf(record)
  if (cacheLogId === null) return
  cacheMarkBusy[record.traceId] = true
  try {
    await unmarkMisjudge(cacheLogId)
    message.success('已取消误判标记')
    await refreshCacheDetail(record.traceId)
  } catch (err) {
    message.error(getErrorMessage(err))
  } finally {
    cacheMarkBusy[record.traceId] = false
  }
}

// 耗时列 hover（feat-A012 验收 3）：总台 = 服务端墙钟（server_responded_at − server_received_at），
// LLM / 工具为各自调用累计和，不保证与总台相等；差值 ≥ 100ms 时补「其他」行
interface DurTooltipLine { indent: boolean; text: string }
function durationTooltipLines(record: LogListItem): DurTooltipLine[] {
  const d = record.durations
  const lines: DurTooltipLine[] = [
    { indent: false, text: `总 ${formatDuration(d.total)}（= 前端 + 队列等待 + 总台）` },
    { indent: false, text: `前端 ${formatDuration(d.frontend)}` },
    { indent: false, text: `队列等待 ${formatDuration(d.queueWait)}` },
    { indent: false, text: `总台 ${formatDuration(d.server)}（服务端墙钟）` },
    { indent: true, text: `LLM ${formatDuration(d.llm)}` },
    { indent: true, text: `工具 ${formatDuration(d.tool)}` },
  ]
  const llmToolSum = (d.llm ?? 0) + (d.tool ?? 0)
  lines.push({ indent: true, text: `LLM + 工具 ${formatDuration(llmToolSum)}` })
  if (d.cacheLookupMs != null) {
    lines.push({ indent: true, text: `缓存判定 ${formatDuration(d.cacheLookupMs)}（含首启 embedding 冷启动）` })
  }
  if (Math.abs((d.server ?? 0) - llmToolSum) >= 100) {
    lines.push({ indent: false, text: `其他 ${formatDuration((d.server ?? 0) - llmToolSum)}（路由 / 落库等）` })
  }
  return lines
}

function errorDetailText(record: LogListItem): string {
  const base = `异常 ${record.responseCode}`
  return record.errorMessage ? `${base}：${record.errorMessage}` : base
}

const FINISH_REASON_LABELS: Record<string, string> = {
  stop: '正常结束',
  tool_calls: '请求工具',
  length: '触达上限',
}

function finishReasonLabel(reason: string): string {
  return FINISH_REASON_LABELS[reason] ?? reason
}

// 正文 = completionTokens − reasoningTokens（feat-A012 复验 A/B）：完整等式 左端字段名 + 右端代入求值，不可算时「—」
function bodyTokensEquationOf(call: LlmCallRecord): string {
  if (call.completionTokens != null && call.reasoningTokens != null) {
    return `${formatTokens(call.completionTokens)} − ${formatTokens(call.reasoningTokens)} = ${formatTokens(call.completionTokens - call.reasoningTokens)}`
  }
  return '—'
}

function truncateText(text: string, max: number): string {
  if (text.length <= max || text.includes(TRUNCATION_MARK)) return text
  return `${text.slice(0, max)}${TRUNCATION_MARK}`
}

function hasTruncation(text: string): boolean {
  return text.includes(TRUNCATION_MARK)
}
// ── JSON 内容展示：vue-json-pretty 树形查看 ──

// 展示优化：字符串值若是内嵌 JSON（如工具返回里再序列化一层的数组/对象），
// 递归展开成真实层级，避免出现大量 \" 转义；纯文本里的 \n 还原为换行便于阅读
function readableText(value: string): string {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '')
    .replace(/\\"/g, '"')
}

function expandNestedJson(value: unknown): unknown {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        return expandNestedJson(JSON.parse(value))
      } catch {
        return readableText(value)
      }
    }
    return readableText(value)
  }
  if (Array.isArray(value)) return value.map((item) => expandNestedJson(item))
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    Object.entries(value).forEach(([key, item]) => {
      out[key] = expandNestedJson(item)
    })
    return out
  }
  return value
}

// 服务端 8000 截断会从任意位置切断 JSON 导致解析失败。
// 尽力修复：优先在截断处补全未闭合的字符串与括号，失败则回到最后一个完整 token 处截断再补闭合。
function repairTruncatedJson(raw: string): unknown | null {
  const body = raw.replace(TRUNCATION_MARK, '').trimEnd()
  if (!body) return null

  const stack: string[] = []
  let inString = false
  let escaped = false
  let lastCut = -1
  let lastCutStack: string[] = []
  let tokenStart = -1

  const endToken = (endIndex: number) => {
    const token = body.slice(tokenStart, endIndex + 1)
    if (/^(?:true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)$/.test(token)) {
      lastCut = endIndex + 1
      lastCutStack = stack.slice()
    }
    tokenStart = -1
  }

  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === '"') {
        inString = false
        // 键后紧跟冒号，不当作安全截断点
        if (body[i + 1] !== ':') {
          lastCut = i + 1
          lastCutStack = stack.slice()
        }
      }
      continue
    }
    if (ch === '"') {
      inString = true
    } else if (ch === '{') {
      stack.push('object')
    } else if (ch === '[') {
      stack.push('array')
    } else if (ch === '}') {
      stack.pop()
      lastCut = i + 1
      lastCutStack = stack.slice()
    } else if (ch === ']') {
      stack.pop()
      lastCut = i + 1
      lastCutStack = stack.slice()
    } else if (/[A-Za-z0-9]/.test(ch)) {
      if (tokenStart < 0) tokenStart = i
    } else if (tokenStart >= 0) {
      endToken(i - 1)
    }
  }
  if (tokenStart >= 0) endToken(body.length - 1)

  const candidates: string[] = []
  const seen = new Set<string>()
  const pushCandidate = (base: string, closers: string) => {
    for (const prefix of ['', '"', '""']) {
      const candidate = `${base}${prefix}${closers}`
      if (!seen.has(candidate)) {
        seen.add(candidate)
        candidates.push(candidate)
      }
    }
  }

  // 1) 尽量保留截断处未闭合的字符串：直接在末尾补闭合符号
  const endDepth = Math.min(stack.length, 5)
  for (let i = 0; i < 2 ** endDepth; i++) {
    let closers = ''
    for (let j = 0; j < endDepth; j++) closers += (i >> j) & 1 ? ']' : '}'
    pushCandidate(body, closers)
  }

  // 2) 回到最后一个完整 token 处截断（去掉悬空逗号），再补闭合
  if (lastCut >= 0) {
    const base = body.slice(0, lastCut).replace(/[, \t\r\n]+$/, '')
    let closers = ''
    for (let j = lastCutStack.length - 1; j >= 0; j--) closers += lastCutStack[j] === 'array' ? ']' : '}'
    pushCandidate(base, closers)
    // 截断点可能刚好处在键/冒号后，补一个空值试试
    candidates.push(`${base}null${closers}`)
  }

  for (const candidate of candidates) {
    try {
      return expandNestedJson(JSON.parse(candidate))
    } catch {
      /* 继续尝试下一个候选 */
    }
  }
  return null
}

function tryParseJson(raw: string): unknown {
  if (!raw) return null
  try {
    return expandNestedJson(JSON.parse(raw))
  } catch {
    return repairTruncatedJson(raw)
  }
}

// ── 日志列表 ──

const columns = [
  { key: 'time', title: '时间', width: 165 },
  { key: 'logType', title: '类型', width: 80 },
  { key: 'userInput', title: '用户输入', width: 240, ellipsis: true },
  { key: 'domain', title: '域', width: 110 },
  { key: 'status', title: '状态', width: 150 },
  { key: 'durations', title: '耗时', width: 80 },
  { key: 'tokens', title: '消耗Token', width: 180, align: 'center' },
  { key: 'actions', title: '操作', width: 100, align: 'center' },
]

const llmColumns = [
  { key: 'stage', title: '阶段', width: 120 },
  { key: 'model', title: '模型', width: 170 },
  { key: 'temperature', title: '温度', width: 70, align: 'center' },
  { key: 'inputTokens', title: '输入 Token', width: 130 },
  { key: 'outputTokens', title: '输出 Token', width: 130 },
  { key: 'cachedTokens', title: '缓存命中', width: 100 },
  { key: 'time', title: '耗时', width: 110 },
  { key: 'status', title: '状态', width: 140 },
  { key: 'content', title: '内容', width: 200 },
]

const toolColumns = [
  { key: 'mcpServer', title: 'MCP 名称', width: 140 },
  { key: 'toolName', title: '调用方法', width: 180 },
  { key: 'caller', title: '调用方', width: 130 },
  { key: 'time', title: '耗时', width: 110 },
  { key: 'status', title: '状态', width: 140 },
  { key: 'content', title: '内容', width: 200 },
]

function rowKeyTrace(record: LogListItem): string {
  return record.traceId
}

function rowKeySeq(item: { seq: number }): number {
  return item.seq
}

const rows = ref<LogListItem[]>([])
const total = ref(0)
const pageNo = ref(1)
const pageSize = ref(10)
const listLoading = ref(false)

const query = reactive<{
  logType: string
  domain: string
  dateRange: string[]
  traceId: string
  keyword: string
  status: string
  responseCode: number | null
}>({
  logType: '',
  domain: '',
  dateRange: [],
  traceId: '',
  keyword: '',
  status: '',
  responseCode: null,
})

const expandedRowKeys = ref<string[]>([])
const detailState = reactive<Record<string, { loading: boolean; error: string; data: LogDetail | null }>>({})

const contentModalOpen = ref(false)
const contentModal = ref<{ title: string; body: string } | null>(null)

function openJsonModal(title: string, body: string) {
  contentModal.value = { title: hasTruncation(body) ? `${title} (已截断)` : title, body }
  contentModalOpen.value = true
}

function closeContentModal() {
  contentModalOpen.value = false
  contentModal.value = null
}

const jsonViewData = computed(() => tryParseJson(contentModal.value?.body ?? ''))

function citationsData(record: LogListItem): unknown {
  return tryParseJson(detailOf(record.traceId)?.data?.log.citations ?? '')
}

// ── 工具调用行展开：检索诊断（feat-A009）──

const toolExpandKeys = reactive<Record<string, (string | number)[]>>({})

function toolExpandableOf(record: LogListItem) {
  return {
    expandedRowKeys: toolExpandKeys[record.traceId] ?? [],
    onExpandedRowsChange: (keys: (string | number)[]) => {
      toolExpandKeys[record.traceId] = keys
    },
  }
}

function citationCountOf(record: LogListItem): number | null {
  const parsed = citationsData(record)
  return Array.isArray(parsed) ? parsed.length : null
}

function detailOf(traceId: string) {
  return detailState[traceId]
}

// 点击行首「+」展开时同样加载明细（此前只有「明细」按钮会触发，导致先空一行）
watch(expandedRowKeys, (keys) => {
  keys.forEach((traceId) => {
    void ensureDetail(traceId)
  })
})

async function ensureDetail(traceId: string) {
  if (detailState[traceId]) return
  detailState[traceId] = { loading: true, error: '', data: null }
  try {
    const data = await fetchLogDetail(traceId)
    detailState[traceId].data = data
    if (!(traceId in cacheMarkedBy)) cacheMarkedBy[traceId] = '控制台'
  } catch (err) {
    detailState[traceId].error = getErrorMessage(err)
  } finally {
    detailState[traceId].loading = false
  }
}

function resetExpansion() {
  expandedRowKeys.value = []
  Object.keys(detailState).forEach((key) => {
    delete detailState[key]
  })
}

function onListRangeChange(_dates: unknown, dateStrings: [string, string]) {
  query.dateRange = dateStrings[0] && dateStrings[1] ? [dateStrings[0], dateStrings[1]] : []
}

function buildListQuery(): LogListQuery {
  const listQuery: LogListQuery = { pageNo: pageNo.value, pageSize: pageSize.value }
  if (query.logType) listQuery.logType = query.logType
  if (query.domain) listQuery.domain = query.domain
  if (query.traceId.trim()) listQuery.traceId = query.traceId.trim()
  if (query.keyword.trim()) listQuery.keyword = query.keyword.trim()
  if (query.status) listQuery.status = query.status
  if (query.responseCode !== null) listQuery.responseCode = query.responseCode
  if (Array.isArray(query.dateRange) && query.dateRange.length === 2 && query.dateRange[0] && query.dateRange[1]) {
    listQuery.startAt = parseShanghaiDate(query.dateRange[0])
    listQuery.endAt = parseShanghaiDate(query.dateRange[1]) + DAY_MS - 1
  }
  return listQuery
}

async function loadList() {
  listLoading.value = true
  try {
    const data = await fetchLogList(buildListQuery())
    rows.value = data.list
    total.value = data.total
  } catch (err) {
    message.error(getErrorMessage(err))
  } finally {
    listLoading.value = false
  }
}

function onSearch() {
  pageNo.value = 1
  resetExpansion()
  void loadList()
}

function onReset() {
  query.logType = ''
  query.domain = ''
  query.dateRange = []
  query.traceId = ''
  query.keyword = ''
  query.status = ''
  query.responseCode = null
  pageNo.value = 1
  resetExpansion()
  void loadList()
}

function onTableChange(pagination: { current?: number; pageSize?: number }) {
  pageNo.value = pagination.current ?? 1
  pageSize.value = pagination.pageSize ?? 10
  resetExpansion()
  void loadList()
}

const pagination = computed(() => ({
  current: pageNo.value,
  pageSize: pageSize.value,
  total: total.value,
  showSizeChanger: true,
  showTotal: (t: number) => `共 ${t} 条`,
  buildOptionText: (opt: { value: string | number }) => `${opt.value}条/页`,
}))

// ── 原文阅读器（feat-A010）──

interface ReaderTarget {
  chapter: number
  chapterTitle?: string
  chunkId?: string
}

const readerOpen = ref(false)
const readerTarget = ref<ReaderTarget | null>(null)

function onOpenReader(target: ReaderTarget) {
  readerTarget.value = target
  readerOpen.value = true
}

// 「操作」列复制 traceId（feat-A010 验收 3）：剪贴板降级路径，成功反馈
function copyTraceId(traceId: string) {
  void copyText(`traceId: ${traceId}`).then((ok) => {
    if (ok) {
      message.success('已复制 traceId')
    } else {
      message.error('复制失败，请手动选择复制')
    }
  })
}

// ── Token 统计（Asia/Shanghai 日界）──

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

function defaultGranularity(startAt: number, endAt: number): 'day' | 'hour' {
  const start = shanghaiDateParts(startAt)
  const end = shanghaiDateParts(endAt)
  const sameDay = start.year === end.year && start.month === end.month && start.day === end.day
  return sameDay ? 'hour' : 'day'
}

const activeTab = ref<'list' | 'stats'>('list')
const LOGS_TABS = ['list', 'stats'] as const
const LOGS_ACTIVE_TAB_KEY = 'logs-active-tab'

// 初始 tab（test.md 第 11 条）：优先 route.query.tab（合法用之、显式但非法回退 list），
// 其次 sessionStorage 最近 tab，最后默认 list
function readInitialLogsTab(routeTab: unknown): 'list' | 'stats' {
  if (typeof routeTab === 'string') {
    return (LOGS_TABS as readonly string[]).includes(routeTab) ? (routeTab as 'list' | 'stats') : 'list'
  }
  const saved = sessionStorage.getItem(LOGS_ACTIVE_TAB_KEY)
  return saved && (LOGS_TABS as readonly string[]).includes(saved) ? (saved as 'list' | 'stats') : 'list'
}

const rangePreset = ref<'today' | '7d' | '30d' | 'custom'>('today')
const customRange = ref<string[]>([])
const granularity = ref<'day' | 'hour'>('day')
const statsData = ref<TokenStatsData | null>(null)
const statsLoading = ref(false)
const chartEl = ref<HTMLElement | null>(null)
let chart: EChartsType | null = null

// 区间合计读数（feat-A012）：总 Token = 输入+输出合计；命中率 = 缓存合计/输入合计，输入合计 0 显示「—」
const statsSummary = computed(() => {
  const buckets = statsData.value?.buckets ?? []
  let inputTotal = 0
  let outputTotal = 0
  let cachedTotal = 0
  buckets.forEach((bucket) => {
    inputTotal += bucket.inputTokens ?? 0
    outputTotal += bucket.outputTokens ?? 0
    cachedTotal += bucket.cachedTokens ?? 0
  })
  const totalTokens = inputTotal + outputTotal
  const hitRateText = inputTotal > 0 ? `${((cachedTotal / inputTotal) * 100).toFixed(1)}%` : '—'
  return { totalTokens, hitRateText }
})

function isValidCustomRange(): boolean {
  return Array.isArray(customRange.value) && customRange.value.length === 2 && !!customRange.value[0] && !!customRange.value[1]
}

function currentStatsRange(): { startAt: number; endAt: number } {
  const now = Date.now()
  const todayStart = shanghaiDayStartMs(now)
  if (rangePreset.value === 'today') return { startAt: todayStart, endAt: now }
  if (rangePreset.value === '7d') return { startAt: todayStart - 6 * DAY_MS, endAt: now }
  if (rangePreset.value === '30d') return { startAt: todayStart - 29 * DAY_MS, endAt: now }
  if (isValidCustomRange()) {
    return {
      startAt: parseShanghaiDate(customRange.value[0]!),
      endAt: parseShanghaiDate(customRange.value[1]!) + DAY_MS - 1,
    }
  }
  return { startAt: todayStart, endAt: now }
}

const statsRangeLabel = computed(() => {
  const range = currentStatsRange()
  const start = shanghaiDateParts(range.startAt)
  const end = shanghaiDateParts(range.endAt)
  return `${start.year}-${pad2(start.month)}-${pad2(start.day)} ~ ${end.year}-${pad2(end.month)}-${pad2(end.day)}`
})

function onPresetChange() {
  if (rangePreset.value === 'custom') {
    if (isValidCustomRange()) {
      const startAt = parseShanghaiDate(customRange.value[0]!)
      const endAt = parseShanghaiDate(customRange.value[1]!) + DAY_MS - 1
      granularity.value = defaultGranularity(startAt, endAt)
    } else {
      rangePreset.value = 'today'
      const range = currentStatsRange()
      granularity.value = defaultGranularity(range.startAt, range.endAt)
    }
    void loadStats()
    return
  }
  const range = currentStatsRange()
  granularity.value = defaultGranularity(range.startAt, range.endAt)
  void loadStats()
}

function onCustomRangeChange(_dates: unknown, dateStrings: [string, string]) {
  if (!dateStrings[0] || !dateStrings[1]) {
    message.warning('请选择完整的起止日期')
    return
  }
  rangePreset.value = 'custom'
  customRange.value = [dateStrings[0], dateStrings[1]]
  const startAt = parseShanghaiDate(dateStrings[0])
  const endAt = parseShanghaiDate(dateStrings[1]) + DAY_MS - 1
  granularity.value = defaultGranularity(startAt, endAt)
  void loadStats()
}

function onGranularityChange() {
  void loadStats()
}

function onRefreshStats() {
  void loadStats()
}

function renderChart(data: TokenStatsData) {
  if (!chartEl.value) return
  chart ??= initChart(chartEl.value)
  // x 轴标签：区间已在标题给出，轴只留必要部分（feat-A012 复验 E1）——按天 MM-DD，按小时 HH:mm
  const labels = data.buckets.map((bucket) => {
    const raw = bucket.bucket
    if (granularity.value === 'day') {
      return raw.length >= 10 ? raw.slice(5, 10) : raw
    }
    const timeMatch = raw.match(/[T ](\d{2}:\d{2})/)
    return timeMatch ? timeMatch[1] : raw
  })
  const cached = data.buckets.map((bucket) => bucket.cachedTokens ?? 0)
  // 未缓存 = 输入 − 缓存，两段之和恒等于该桶输入；历史 null 计 0；单桶异常（缓存>输入）未缓存段兜底 0，不出现负值柱
  const uncached = data.buckets.map((bucket) => Math.max(0, (bucket.inputTokens ?? 0) - (bucket.cachedTokens ?? 0)))
  chart.setOption(
    {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: {
        data: ['缓存输入', '未缓存输入', '输出'],
        top: 0,
        textStyle: { color: '#40544a' },
      },
      grid: { left: 56, right: 20, top: 44, bottom: 46 },
      xAxis: {
        type: 'category',
        data: labels,
        axisLabel: { rotate: labels.length > 10 ? 45 : 0, color: '#718078' },
        axisLine: { lineStyle: { color: '#d7e0d7' } },
        axisTick: { alignWithLabel: true },
      },
      yAxis: {
        type: 'value',
        name: 'Token',
        nameTextStyle: { color: '#849189' },
        axisLabel: { color: '#718078', formatter: (value: number) => value.toLocaleString('en-US') },
        splitLine: { lineStyle: { color: '#edf0eb' } },
      },
      series: [
        {
          name: '缓存输入',
          type: 'bar',
          stack: 'total',
          barMaxWidth: 26,
          data: cached,
          itemStyle: { color: '#8ab6e8' },
        },
        {
          name: '未缓存输入',
          type: 'bar',
          stack: 'total',
          barMaxWidth: 26,
          data: uncached,
          itemStyle: { color: '#8a63d2' },
        },
        {
          name: '输出',
          type: 'bar',
          stack: 'total',
          barMaxWidth: 26,
          data: data.buckets.map((bucket) => bucket.outputTokens),
          itemStyle: { color: '#2e7d57', borderRadius: [4, 4, 0, 0] },
        },
      ],
    },
    { notMerge: true },
  )
}

async function loadStats() {
  const range = currentStatsRange()
  statsLoading.value = true
  try {
    const data = await fetchTokenStats({ startAt: range.startAt, endAt: range.endAt, granularity: granularity.value })
    statsData.value = data
    // 区间过大等服务端会降级粒度，前端以响应为准
    granularity.value = data.granularity
    await nextTick()
    renderChart(data)
    chart?.resize()
  } catch (err) {
    message.error(getErrorMessage(err))
  } finally {
    statsLoading.value = false
  }
}

function onWindowResize() {
  chart?.resize()
}

watch(activeTab, async (tab) => {
  sessionStorage.setItem(LOGS_ACTIVE_TAB_KEY, tab)
  void router.replace({ path: '/logs', query: { ...route.query, tab } })
  await nextTick()
  if (tab !== 'stats') return
  if (statsData.value) {
    renderChart(statsData.value)
    chart?.resize()
  } else {
    void loadStats()
  }
})

const route = useRoute()
const router = useRouter()

onMounted(async () => {
  activeTab.value = readInitialLogsTab(route.query.tab)
  const today = shanghaiDateString(Date.now())
  customRange.value = [today, today]
  window.addEventListener('resize', onWindowResize)
  // 灰色区清单行内跳转（feat-A013 §4.2）：/logs?traceId=xxx → 精确过滤并自动展开该行明细
  const entryTraceId = typeof route.query.traceId === 'string' ? route.query.traceId.trim() : ''
  if (entryTraceId) {
    query.traceId = entryTraceId
    await loadList()
    const matched = rows.value.some((row) => row.traceId === entryTraceId)
    if (matched) {
      expandedRowKeys.value = [entryTraceId]
      void ensureDetail(entryTraceId)
      await nextTick()
      document.querySelector(`[data-row-key="${entryTraceId}"]`)?.scrollIntoView({ block: 'center' })
    }
  } else {
    void loadList()
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onWindowResize)
  chart?.dispose()
  chart = null
})
</script>
<style scoped>
.logs-page {
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

.logs-tabs {
  margin-top: 4px;
}

.tab-label {
  font-weight: 600;
  letter-spacing: 0.04em;
}

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

.query-control {
  width: 190px;
}

.query-select {
  width: 120px;
}

.query-range {
  width: 232px;
}

.query-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

.preset-radios {
  margin-right: 4px;
}

.table-card,
.stats-card {
  margin-top: 16px;
  padding: 16px 18px;
  border: 1px solid #d9e1d8;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.9);
}

.log-type-tag {
  border-radius: 6px;
  font-size: 12px;
}


.cell-ellipsis {
  display: block;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}


.token-cell {
  cursor: help;
  font-variant-numeric: tabular-nums;
}

.dur-total {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.dur-simple {
  color: #40544a;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.tool-name {
  font-family: 'SFMono-Regular', Consolas, monospace;
  font-size: 12px;
}

.content-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.modal-json {
  max-height: 62vh;
  overflow: auto;
}

/* ── 行展开明细 ── */

.detail-panel {
  min-height: 120px;
  padding: 14px 16px 4px;
}

.detail-section {
  margin-bottom: 18px;
}

.detail-section-title {
  margin: 0 0 10px;
  color: #163c32;
  font-size: 13px;
  font-weight: 600;
}

.sub-empty {
  padding: 14px 0 4px;
  color: #9aa69e;
  font-size: 12px;
}

.sub-table {
  border: 1px solid #e3e9e2;
  border-radius: 12px;
  overflow: hidden;
}

.sub-meta {
  margin-top: 2px;
  color: #94a099;
  font-size: 11px;
  line-height: 1.5;
}

/* ── 缓存判定卡片（feat-A013）── */

.cache-card {
  padding: 12px 14px;
  border: 1px solid #e3e9e2;
  border-radius: 12px;
  background: #fafbf9;
}

.cache-card-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.cache-badge-tag {
  margin-inline-end: 0;
}

.cache-judge-time {
  color: #94a099;
  font-size: 12px;
}

.cache-card-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cache-meta-row {
  display: flex;
  gap: 10px;
  font-size: 12px;
  line-height: 1.7;
}

.cache-meta-label {
  flex: none;
  width: 84px;
  color: #7b8a80;
}

.cache-meta-value {
  color: #163c32;
  word-break: break-all;
}

.cache-sim {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

/* 灰色区「差点命中谁」：高亮最相近条目原文 */
.cache-nearest-em {
  padding: 0 4px;
  border-radius: 4px;
  background: #fffbe6;
  color: #d48806;
  font-weight: 600;
}

.cache-formula-line {
  margin-top: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid #e3e9e2;
  color: #40544a;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  line-height: 1.6;
}

.cache-mark-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}

.cache-mark-hint {
  color: #7b8a80;
  font-size: 12px;
}

.cache-mark-input {
  width: 160px;
}

.cache-mark-disabled-hint {
  color: #b3bfb6;
  font-size: 11px;
}

/* 缓存命中：检索诊断区替代展示（§4.2，不展示空诊断） */
.cache-no-retrieval {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid #b7eb8f;
  border-radius: 10px;
  background: #f6ffed;
}

.cache-no-retrieval-hint {
  color: #40544a;
  font-size: 12px;
}

.err-text {
  color: #cf1322;
}

.llm-seq {
  color: #b17837;
  font-weight: 600;
}

.answer-pre {
  margin: 0;
  padding: 12px 14px;
  border: 1px solid #e3e9e2;
  border-radius: 10px;
  background: #fbfdfa;
  color: #40544a;
  font-family: 'Noto Sans SC', 'Segoe UI', sans-serif;
  font-size: 13px;
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-word;
}

.content-block {
  margin-bottom: 8px;
}

.content-block:last-child {
  margin-bottom: 0;
}

.content-label {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
  color: #849189;
  font-size: 11px;
  font-weight: 600;
}

.json-pre {
  max-height: 260px;
  margin: 0;
  padding: 10px 12px;
  overflow: auto;
  border: 1px solid #e3e9e2;
  border-radius: 10px;
  background: #fbfdfa;
  color: #40544a;
  font-family: 'SFMono-Regular', Consolas, 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}

.json-viewer-wrap {
  border: 1px solid #e3e9e2;
  border-radius: 10px;
  background: #fbfdfa;
  color: #40544a;
  padding: 10px 12px;
  overflow: auto;
}

.json-viewer-wrap :deep(.vjs-value-string) {
  white-space: pre-wrap;
}

.sub-viewer {
  max-height: 320px;
}

/* ── Token 统计 ── */

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
  .query-control,
  .query-range {
    width: 100%;
  }
}
</style>

<style>
.line-tooltip {
  font-size: 12px;
  line-height: 1.9;
  white-space: pre-line;
}

.line-tooltip-indent {
  padding-left: 1em;
}

.token-tooltip {
  font-size: 12px;
  line-height: 1.9;
}

.token-tooltip-title {
  margin-bottom: 2px;
  font-weight: 600;
}

/* 类型列 hover 缓存行（feat-A013 §4.2）：命中绿 / 未命中灰 */
.cache-line-hit {
  color: #389e0d;
}

.cache-line-miss {
  color: #8c8c8c;
}
</style>
