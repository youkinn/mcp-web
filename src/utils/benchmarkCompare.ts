import type { BenchmarkCategorySummary, BenchmarkData, BenchmarkResultItem, BenchmarkStatus } from '../api/client'

/**
 * 历史快照逐项比较（feat-A015）：复用两个快照的 results 与 summary.category，
 * 仅支持题量一致的快照（题量不一致返回 null，前端不做比较）。
 *
 * 变化口径（rank 0 = 未召回）：
 * - up：两边都在召回池，B 名次更靠前（rankB < rankA）
 * - down：两边都在召回池，B 名次更靠后（rankB > rankA）
 * - flat：名次一致（含两边都未召回）
 * - enter：A 未召回 → B 入榜（0 → >0）
 * - leave：A 在榜 → B 跌出（>0 → 0）
 */

export type RankChange = 'up' | 'down' | 'flat' | 'enter' | 'leave'

export interface CompareRow {
  id: string
  question: string
  /** 题所属分类：id 的「类别#序号」前缀（与类别汇总口径一致） */
  category: string
  rankA: number
  rankB: number
  statusA: BenchmarkStatus | null
  statusB: BenchmarkStatus | null
  change: RankChange
  /** 两侧快照中的完整题目（含 candidates，供操作列打开召回列表）；该侧未出现为 null */
  itemA: BenchmarkResultItem | null
  itemB: BenchmarkResultItem | null
}

export interface CategoryCompare {
  name: string
  a: BenchmarkCategorySummary
  b: BenchmarkCategorySummary
  totalDelta: number
  top5Delta: number
  tailDelta: number
  missDelta: number
}

export interface BenchmarkComparison {
  runIdA: string
  runIdB: string
  timeA: string
  timeB: string
  total: number
  top5A: number
  top5B: number
  tailA: number
  tailB: number
  missA: number
  missB: number
  rows: CompareRow[]
  categories: CategoryCompare[]
}

const ZERO_CAT: BenchmarkCategorySummary = { total: 0, top5: 0, tail: 0, miss: 0 }

/** 题所属分类：results[].id 的「类别#序号」前缀（与类别汇总 categoryOf 同口径） */
export function categoryOfItem(id: string): string {
  return id.split('#')[0]?.trim() || id
}

function changeOf(a: BenchmarkResultItem, b: BenchmarkResultItem): RankChange {
  if (a.rank === 0 && b.rank > 0) return 'enter'
  if (a.rank > 0 && b.rank === 0) return 'leave'
  if (a.rank > 0 && b.rank > 0) {
    if (b.rank < a.rank) return 'up'
    if (b.rank > a.rank) return 'down'
  }
  return 'flat'
}

function rankOrder(rank: number): number {
  return rank === 0 ? Number.MAX_SAFE_INTEGER : rank
}

function changePriority(change: RankChange): number {
  if (change === 'enter' || change === 'leave') return 0
  if (change === 'up' || change === 'down') return 1
  return 2
}

/** 变化题优先（入榜/出榜 > 升降 > 持平），同级按 A 名次（未召回殿后）再按 B 名次、id 稳定排序 */
export function sortCompareRows(rows: CompareRow[]): CompareRow[] {
  return [...rows].sort(
    (x, y) =>
      changePriority(x.change) - changePriority(y.change) ||
      rankOrder(x.rankA) - rankOrder(y.rankA) ||
      rankOrder(x.rankB) - rankOrder(y.rankB) ||
      x.id.localeCompare(y.id),
  )
}

export function compareSnapshots(a: BenchmarkData, b: BenchmarkData): BenchmarkComparison | null {
  if (a.summary.total !== b.summary.total) return null
  const bById = new Map(b.results.map((r) => [r.id, r]))
  const seen = new Set<string>()
  const rows: CompareRow[] = []
  for (const ra of a.results) {
    seen.add(ra.id)
    const rb = bById.get(ra.id)
    if (!rb) {
      rows.push({
        id: ra.id,
        question: ra.question,
        category: categoryOfItem(ra.id),
        rankA: ra.rank,
        rankB: 0,
        statusA: ra.status,
        statusB: null,
        change: 'leave',
        itemA: ra,
        itemB: null,
      })
      continue
    }
    rows.push({
      id: ra.id,
      question: ra.question,
      category: categoryOfItem(ra.id),
      rankA: ra.rank,
      rankB: rb.rank,
      statusA: ra.status,
      statusB: rb.status,
      change: changeOf(ra, rb),
      itemA: ra,
      itemB: rb,
    })
  }
  for (const rb of b.results) {
    if (seen.has(rb.id)) continue
    rows.push({
      id: rb.id,
      question: rb.question,
      category: categoryOfItem(rb.id),
      rankA: 0,
      rankB: rb.rank,
      statusA: null,
      statusB: rb.status,
      change: 'enter',
      itemA: null,
      itemB: rb,
    })
  }
  const names = [...new Set([...Object.keys(a.summary.category), ...Object.keys(b.summary.category)])]
  const categories: CategoryCompare[] = names.map((name) => {
    const ca = a.summary.category[name] ?? ZERO_CAT
    const cb = b.summary.category[name] ?? ZERO_CAT
    return {
      name,
      a: ca,
      b: cb,
      totalDelta: cb.total - ca.total,
      top5Delta: cb.top5 - ca.top5,
      tailDelta: cb.tail - ca.tail,
      missDelta: cb.miss - ca.miss,
    }
  })
  return {
    runIdA: a.runId,
    runIdB: b.runId,
    timeA: a.time,
    timeB: b.time,
    total: a.summary.total,
    top5A: a.summary.top5,
    top5B: b.summary.top5,
    tailA: a.summary.tail,
    tailB: b.summary.tail,
    missA: a.summary.miss,
    missB: b.summary.miss,
    rows: sortCompareRows(rows),
    categories,
  }
}

/** 筛选口径（负责人 2026-09-29 定）：入榜按上升处理，不另立第三类 */
export function isRankUp(change: RankChange): boolean {
  return change === 'up' || change === 'enter'
}

/** 筛选口径（负责人 2026-09-29 定）：出榜按下降处理，不另立第三类 */
export function isRankDown(change: RankChange): boolean {
  return change === 'down' || change === 'leave'
}
