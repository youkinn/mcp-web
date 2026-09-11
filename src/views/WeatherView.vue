<template>
  <main class="weather-page">
    <div class="page-shell">
      <header class="site-header">
        <RouterLink to="/" class="brand">
          <span class="brand-mark">M</span>
          <span class="brand-copy">
            <span class="brand-name">MCP WORKSPACE</span>
            <span class="brand-caption">Weather tool</span>
          </span>
        </RouterLink>
        <a-tag color="green">服务就绪</a-tag>
      </header>

      <section class="content-grid">
        <section class="chat-card">
          <div class="chat-header">
            <div>
              <h2>天气助手</h2>
              <p>由 mcp-orchestrator 编排 MCP 工具调用</p>
            </div>
            <a-button v-if="hasMessages" type="text" size="small" @click="chatStore.clearMessages">清空</a-button>
          </div>

          <div class="message-list">
            <div v-if="!hasMessages" class="empty-state">
              <div class="empty-icon">🌤</div>
              <p>从一个天气问题开始</p>
              <span>试试询问纽约、洛杉矶等美国城市的天气</span>
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
            <div v-if="chatStore.loading" class="loading-state"><a-spin size="small" /> 正在查询天气工具...</div>
          </div>

          <a-alert v-if="chatStore.error" class="chat-error" type="error" show-icon :message="chatStore.error" />
          <form class="composer" @submit.prevent="submit">
            <a-textarea ref="composer" v-model:value="draft" :bordered="false" :auto-size="{ minRows: 1, maxRows: 4 }" placeholder="输入美国城市名查询天气，如 New York..." @keydown.enter.exact.prevent="submit" />
            <a-button html-type="submit" type="primary" :loading="chatStore.loading" :disabled="!draft.trim()" class="send-button">发送</a-button>
          </form>
          <p class="composer-hint">当前仅支持美国城市天气查询，请输入英文城市名</p>
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
const composer = ref<HTMLTextAreaElement>()

const hasMessages = computed(() => chatStore.messages.length > 0)

async function submit() {
  const content = draft.value.trim()
  if (!content || chatStore.loading) return
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

