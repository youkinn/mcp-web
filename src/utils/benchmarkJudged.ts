import type { BenchmarkResultItem, BenchmarkSummary } from '../api/client'

/**
 * 零锚题口径（bug-00052）：零锚题（无回目锚）未参与判定，通过率分母应为「可判题数」。
 * 后端新字段：summary.judged / summary.noAnchorCount / results[].noAnchor；老快照均缺省，读取侧统一兜底。
 */

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** 可判题数：优先 summary.judged；老快照有 noAnchorCount 无 judged 时按 total - noAnchorCount；都缺按 total */
export function judgedOf(summary: BenchmarkSummary): number {
  if (isFiniteNumber(summary.judged)) return summary.judged
  const total = isFiniteNumber(summary.total) ? summary.total : 0
  if (isFiniteNumber(summary.noAnchorCount)) return Math.max(0, total - summary.noAnchorCount)
  return total
}

/** 零锚（未参与评分）题数：老快照无字段按 0 兜底 */
export function noAnchorCountOf(summary: BenchmarkSummary): number {
  return isFiniteNumber(summary.noAnchorCount) ? summary.noAnchorCount : 0
}

/** 单题是否零锚（未参与评分）：老快照无字段按 false 兜底 */
export function isNoAnchor(item: BenchmarkResultItem): boolean {
  return item.noAnchor === true
}
