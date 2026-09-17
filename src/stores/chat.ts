import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { getErrorMessage, sendChatMessage, sendSangoRandom } from '../api/client'

// 标签与子服务是纯前端 UX 状态（能力可发现性、后续模板挂靠），不再进请求体
export type ChatMode = 'weather' | 'sango' | 'sango-novel'
export type SangoServiceId = 'knowledge' | 'random'

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
  const mode = ref<ChatMode | null>(null)
  const sangoService = ref<SangoServiceId | null>(null)
  const sessionId = ref(buildSessionId())

  const modeLabel = computed<string | null>(() => {
    if (mode.value === 'sango-novel') return '三国演义-原著解读'
    if (mode.value !== 'sango' || !sangoService.value) return null
    return sangoService.value === 'knowledge' ? '风云三国-知识问答' : '风云三国-随机一题'
  })

  // 只有「风云三国-随机一题」是确定性本地命令，走独立端点；其余输入一律走统一对话入口
  const usesSangoRandom = computed(() => mode.value === 'sango' && sangoService.value === 'random')

  function resetChatSession() {
    messages.value = []
    error.value = ''
    sessionId.value = buildSessionId()
  }

  function setMode(next: ChatMode | null) {
    if (mode.value === next) return
    mode.value = next
    if (next !== 'sango') {
      sangoService.value = null
    }
    resetChatSession()
  }

  function setSangoService(service: SangoServiceId | null) {
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
      let answer: string
      if (usesSangoRandom.value) {
        answer = await sendSangoRandom(trimmed, sessionId.value)
      } else if (mode.value === "sango" && sangoService.value === "knowledge") {
        answer = await sendChatMessage(trimmed, "sango")
      } else if (mode.value === "sango-novel") {
        answer = await sendChatMessage(trimmed, "sango-novel")
      } else {
        answer = await sendChatMessage(trimmed)
      }
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
