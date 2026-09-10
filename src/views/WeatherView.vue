<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { message } from 'ant-design-vue'
import { useChatStore } from '../stores/chat'

const chatStore = useChatStore()
const draft = ref('')
const composer = ref<HTMLTextAreaElement>()

const hasMessages = computed(() => chatStore.messages.length > 0)

const suggestions = [
  '纽约今天适合地铁通勤吗？',
  '查询 NY 州当前天气预警',
  '查询纽约市未来天气预报',
]

async function submit() {
  const content = draft.value.trim()
  if (!content || chatStore.loading) return
  draft.value = ''
  await chatStore.sendMessage(content)
}

async function useSuggestion(suggestion: string) {
  draft.value = suggestion
  await nextTick()
  composer.value?.focus()
}

function copyMessage(content: string) {
  navigator.clipboard.writeText(content)
  message.success('已复制回答')
}

function formatTime(date: Date) {
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}
</script>

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
        <div class="intro-panel">
          <p class="eyebrow">Weather intelligence</p>
          <h1>把天气问清楚，<em>再出发。</em></h1>
          <p class="intro-copy">通过 MCP Client 连接天气工具，用自然语言获取预报、预警和地铁通勤建议。</p>
          <div class="suggestion-list">
            <button v-for="suggestion in suggestions" :key="suggestion" class="suggestion-chip" @click="useSuggestion(suggestion)">
              {{ suggestion }}
            </button>
          </div>
        </div>

        <section class="chat-card">
          <div class="chat-header">
            <div>
              <h2>天气助手</h2>
              <p>由 mcp-client 处理请求并调用 MCP 工具</p>
            </div>
            <a-button v-if="hasMessages" type="text" size="small" @click="chatStore.clearMessages">清空</a-button>
          </div>

          <div class="message-list">
            <div v-if="!hasMessages" class="empty-state">
              <div class="empty-icon">⌁</div>
              <p>从一个天气问题开始</p>
              <span>试试左侧的快捷提问</span>
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
            <a-textarea ref="composer" v-model:value="draft" :bordered="false" :auto-size="{ minRows: 1, maxRows: 4 }" placeholder="输入你的天气问题..." @keydown.enter.exact.prevent="submit" />
            <a-button html-type="submit" type="primary" :loading="chatStore.loading" :disabled="!draft.trim()" class="send-button">发送</a-button>
          </form>
          <p class="composer-hint">请确认 mcp-client Web API 已运行</p>
        </section>
      </section>

      <footer class="site-footer"><span>Weather MCP Server</span><span>·</span><span>stdio → client → web</span></footer>
    </div>
  </main>
</template>
