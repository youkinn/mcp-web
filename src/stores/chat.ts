import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  getErrorMessage,
  sendChatMessage,
  type ChatRequestOptions,
  type ChatScenario,
  type SangoService,
} from '../api/client'

export interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  createdAt: Date
}

function buildSessionId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export const useChatStore = defineStore('chat', () => {
  const messages = ref<ChatMessage[]>([])
  const loading = ref(false)
  const error = ref('')
  const mode = ref<ChatScenario>('general')
  const sangoService = ref<SangoService | null>(null)
  const sessionId = ref('')

  const modeLabel = computed<string | null>(() => {
    if (mode.value !== 'sango' || !sangoService.value) return null
    return sangoService.value === 'knowledge' ? '风云三国-知识问答' : '风云三国-随机一题'
  })

  function buildChatOptions(): ChatRequestOptions {
    if (mode.value === 'weather') return { scenario: 'weather' }
    if (mode.value === 'sango' && sangoService.value) {
      return { scenario: 'sango', service: sangoService.value, sessionId: sessionId.value }
    }
    return {} // general: 只发 message，缺省 scenario
  }

  function resetChatSession() {
    messages.value = []
    error.value = ''
    sessionId.value = buildSessionId()
  }

  function setMode(next: ChatScenario) {
    if (mode.value === next) return
    mode.value = next
    if (next !== 'sango') {
      sangoService.value = null
    }
    resetChatSession()
  }

  function setSangoService(service: SangoService) {
    if (sangoService.value === service) return
    sangoService.value = service
    resetChatSession()
  }

  async function sendMessage(content: string) {
    const trimmed = content.trim()
    if (!trimmed || loading.value) return

    error.value = ''
    messages.value.push({
      id: Date.now(),
      role: 'user',
      content: trimmed,
      createdAt: new Date(),
    })
    loading.value = true

    try {
      const answer = await sendChatMessage(trimmed, buildChatOptions())
      messages.value.push({
        id: Date.now() + 1,
        role: 'assistant',
        content: answer,
        createdAt: new Date(),
      })
    } catch (requestError) {
      error.value = getErrorMessage(requestError)
    } finally {
      loading.value = false
    }
  }

  function clearMessages() {
    messages.value = []
    error.value = ''
  }

  return {
    messages,
    loading,
    error,
    mode,
    sangoService,
    sessionId,
    modeLabel,
    sendMessage,
    clearMessages,
    setMode,
    setSangoService,
  }
})
