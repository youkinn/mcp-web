import type { BenchmarkResultItem, BenchmarkSummary } from '../api/client'

/**
 * 组判分口径（feat-A018 story-03）：judge=group 的评测集（events）按「组内首段名次」判分。
 * - 分档：组内首段进 1–5 / 6–10 / 11–50 / 未进池（firstRank = 0）
 * - 主判据 cover@5 = sumHits5 / sumCap5；单题 cover = hits5 / min(5, segCount)
 * - 未进池分两类：桥未命中（bridgeHit=false）/ 并池后掉窗（bridgeHit=true）
 * 锚集（judge=anchor，A015 老快照）不带这些字段，读取侧一律显示「—」，不显示 undefined / NaN。
 */

export type GroupStatusBucket = 'hit5' | 'hit10' | 'hit50' | 'miss'

/** 未进池归因：桥未命中 / 并池后掉窗 */
export type MissKind = 'noBridge' | 'dropped'

export interface MissSplit {
  noBridge: BenchmarkResultItem[]
  dropped: BenchmarkResultItem[]
}

export interface GroupMetrics {
  total: number | null
  hit5: number | null
  hit10: number | null
  hit50: number | null
  /** 未进池题数 */
  miss: number | null
  /** 未进池且桥未命中 */
  missNoBridge: number | null
  /** 未进池但桥已命中（并池后掉窗） */
  dropped: number | null
  /** 事件桥命中率 = eventBridge / total */
  eventBridgeHitRate: number | null
  /** 典故桥命中率 = allusionBridge / total */
  allusionBridgeHitRate: number | null
  cover5: number | null
}

export interface GroupMetricRow {
  key: string
  label: string
  text: string
  /** 移入说明：指标含义与分子 / 分母口径（悬停展示，简洁易懂） */
  tip: string
}

const GROUP_BUCKET_LABELS: Record<GroupStatusBucket, string> = {
  hit5: 'hit@5',
  hit10: 'hit@10',
  hit50: 'hit@50',
  miss: '未进池',
}

const MISS_KIND_LABELS: Record<MissKind, string> = {
  noBridge: '桥未命中',
  dropped: '并池后掉窗',
}

