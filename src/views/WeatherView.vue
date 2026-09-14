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
              <h2>智能助手</h2>
              <p>由 mcp-orchestrator 编排对话与工具调用</p>
            </div>
            <div class="header-actions">
              <a-button v-if="hasMessages" type="text" size="small" @click="chatStore.clearMessages">清空</a-button>
            </div>
          </div>

          <div ref="messageList" class="message-list" :class="{ 'is-panel-open': sangoPanelOpen }">
            <article v-for="item in chatStore.messages" :key="item.id" class="message-row"
              :class="{ 'is-user': item.role === 'user' }">
              <div class="message-bubble" :class="item.role === 'user' ? 'user-bubble' : 'assistant-bubble'">
                <p>{{ item.content }}</p>
                <div class="message-meta">
                  <span>{{ formatTime(item.createdAt) }}</span>
                  <button v-if="item.role === 'assistant'" @click="copyMessage(item.content)">复制</button>
                </div>
              </div>
            </article>
            <div v-if="chatStore.loading" class="loading-state"><a-spin size="small" />正在思考...</div>
          </div>

          <a-alert v-if="chatStore.error" class="chat-error" type="error" show-icon :message="chatStore.error" />
          <div class="composer-area">
            <section v-if="sangoPanelOpen" class="sango-panel">
              <div class="sango-panel-head">
                <span class="sango-panel-title">风云三国常见服务</span>
                <button type="button" class="sango-panel-close" @click="panelVisible = false">✕</button>
              </div>
              <div class="sango-panel-actions">
                <button type="button" class="sango-service-card"
                  :class="{ 'is-active': chatStore.sangoService === 'knowledge' }"
                  @click="selectSangoService('knowledge')">
                  <span class="sango-service-icon">📚</span>
                  <span class="sango-service-name">问题查询</span>
                  <span class="sango-service-desc">输入问题快速查答案</span>
                </button>
                <button type="button" class="sango-service-card"
                  :class="{ 'is-active': chatStore.sangoService === 'random' }" @click="selectSangoService('random')">
                  <span class="sango-service-icon">🎲</span>
                  <span class="sango-service-name">随机一题</span>
                  <span class="sango-service-desc">随机出题、作答判题，支持「答案」</span>
                </button>
              </div>
            </section>

            <div class="composer-box">
              <div class="mode-tags">
                <a-checkable-tag :checked="chatStore.mode === 'weather'" class="mode-select-tag"
                  @change="onWeatherTagChange">天气</a-checkable-tag>
                <a-checkable-tag :checked="chatStore.mode === 'sango'" class="mode-select-tag"
                  @change="onSangoTagChange">风云三国</a-checkable-tag>
                <span class="mode-tags-hint">未选择时由助手自动判断：天气 / 风云三国 / 自由问答</span>
              </div>
              <form class="composer" @submit.prevent="submit">
                <div class="input-scope">
                  <a-tag v-for="tag in activeModeTags" :key="tag.key" closable class="input-mode-tag"
                    @close="onModeTagClose(tag)">
                    {{ tag.label }}
                  </a-tag>
                  <div ref="customInput" class="custom-input" contenteditable="true"
                    data-placeholder="请输入您的问题，Shift+Enter换行" @input="onCustomInput"
                    @keydown.enter.exact.prevent="onComposerEnter" @paste="onComposerPaste"></div>
                </div>
                <a-button html-type="submit" type="primary" :loading="chatStore.loading" :disabled="!draft.trim()"
                  class="send-button">发送</a-button>
              </form>
            </div>
          </div>
        </section>
      </section>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import { useChatStore, type SangoServiceId } from '../stores/chat'

const chatStore = useChatStore()
const draft = ref('')
const panelVisible = ref(true)
const customInput = ref<HTMLElement | null>(null)
const messageList = ref<HTMLElement | null>(null)

const hasMessages = computed(() => chatStore.messages.length > 0)
const sangoPanelOpen = computed(() => chatStore.mode === 'sango' && panelVisible.value)

watch(
  () => chatStore.messages.length,
  async () => {
    await nextTick()
    if (messageList.value) {
      messageList.value.scrollTop = messageList.value.scrollHeight
    }
  },
)

interface ModeTag {
  key: 'weather' | 'sango' | 'sango-knowledge' | 'sango-random'
  label: string
}

const activeModeTags = computed<ModeTag[]>(() => {
  if (chatStore.mode === 'weather') {
    return [{ key: 'weather', label: '天气' }]
  }
  if (chatStore.mode === 'sango') {
    const tags: ModeTag[] = [{ key: 'sango', label: '风云三国' }]
    if (chatStore.sangoService === 'knowledge') {
      tags.push({ key: 'sango-knowledge', label: '问答模式' })
    } else if (chatStore.sangoService === 'random') {
      tags.push({ key: 'sango-random', label: '随便一题' })
    }
    return tags
  }
  return []
})

