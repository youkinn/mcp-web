<template>
  <main class="weather-page">
    <div class="page-shell">
      <header class="site-header">
        <RouterLink to="/" class="brand">
          <span class="brand-mark">M</span>
          <span class="brand-copy">
            <span class="brand-name">MCP WORKSPACE</span>
            <span class="brand-caption">Chat gateway</span>
          </span>
        </RouterLink>
        <a-tag color="green">服务就绪</a-tag>
      </header>

      <section class="content-grid">
        <section class="chat-card">
          <div class="chat-header">
            <div>
              <h2>{{ pageTitle }}</h2>
              <p>由 mcp-orchestrator 编排对话与工具调用</p>
            </div>
            <div class="header-actions">
              <a-tag v-if="chatStore.modeLabel" color="orange" class="header-mode-tag">{{ chatStore.modeLabel }}</a-tag>
              <a-button v-if="hasMessages" type="text" size="small" @click="chatStore.clearMessages">清空</a-button>
            </div>
          </div>

          <div class="mode-tags">
            <a-tag
              :checkable="true"
              :checked="chatStore.mode === 'weather'"
              color="blue"
              class="mode-select-tag"
              @change="onWeatherTagChange"
            >天气</a-tag>
            <a-tag
              :checkable="true"
              :checked="chatStore.mode === 'sango'"
              color="orange"
              class="mode-select-tag"
              @change="onSangoTagChange"
            >风云三国</a-tag>
            <span class="mode-tags-hint">未选择时默认为普通问答</span>
          </div>

          <section v-if="chatStore.mode === 'sango' && panelVisible" class="sango-panel">
            <div class="sango-panel-head">
              <span class="sango-panel-title">风云三国常见服务</span>
              <a-button type="text" size="small" class="sango-panel-close" @click="panelVisible = false">✕</a-button>
            </div>
            <div class="sango-panel-actions">
              <a-button
                class="sango-service-btn"
                :type="chatStore.sangoService === 'knowledge' ? 'primary' : 'default'"
                @click="chatStore.setSangoService('knowledge')"
              >问题查询</a-button>
              <a-button
                class="sango-service-btn"
                :type="chatStore.sangoService === 'random' ? 'primary' : 'default'"
                @click="chatStore.setSangoService('random')"
              >随机一题</a-button>
            </div>
          </section>

          <div class="message-list">
            <div v-if="!hasMessages" class="empty-state">
              <div class="empty-icon">{{ emptyIcon }}</div>
              <p>{{ emptyTitle }}</p>
              <span>{{ emptyHint }}</span>
            </div>
            <article v-for="item in chatStore.messages" :key="item.id" class="message-row" :class="{ 'is-user': item.role === 'user' }">
              <div class="message-bubble" :class="item.role === 'user' ? 'user-bubble' : 'assistant-bubble'">
                <p>{{ item.content }}</p>
                <div class="message-meta">
                  <span>{{ formatTime(item.createdAt) }}</span>
                  <button v-if="item.role === 'assistant'" @click="copyMessage(item.content)">复制</button>
                </div>
              </div>
            </article>
            <div v-if="chatStore.loading" class="loading-state"><a-spin size="small" /> {{ loadingText }}</div>
          </div>

          <a-alert v-if="chatStore.error" class="chat-error" type="error" show-icon :message="chatStore.error" />
          <form class="composer" @submit.prevent="submit">
            <a-textarea v-model:value="draft" :bordered="false" :auto-size="{ minRows: 1, maxRows: 4 }" :placeholder="placeholder" @keydown.enter.exact.prevent="submit" />
            <a-button html-type="submit" type="primary" :loading="chatStore.loading" :disabled="!draft.trim()" class="send-button">发送</a-button>
          </form>
          <p class="composer-hint">{{ composerHint }}</p>
        </section>
      </section>

      <footer class="site-footer"><span>Weather MCP Server</span><span>·</span><span>stdio → client → web</span></footer>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { message } from 'ant-design-vue'
import { useChatStore } from '../stores/chat'

const chatStore = useChatStore()
const draft = ref('')
const panelVisible = ref(true)

