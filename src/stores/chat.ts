import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getErrorMessage, sendChatMessage } from '../api/client'

export interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  createdAt: Date
}

export const useChatStore = defineStore('chat', () => {
  const messages = ref<ChatMessage[]>([])
  const loading = ref(false)
  const error = ref('')

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
      const answer = await sendChatMessage(trimmed)
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

  return { messages, loading, error, sendMessage, clearMessages }
})
