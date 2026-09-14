import axios from 'axios'

export interface ApiResponse<T> {
  code: number
  data: T | null
  message: string
}

export interface ChatData {
  answer: string
}

export type ChatScenario = 'general' | 'weather' | 'sango'
export type SangoService = 'knowledge' | 'random'

export interface ChatRequestOptions {
  scenario?: ChatScenario
  service?: SangoService
  sessionId?: string
}

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 30_000,
  headers: {
    'Content-Type': 'application/json',
  },
})

export async function sendChatMessage(message: string, options: ChatRequestOptions = {}): Promise<string> {
  const payload: Record<string, string> = { message }
  if (options.scenario) payload.scenario = options.scenario
  if (options.service) payload.service = options.service
  if (options.sessionId) payload.sessionId = options.sessionId

  const { data } = await apiClient.post<ApiResponse<ChatData>>('/chat', payload)

  if (data.code !== 200 || !data.data) {
    throw new Error(data.message || '请求失败，请稍后重试。')
  }
  return data.data.answer
}

export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.response?.data?.message) return error.response.data.message
    if (error.code === 'ECONNABORTED') return '请求超时，请稍后重试。'
    if (!error.response) return '无法连接到 mcp-orchestrator，请确认后端服务已启动。'
  }
  if (error instanceof Error && error.message) return error.message
  return '请求失败，请稍后重试。'
}