const hasMessages = computed(() => chatStore.messages.length > 0)

const isSangoKnowledge = computed(() => chatStore.mode === 'sango' && chatStore.sangoService === 'knowledge')
const isSangoRandom = computed(() => chatStore.mode === 'sango' && chatStore.sangoService === 'random')
const isSangoUnselected = computed(() => chatStore.mode === 'sango' && !chatStore.sangoService)

const pageTitle = computed(() => {
  if (chatStore.mode === 'sango') return '风云三国助手'
  if (chatStore.mode === 'weather') return '天气助手'
  return '智能助手'
})

const emptyIcon = computed(() => {
  if (isSangoRandom.value) return '🎲'
  if (isSangoKnowledge.value) return '📚'
  if (isSangoUnselected.value) return '⚔️'
  if (chatStore.mode === 'weather') return '🌤'
  return '💬'
})

const emptyTitle = computed(() => {
  if (isSangoRandom.value) return '发送「随机一题」开始答题'
  if (isSangoKnowledge.value) return '输入风云三国问题快速查答案'
  if (isSangoUnselected.value) return '请先选择常用服务子模块'
  if (chatStore.mode === 'weather') return '从一个天气问题开始'
  return '从一个问题开始'
})

const emptyHint = computed(() => {
  if (isSangoRandom.value) return '作答可输入选项字母（A-D）或选项文本'
  if (isSangoKnowledge.value) return '试试询问「夏侯惇的字是什么？」'
  if (isSangoUnselected.value) return '在上方「风云三国常见服务」面板中选择「问题查询」或「随机一题」'
  if (chatStore.mode === 'weather') return '试试询问纽约、洛杉矶等美国城市的天气'
  return '试试直接提问，无需选择模式'
})

const placeholder = computed(() => {
  if (isSangoRandom.value) return '发送「随机一题」开始，作答或输入「答案」…'
  if (isSangoKnowledge.value) return '输入风云三国问题，如「夏侯惇的字是什么？」…'
  if (isSangoUnselected.value) return '先选择「问题查询」或「随机一题」'
  if (chatStore.mode === 'weather') return '输入美国城市名查询天气，如 New York...'
  return '输入问题开始对话…'
})

const loadingText = computed(() => {
  if (isSangoRandom.value) return '正在处理随机一题...'
  if (isSangoKnowledge.value) return '正在从题库查找答案...'
  if (chatStore.mode === 'weather') return '正在查询天气工具...'
  return '正在思考...'
})

const composerHint = computed(() => {
  if (isSangoRandom.value) return '随机一题：先发「随机一题」出题，再作答；支持「答案」查询'
  if (isSangoKnowledge.value) return '知识问答：答案来自题库原文，未收录时会提示'
  if (isSangoUnselected.value) return '选中子模块后聊天将切换至对应模式'
  if (chatStore.mode === 'weather') return '当前仅支持美国城市天气查询，请输入英文城市名'
  return '普通问答：通用对话，不调用天气与题库'
})

function onWeatherTagChange(checked: boolean) {
  if (checked) {
    chatStore.setMode('weather')
    panelVisible.value = true
    return
  }
  if (chatStore.mode === 'weather') {
    chatStore.setMode('general')
  }
}

function onSangoTagChange(checked: boolean) {
  if (checked) {
    chatStore.setMode('sango')
    panelVisible.value = true
    return
  }
  if (chatStore.mode !== 'sango') return
  if (!panelVisible.value) {
    panelVisible.value = true // 面板已收起时，点击标签重新展开
    return
  }
  chatStore.setMode('general')
}

async function submit() {
  const content = draft.value.trim()
  if (!content || chatStore.loading) return
  if (chatStore.mode === 'sango' && !chatStore.sangoService) {
    message.warning('请先选择「问题查询」或「随机一题」')
    return
  }
  draft.value = ''
  await chatStore.sendMessage(content)
}

function copyMessage(content: string) {
  navigator.clipboard.writeText(content)
  message.success('已复制回答')
}

function formatTime(date: Date) {
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}
</script>

