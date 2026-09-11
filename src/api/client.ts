import axios from 'axios'

export interface ChatResponse {
  answer: string
}

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 30_000,
  headers: {
    'Content-Type': 'application/json',
  },
})

export async function sendChatMessage(message: string): Promise<string> {
  const { data } = await apiClient.post<ChatResponse>('/chat', { message })
  return data.answer
}

export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.response?.data?.message) return error.response.data.message
    if (error.code === 'ECONNABORTED') return '请求超时，请稍后重试。'
    if (!error.response) return '无法连接到 mcp-orchestrator，请确认后端服务已启动。'
  }
  return '请求失败，请稍后重试。'
}
