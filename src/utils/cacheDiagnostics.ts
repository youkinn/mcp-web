import type { CacheLogRecord } from '../api/client'

// ── 缓存判定展示：格式化与区间着色（feat-A013）──
// 判定 / 格式化逻辑收敛在本模块，便于 node:test 单测；组件只做渲染（口径见接口文档 §3.7 / §3.10 / §4.2）。

// 低相似下沿 0.80 本期固定写死、不对外配置（参考 bug-00022 实测留余量）；唯一可配置阈值为命中线 hitLine
export const CACHE_LOW_SIM_LINE = 0.8

/** 相似度分区：低相似 < 0.80 / 灰色区 [0.80, hitLine) / 高置信 ≥ hitLine；null（池空）落低相似档 */
export type CacheZone = 'low' | 'gray' | 'high'

export function cacheZone(value: number | null, hitLine: number): CacheZone {
  if (value === null || value === undefined) return 'low'
  if (value < CACHE_LOW_SIM_LINE) return 'low'
  if (value < hitLine) return 'gray'
  return 'high'
}

// 三色为桶区间着色：桶用其下沿归区（0.80 / 命中线恰为 0.02 桶边界，着色不跨桶），与行分类无关
export function bucketZone(lower: number, hitLine: number): CacheZone {
  return cacheZone(lower, hitLine)
}

export const CACHE_ZONE_COLORS: Record<CacheZone, string> = {
  low: '#8ab6e8',
  gray: '#f0bf4c',
  high: '#2e7d57',
}

/** 相似度 4 位小数（命中解释 / 灰色区清单口径）；null → —（池空） */
export function formatSimilarity(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return value.toFixed(4)
}

/** 命中线展示：去尾零（0.92 → 0.92，0.9821 → 0.9821） */
export function formatHitLine(value: number): string {
  return String(parseFloat(value.toFixed(4)))
}

export const CACHE_REASON_LABELS: Record<CacheLogRecord['reason'], string> = {
  hit: '命中',
  'miss-low': '低相似未命中',
  'miss-gray': '灰色区未命中',
  'miss-tie': '歧义未命中',
  'miss-focus': '焦点拒判未命中',
}

export interface CacheBadge {
  text: string
  color: string
}

/** 缓存判定卡片徽标：命中绿标；未命中灰 / 黄标（低相似灰、灰色区黄），歧义 / 焦点拒判橙标 */
export function cacheBadge(cache: CacheLogRecord): CacheBadge {
  switch (cache.reason) {
    case 'hit':
      return { text: '缓存命中，未走检索', color: 'green' }
    case 'miss-low':
      return { text: '未命中（低相似）', color: 'default' }
    case 'miss-gray':
      return { text: '未命中（灰色区）· 差点命中谁', color: 'gold' }
    case 'miss-tie':
      return { text: '歧义，不命中', color: 'orange' }
    case 'miss-focus':
      return { text: '焦点拒判，不命中', color: 'orange' }
  }
}

/**
 * 命中解释算式代入（对齐 A009 最终分 hover 口径，禁止只给最终数字）：
 * 命中 `最高相似度 0.9821 ≥ 命中线 0.92 → 命中`；
 * 灰色区 `最高相似度 0.8512 < 命中线 0.92 → 未命中（灰色区）`；
 * 歧义 `≥ 命中线候选 2 条 → 歧义，不命中`；
 * 焦点拒判 `最高相似度 0.9550 ≥ 命中线 0.92，焦点不一致 → 不命中`。
 */
export function cacheFormulaText(cache: CacheLogRecord): string {
  const hitLine = formatHitLine(cache.hitLine)
  const sim = formatSimilarity(cache.similarity)
  switch (cache.reason) {
    case 'hit':
      return `最高相似度 ${sim} ≥ 命中线 ${hitLine} → 命中`
    case 'miss-gray':
      return `最高相似度 ${sim} < 命中线 ${hitLine} → 未命中（灰色区）`
    case 'miss-low':
      return `最高相似度 ${sim} < 命中线 ${hitLine} → 未命中（低相似）`
    case 'miss-tie':
      return cache.tieHits !== null
        ? `≥ 命中线候选 ${cache.tieHits} 条 → 歧义，不命中`
        : '≥ 命中线候选多条 → 歧义，不命中'
    case 'miss-focus':
      return `最高相似度 ${sim} ≥ 命中线 ${hitLine}，焦点不一致 → 不命中`
  }
}

/** 日志列表行类型标签 hover 一行（§4.2）：缓存命中（绿）/ 缓存未命中（灰）；cacheHit 为 null 无标 */
export function cacheHitTooltipText(cacheHit: number | null | undefined): string | null {
  if (cacheHit === null || cacheHit === undefined) return null
  return cacheHit === 1 ? '缓存命中' : '缓存未命中'
}