<style scoped>
.weather-page {
  min-height: 100vh;
  overflow: hidden;
  background: #f5f7f2;
  color: #1d2924;
}

.content-grid {
  display: grid;
  grid-template-columns: minmax(360px, 780px);
  justify-content: center;
  flex: 1;
  padding: 64px 0;
}

.chat-card {
  padding: 24px;
  border: 1px solid #d9e1d8;
  border-radius: 24px;
  background: rgba(255, 255, 255, .9);
  box-shadow: 0 24px 70px rgba(35, 66, 51, .1);
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 16px;
  border-bottom: 1px solid #edf0eb;
}

.chat-header h2 {
  font-family: Georgia, 'Times New Roman', serif;
  margin: 0;
  color: #163c32;
  font-size: 22px;
}

.chat-header p {
  margin: 4px 0 0;
  color: #849189;
  font-size: 12px;
}

.message-list {
  min-height: 250px;
  padding: 20px 0 0;
}

.empty-state {
  display: grid;
  min-height: 230px;
  place-items: center;
  text-align: center;
}

.empty-icon {
  display: grid;
  width: 56px;
  height: 56px;
  margin: 0 auto 16px;
  place-items: center;
  border-radius: 16px;
  background: #edf4ec;
  color: #2e6d56;
  font-size: 24px;
}

.empty-state p {
  margin: 0;
  color: #496057;
  font-size: 14px;
  font-weight: 600;
}

.empty-state span {
  display: block;
  margin-top: 4px;
  color: #9aa69e;
  font-size: 12px;
}

.message-row {
  display: flex;
  margin-bottom: 16px;
}

.message-row.is-user {
  justify-content: flex-end;
}

.message-bubble {
  max-width: 88%;
  padding: 12px 16px;
  border-radius: 16px;
  font-size: 14px;
  line-height: 1.7;
}

.message-bubble p {
  margin: 0;
  white-space: pre-wrap;
}

.user-bubble {
  border-bottom-right-radius: 4px;
  background: #163c32;
  color: #fff;
}

.assistant-bubble {
  border-bottom-left-radius: 4px;
  background: #f1f5f0;
  color: #40544a;
}

.message-meta {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin-top: 8px;
  opacity: .6;
  font-size: 10px;
}

.message-meta button {
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.message-meta button:hover {
  text-decoration: underline;
}

.loading-state {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #839189;
  font-size: 12px;
}

.chat-error {
  margin-top: 16px;
}

.composer {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  margin-top: 20px;
  padding: 8px;
  border: 1px solid #dce5dc;
  border-radius: 16px;
  background: #fafcf9;
}

.composer:focus-within {
  border-color: #8cab92;
}

.composer :deep(.ant-input) {
  background: transparent;
  resize: none;
}

.send-button {
  height: 40px;
  border-radius: 12px;
  background: #b17837;
}

.send-button:hover {
  background: #8f5e2c;
}

.composer-hint {
  margin: 12px 0 0;
  color: #a2ada5;
  font-size: 11px;
  text-align: center;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-mode-tag {
  margin: 0;
}

.mode-tags {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 14px 0 0;
}

.mode-select-tag {
  margin: 0;
  cursor: pointer;
}

.mode-tags-hint {
  margin-left: 6px;
  color: #a2ada5;
  font-size: 11px;
}

.sango-panel {
  margin-top: 14px;
  padding: 12px 16px;
  border: 1px solid #eadfc9;
  border-radius: 14px;
  background: #fdf9f0;
}

.sango-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sango-panel-title {
  color: #7a5a2e;
  font-size: 13px;
  font-weight: 600;
}

.sango-panel-close {
  color: #a2916f;
}

.sango-panel-actions {
  display: flex;
  gap: 10px;
  margin-top: 10px;
}

.sango-service-btn {
  border-radius: 10px;
}

@media (max-width: 900px) {
  .content-grid {
    grid-template-columns: 1fr;
    padding: 48px 0;
  }
}

@media (max-width: 560px) {
  .content-grid {
    padding: 36px 0;
  }

  .chat-card {
    padding: 16px;
    border-radius: 18px;
  }
}
</style>