function onWeatherTagChange(checked: boolean) {
  if (checked) {
    chatStore.setMode('weather')
    panelVisible.value = true
    return
  }
  if (chatStore.mode === 'weather') {
    chatStore.setMode(null)
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
  chatStore.setMode(null)
}

function selectSangoService(service: SangoServiceId) {
  chatStore.setSangoService(service)
  panelVisible.value = false
}

function onModeTagClose(tag: ModeTag) {
  if (tag.key === 'weather' || tag.key === 'sango') {
    chatStore.setMode(null)
    return
  }
  chatStore.setSangoService(null)
  panelVisible.value = true
}

function onCustomInput(event: Event) {
  draft.value = (event.target as HTMLElement).innerText
}

function onComposerPaste(event: ClipboardEvent) {
  event.preventDefault()
  const text = event.clipboardData?.getData('text/plain') ?? ''
  document.execCommand('insertText', false, text)
}

function onComposerEnter(event: KeyboardEvent) {
  if (event.isComposing) return
  submit()
}

async function submit() {
  const content = draft.value.trim()
  if (!content || chatStore.loading) return
  if (chatStore.mode === 'sango' && !chatStore.sangoService) {
    message.warning('请先选择「问题查询」或「随机一题」')
    return
  }
  draft.value = ''
  if (customInput.value) {
    customInput.value.innerText = ''
  }
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
  height: 100vh;
  overflow: hidden;
  background: #f5f7f2;
  color: #1d2924;
}

.page-shell {
  height: 100%;
  min-height: 0;
}

.content-grid {
  display: grid;
  grid-template-columns: minmax(360px, 780px);
  justify-content: center;
  flex: 1;
  min-height: 0;
  padding: 20px 0;
}

.chat-card {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 24px;
  border: 1px solid #d9e1d8;
  border-radius: 24px;
  background: rgba(255, 255, 255, .9);
  box-shadow: 0 24px 70px rgba(35, 66, 51, .1);
}

.chat-header,
.chat-error,
.composer-area,
.composer-hint {
  flex: 0 0 auto;
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
  flex: 1;
  min-height: 0;
  padding: 20px 6px 0 0;
  overflow-y: auto;
}

.message-list.is-panel-open {
  padding-bottom: 186px;
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

.composer-area {
  position: relative;
  margin-top: 20px;
}

.composer-box {
  border: 1px solid #dce5dc;
  border-radius: 16px;
  background: #fafcf9;
  min-height: 148px;
  overflow: hidden;
}

.composer-box:focus-within {
  border-color: #8cab92;
}

.composer {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 8px 10px;
}

.input-scope {
  display: flex;
  flex: 1;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.custom-input {
  flex: 1;
  min-width: 120px;
  min-height: 64px;
  max-height: 120px;
  padding: 8px 2px 2px;
  overflow-y: auto;
  outline: none;
  white-space: pre-wrap;
  word-break: break-word;
}

.custom-input:empty::before {
  content: attr(data-placeholder);
  color: #a9b4ac;
  pointer-events: none;
}

.input-mode-tag {
  margin: 4px 0 0;
  border-color: #d9e1d8;
  border-radius: 8px;
  background: #f1f5f0;
  color: #163c32;
  font-size: 12px;
}

.send-button {
  position: absolute;
  bottom: 10px;
  right: 10px;
  height: 40px;
  border-radius: 12px;
  background: #b17837;
}

.send-button:hover {
  background: #8f5e2c;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.mode-tags {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid #eef2ee;
  background: #f5f8f4;
}

.mode-select-tag {
  margin: 0;
  padding: 1px 16px;
  border: 1px solid #d9e1d8;
  border-radius: 999px;
  background: #fff;
  color: #40544a;
  font-size: 13px;
  line-height: 26px;
  cursor: pointer;
  user-select: none;
  transition: background .2s, color .2s, border-color .2s;
}

.mode-select-tag:hover {
  border-color: #8cab92;
  color: #163c32;
}

.mode-select-tag.ant-tag-checkable-checked,
.mode-select-tag.ant-tag-checkable-checked:hover {
  border-color: #163c32;
  background: #163c32;
  color: #fff;
}

.mode-tags-hint {
  margin-left: auto;
  color: #a2ada5;
  font-size: 11px;
}

.sango-panel {
  position: absolute;
  right: 0;
  bottom: calc(100% + 12px);
  left: 0;
  z-index: 20;
  padding: 14px 16px 16px;
  border: 1px solid #eadfc9;
  border-radius: 16px;
  background: #fffdf7;
  box-shadow: 0 18px 42px rgba(94, 71, 32, .18);
}

.sango-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.sango-panel-title {
  color: #7a5a2e;
  font-size: 13px;
  font-weight: 600;
}

.sango-panel-close {
  display: grid;
  width: 22px;
  height: 22px;
  padding: 0;
  place-items: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #a2916f;
  cursor: pointer;
}

.sango-panel-close:hover {
  background: #f3e9d3;
}

.sango-panel-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 12px;
}

.sango-service-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 12px 14px;
  border: 1px solid #efe4cd;
  border-radius: 12px;
  background: #fff;
  text-align: left;
  cursor: pointer;
  transition: background .2s, border-color .2s, box-shadow .2s;
}

.sango-service-card:hover {
  border-color: #d8bd8a;
  background: #fbf3e3;
}

.sango-service-card.is-active {
  border-color: #b17837;
  background: #f6e9cf;
  box-shadow: inset 0 0 0 1px #b17837;
}

.sango-service-icon {
  display: grid;
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  place-items: center;
  border-radius: 9px;
  border: 1px solid #f0e6d2;
  background: #fbf6ea;
  font-size: 16px;
}

.sango-service-name {
  color: #4a3a20;
  font-size: 14px;
  font-weight: 600;
}

.sango-service-desc {
  color: #a2916f;
  font-size: 12px;
}

@media (max-width: 900px) {
  .content-grid {
    grid-template-columns: 1fr;
    padding: 16px 0;
  }
}

@media (max-width: 560px) {
  .content-grid {
    padding: 12px 0;
  }

  .chat-card {
    padding: 16px;
    border-radius: 18px;
  }

  .message-list.is-panel-open {
    padding-bottom: 300px;
  }

  .sango-panel-actions {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
