declare module 'vue-json-pretty' {
  import type { DefineComponent } from 'vue'

  const VueJsonPretty: DefineComponent<
    {
      data?: unknown
      theme?: 'light' | 'dark'
      deep?: number
      showLength?: boolean
      collapsedOnClickBrackets?: boolean
      [key: string]: unknown
    },
    Record<string, never>,
    unknown
  >

  export default VueJsonPretty
}