const EMPTY_METRICS: GroupMetrics = {
  total: null,
  hit5: null,
  hit10: null,
  hit50: null,
  miss: null,
  missNoBridge: null,
  dropped: null,
  eventBridgeHitRate: null,
  allusionBridgeHitRate: null,
  cover5: null,
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** 比率 = 计数 / 总数；total 缺失或 ≤ 0 返回 null（对外显示「—」） */
function rateOf(total: number | null, count: number | null): number | null {
  return total !== null && total > 0 && count !== null ? count / total : null
}

/** 是否组判分快照：以 summary.judge 为准；A015 老快照无 judge 字段，按锚集处理 */
export function isGroupSummary(summary: BenchmarkSummary | null | undefined): boolean {
  return summary?.judge === 'group'
}

/** 组内首段名次：0 = 未进 50 路池；缺字段（老快照 / 异集快照）返回 null，由展示层兜底成「—」 */
export function firstRankOf(item: BenchmarkResultItem): number | null {
  return isFiniteNumber(item.firstRank) ? item.firstRank : null
}

/** 是否带组判分字段（锚集题一个都没有，用于把「缺 firstRank」与「非组集题」区分开） */
function hasGroupFields(item: BenchmarkResultItem): boolean {
  return (
    isFiniteNumber(item.segCount) ||
    typeof item.hit5 === 'boolean' ||
    typeof item.bridgeHit === 'boolean' ||
    Array.isArray(item.chunkIds)
  )
}

/** 单题分档：按首段名次 1–5 / 6–10 / 11–50 / 未进池；缺 firstRank 的组集题回退服务端 status，锚集题不归组集档 */
export function groupBucketOf(item: BenchmarkResultItem): GroupStatusBucket | null {
  const rank = firstRankOf(item)
  if (rank === null) {
    if (!hasGroupFields(item)) return null
    return (Object.keys(GROUP_BUCKET_LABELS) as GroupStatusBucket[]).includes(item.status as GroupStatusBucket)
      ? (item.status as GroupStatusBucket)
      : null
  }
  if (rank === 0) return 'miss'
  if (rank <= 5) return 'hit5'
  if (rank <= 10) return 'hit10'
  if (rank <= 50) return 'hit50'
  return null
}

export function groupBucketLabel(bucket: GroupStatusBucket | null | undefined): string {
  return bucket ? GROUP_BUCKET_LABELS[bucket] : '—'
}

/** 是否未进池（首段未进 50 路池）：缺 firstRank 时不判为未进池 */
export function isUnpooled(item: BenchmarkResultItem): boolean {
  return firstRankOf(item) === 0
}

/** 未进池归因：bridgeHit=false 为桥未命中，bridgeHit=true 为并池后掉窗；已进池或字段缺失返回 null */
export function missKindOf(item: BenchmarkResultItem): MissKind | null {
  if (!isUnpooled(item)) return null
  if (item.bridgeHit === true) return 'dropped'
  if (item.bridgeHit === false) return 'noBridge'
  return null
}

export function missKindLabel(kind: MissKind | null | undefined): string {
  return kind ? MISS_KIND_LABELS[kind] : '—'
}

/** 未进池清单：按 bridgeHit 分「桥未命中」与「并池后掉窗」两组 */
export function splitMisses(results: BenchmarkResultItem[]): MissSplit {
  const split: MissSplit = { noBridge: [], dropped: [] }
  for (const item of results) {
    const kind = missKindOf(item)
    if (kind === 'noBridge') split.noBridge.push(item)
    else if (kind === 'dropped') split.dropped.push(item)
  }
  return split
}

/** 单题 cover@5 = hits5 / min(5, segCount)；缺字段或 segCount ≤ 0 返回 null */
export function cover5OfItem(item: BenchmarkResultItem): number | null {
  if (!isFiniteNumber(item.hits5) || !isFiniteNumber(item.segCount) || item.segCount <= 0) return null
  return item.hits5 / Math.min(5, item.segCount)
}

/** cover@5 计算所需字段：快照 summary 与 byCategory / byBucket 桶同口径 */
export interface GroupCoverageFields {
  cover5?: number
  sumHits5?: number
  sumCap5?: number
}

/** 汇总 cover@5：优先取 cover5，缺失时回落 sumHits5 / sumCap5（summary 与分类桶共用） */
export function summaryCover5(summary: GroupCoverageFields | null | undefined): number | null {
  if (!summary) return null
  if (isFiniteNumber(summary.cover5)) return summary.cover5
  if (isFiniteNumber(summary.sumHits5) && isFiniteNumber(summary.sumCap5) && summary.sumCap5 > 0) {
    return summary.sumHits5 / summary.sumCap5
  }
  return null
}

/** 从明细现算汇总 cover@5：Σhits5 / Σmin(5, segCount)，无可算题返回 null */
export function cover5OfResults(results: BenchmarkResultItem[]): number | null {
  let hits = 0
  let cap = 0
  for (const item of results) {
    if (!isFiniteNumber(item.hits5) || !isFiniteNumber(item.segCount) || item.segCount <= 0) continue
    hits += item.hits5
    cap += Math.min(5, item.segCount)
  }
  return cap > 0 ? hits / cap : null
}

/** 计数字段兜底：summary 缺该字段时按明细现算；明细也为空则不猜，返回 null（对外显示「—」） */
function countOf(
  value: number | undefined,
  results: BenchmarkResultItem[],
  predicate: (item: BenchmarkResultItem) => boolean,
): number | null {
  if (isFiniteNumber(value)) return value
  if (results.length === 0) return null
  return results.filter(predicate).length
}

/** 桥命中计数兜底：summary 缺字段时按明细 eventBridgeHit / allusionBridgeHit 现算；明细也无该布尔字段（老快照）→ null（对外显示「—」） */
function bridgeCountOf(
  value: number | undefined,
  results: BenchmarkResultItem[],
  key: 'eventBridgeHit' | 'allusionBridgeHit',
): number | null {
  if (isFiniteNumber(value)) return value
  const present = results.filter((item) => typeof item[key] === 'boolean')
  if (present.length === 0) return null
  return present.filter((item) => item[key] === true).length
}

/** 组判分指标（锚集 / 老快照一律返回全 null，展示层统一兜底成「—」） */
export function groupMetrics(
  summary: BenchmarkSummary | null | undefined,
  results: BenchmarkResultItem[] = [],
): GroupMetrics {
  if (!summary || !isGroupSummary(summary)) return { ...EMPTY_METRICS }
  const total = isFiniteNumber(summary.total) ? summary.total : null
  const cover5 = summaryCover5(summary) ?? cover5OfResults(results)
  return {
    total,
    hit5: countOf(summary.hit5, results, (item) => groupBucketOf(item) === 'hit5'),
    hit10: countOf(summary.hit10, results, (item) => groupBucketOf(item) === 'hit10'),
    hit50: countOf(summary.hit50, results, (item) => groupBucketOf(item) === 'hit50'),
    miss: countOf(summary.miss, results, isUnpooled),
    missNoBridge: countOf(summary.missNoBridge, results, (item) => missKindOf(item) === 'noBridge'),
    dropped: countOf(summary.dropped, results, (item) => missKindOf(item) === 'dropped'),
    eventBridgeHitRate: rateOf(
      total,
      bridgeCountOf(summary.eventBridge, results, 'eventBridgeHit'),
    ),
    allusionBridgeHitRate: rateOf(
      total,
      bridgeCountOf(summary.allusionBridge, results, 'allusionBridgeHit'),
    ),
    cover5,
  }
}

/** 计数展示：缺字段 / 非有限数一律「—」 */
export function groupCountText(value: number | null | undefined): string {
  return isFiniteNumber(value) ? String(value) : '—'
}

/** 比率展示：缺字段一律「—」，否则百分数（1 位小数） */
export function groupRateText(ratio: number | null | undefined): string {
  return isFiniteNumber(ratio) ? `${(ratio * 100).toFixed(1)}%` : '—'
}

/** 「分子/分母（百分数）」展示：任一侧缺字段一律「—」 */
export function groupCountRateText(count: number | null | undefined, total: number | null | undefined): string {
  if (!isFiniteNumber(count) || !isFiniteNumber(total)) return '—'
  if (total <= 0) return String(count)
  return `${count}/${total}（${((count / total) * 100).toFixed(1)}%）`
}

/** 首段名次展示：0 = 未进池；缺字段「—」 */
export function firstRankText(rank: number | null | undefined): string {
  if (!isFiniteNumber(rank)) return '—'
  return rank === 0 ? '未进池' : String(rank)
}

/** 组判分指标行（顺序即展示顺序，cover@5 主判据在前） */
export function groupMetricRows(
  summary: BenchmarkSummary | null | undefined,
  results: BenchmarkResultItem[] = [],
): GroupMetricRow[] {
  const metrics = groupMetrics(summary, results)
  return [
    {
      key: 'cover5',
      label: 'cover@5（主判据）',
      text: groupRateText(metrics.cover5),
      tip: '前 5 席覆盖组内段的比例（命中段数 ÷ min(5, 组内段数)），越高越好',
    },
    {
      key: 'hit5',
      label: 'hit@5',
      text: groupCountRateText(metrics.hit5, metrics.total),
      tip: '组内首段（名次最靠前那段）进前 5 名的题数 / 总题数',
    },
    {
      key: 'hit10',
      label: 'hit@10',
      text: groupCountRateText(metrics.hit10, metrics.total),
      tip: '组内首段进前 10 名的题数 / 总题数（含 hit@5）；红线：不得下降',
    },
    {
      key: 'hit50',
      label: 'hit@50',
      text: groupCountRateText(metrics.hit50, metrics.total),
      tip: '组内首段进了 50 路池的题数 / 总题数（含 hit@10），即组进池率',
    },
    {
      key: 'eventBridgeHitRate',
      label: '事件桥命中率',
      text: groupRateText(metrics.eventBridgeHitRate),
      tip: '事件名桥命中的题数 / 总题数：事件桥把组引入候选池',
    },
    {
      key: 'allusionBridgeHitRate',
      label: '典故桥命中率',
      text: groupRateText(metrics.allusionBridgeHitRate),
      tip: '典故名桥命中的题数 / 总题数：典故桥把组引入候选池',
    },
    {
      key: 'miss',
      label: '未进池',
      text: groupCountRateText(metrics.miss, metrics.total),
      tip: '组内一段都没进 50 路候选池的题数 / 总题数（下面两类之和）',
    },
    {
      key: 'missNoBridge',
      label: '未进池·桥未命中',
      text: groupCountText(metrics.missNoBridge),
      tip: '未进池且桥也没命中的题数——组根本没进池，问题在召回源头',
    },
    {
      key: 'dropped',
      label: '未进池·并池后掉窗',
      text: groupCountText(metrics.dropped),
      tip: '未进池但桥已命中的题数——组进池后被并池 / 重排挤出，问题在排序',
    },
  ]
}
