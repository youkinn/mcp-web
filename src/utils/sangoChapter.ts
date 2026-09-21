import type { SangoChapterChunk, SangoChapterData } from '../api/client'

// ── 三国演义原文阅读器：纯逻辑（feat-A010）──
// 收敛判断 / 匹配 / 格式化逻辑便于 node:test 单测，组件只做渲染与交互。

export const SANGO_CHAPTER_MIN = 1
export const SANGO_CHAPTER_MAX = 120

/** 片段短号：取 chunkId 尾段（如 sanguo-yanyi:0073:c0021 → c0021），与候选分数表一一对应 */
export function shortChunkId(chunkId: string): string {
  const tail = chunkId.split(':').pop()
  return tail && tail.length > 0 ? tail : chunkId
}

/** 回号合法性（底部跳转输入用）：1~120 的整数 */
export function isValidChapter(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= SANGO_CHAPTER_MIN && value <= SANGO_CHAPTER_MAX
}

/** citation.text 精确匹配定位：chunks[].text.includes(citation.text)，同回重复文本落第一处；匹配不到返回 null */
export function findChunkByText(chunks: SangoChapterChunk[], text: string): SangoChapterChunk | null {
  return chunks.find((chunk) => chunk.text.includes(text)) ?? null
}

/** 阅读器定位：目标行在滚动容器内垂直居中所需的 scrollTop（越界归 0，不产生负值） */
export function centeredScrollTop(itemOffsetTop: number, itemHeight: number, viewportHeight: number): number {
  return Math.max(0, itemOffsetTop - viewportHeight / 2 + itemHeight / 2)
}

/** 聊天侧入口目标：命中则带 chunkId 定位，匹配不到不传 chunkId（阅读器停正文顶部、不报错） */
export interface ChapterReaderTarget {
  chapter: number
  chapterTitle: string
  chunkId?: string
}

export function buildCitationReaderTarget(
  chapter: number,
  title: string,
  text: string,
  data: SangoChapterData,
): ChapterReaderTarget {
  const chunk = findChunkByText(data.chunks, text)
  return { chapter, chapterTitle: title, chunkId: chunk?.chunkId }
}
