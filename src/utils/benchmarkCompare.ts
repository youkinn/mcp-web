import type {
  BenchmarkCategorySummary,
  BenchmarkData,
  BenchmarkGroupBucketSummary,
  BenchmarkResultItem,
  BenchmarkResultStatus,
} from '../api/client'
import { firstRankOf, groupBucketOf, summaryCover5, type GroupStatusBucket } from './benchmarkGroup.ts'

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
  /** 锚集 = 证据段名次；组集 = 组内首段名次（0 = 未召回 / 未进池） */
  rankA: number
  rankB: number
  statusA: BenchmarkResultStatus | null
  statusB: BenchmarkResultStatus | null
  /** 组集分档（锚集为 null），比较口径见 compareGroupSnapshots */
  bucketA: GroupStatusBucket | null
  bucketB: GroupStatusBucket | null
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

function changeOfRanks(rankA: number, rankB: number): RankChange {
  if (rankA === 0 && rankB > 0) return 'enter'
  if (rankA > 0 && rankB === 0) return 'leave'
  if (rankA > 0 && rankB > 0) {
    if (rankB < rankA) return 'up'
    if (rankB > rankA) return 'down'
  }
  return 'flat'
}

function changeOf(a: BenchmarkResultItem, b: BenchmarkResultItem): RankChange {
  return changeOfRanks(a.rank, b.rank)
}

function rankOrder(rank: number): number {
  return rank === 0 ? Number.MAX_SAFE_INTEGER : rank
}

function changePriority(change: RankChange): number {
  if (change === 'enter' || change === 'leave') return 0
  if (change === 'up' || change === 'down') return 1
  return 2
}

/** 变化题优先（入榜/出榜 > 升降 > 持平），同级按 A 名次（未召回殿后）再按 B 名次、id 稳定排序；
 *  锚集 CompareRow 与组集 GroupCompareRow 共用同一排序口径 */
export function sortCompareRows<T extends { change: RankChange; rankA: number; rankB: number; id: string }>(
  rows: T[],
): T[] {
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
        bucketA: null,
        bucketB: null,
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
      bucketA: null,
      bucketB: null,
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
      bucketA: null,
      bucketB: null,
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

// ── 组判分快照比较（feat-A018 story-03）──

export interface GroupBucketCompare {
  name: string
  a: BenchmarkGroupBucketSummary
  b: BenchmarkGroupBucketSummary
  totalDelta: number
  hit5Delta: number
  missDelta: number
  /** cover@5 差值（百分点口径：0.05 = 5 个百分点） */
  cover5Delta: number
}

export interface GroupComparison {
  judge: 'group'
  runIdA: string
  runIdB: string
  timeA: string
  timeB: string
  total: number
  hit5A: number | null
  hit5B: number | null
  missA: number | null
  missB: number | null
  missNoBridgeA: number | null
  missNoBridgeB: number | null
  droppedA: number | null
  droppedB: number | null
  cover5A: number | null
  cover5B: number | null
  /** 组集比较行：比较字段为 status @ firstRank（rankA / rankB 即首段名次，0 = 未进池） */
  rows: CompareRow[]
  buckets: GroupBucketCompare[]
}

const ZERO_GROUP_BUCKET: BenchmarkGroupBucketSummary = {
  total: 0,
  hit5: 0,
  hit10: 0,
  hit50: 0,
  miss: 0,
  noBridge: 0,
  missNoBridge: 0,
  dropped: 0,
  sumHits5: 0,
  sumCap5: 0,
  hit10Rate: 0,
  cover5: 0,
}

/**
 * 组集快照比较：仅两侧都是组判分快照、题量一致、且每题都带 firstRank 时才比较
 * （缺组判分字段的老快照 / 异集快照一律返回 null，页面给明确提示，不做猜测性比较）。
 */
export function compareGroupSnapshots(a: BenchmarkData, b: BenchmarkData): GroupComparison | null {
  if (a.summary.judge !== 'group' || b.summary.judge !== 'group') return null
  if (a.summary.total !== b.summary.total) return null
  if (a.results.some((item) => firstRankOf(item) === null)) return null
  if (b.results.some((item) => firstRankOf(item) === null)) return null

  const bById = new Map(b.results.map((r) => [r.id, r]))
  const seen = new Set<string>()
  const rows: CompareRow[] = []
  for (const itemA of a.results) {
    seen.add(itemA.id)
    const itemB = bById.get(itemA.id)
    const rankA = firstRankOf(itemA) ?? 0
    const rankB = itemB ? (firstRankOf(itemB) ?? 0) : 0
    rows.push({
      id: itemA.id,
      question: itemA.question,
      category: itemA.category ?? categoryOfItem(itemA.id),
      rankA,
      rankB,
      statusA: itemA.status,
      statusB: itemB ? itemB.status : null,
      bucketA: groupBucketOf(itemA),
      bucketB: itemB ? groupBucketOf(itemB) : null,
      change: itemB ? changeOfRanks(rankA, rankB) : 'leave',
      itemA,
      itemB: itemB ?? null,
    })
  }
  for (const itemB of b.results) {
    if (seen.has(itemB.id)) continue
    rows.push({
      id: itemB.id,
      question: itemB.question,
      category: itemB.category ?? categoryOfItem(itemB.id),
      rankA: 0,
      rankB: firstRankOf(itemB) ?? 0,
      statusA: null,
      statusB: itemB.status,
      bucketA: null,
      bucketB: groupBucketOf(itemB),
      change: 'enter',
      itemA: null,
      itemB,
    })
  }

  const byCategoryA = a.summary.byCategory ?? {}
  const byCategoryB = b.summary.byCategory ?? {}
  const names = [...new Set([...Object.keys(byCategoryA), ...Object.keys(byCategoryB)])]
  const buckets: GroupBucketCompare[] = names.map((name) => {
    const groupA = byCategoryA[name] ?? ZERO_GROUP_BUCKET
    const groupB = byCategoryB[name] ?? ZERO_GROUP_BUCKET
    return {
      name,
      a: groupA,
      b: groupB,
      totalDelta: groupB.total - groupA.total,
      hit5Delta: groupB.hit5 - groupA.hit5,
      missDelta: groupB.miss - groupA.miss,
      cover5Delta: groupB.cover5 - groupA.cover5,
    }
  })

  return {
    judge: 'group',
    runIdA: a.runId,
    runIdB: b.runId,
    timeA: a.time,
    timeB: b.time,
    total: a.summary.total,
    hit5A: a.summary.hit5 ?? null,
    hit5B: b.summary.hit5 ?? null,
    missA: a.summary.miss ?? null,
    missB: b.summary.miss ?? null,
    missNoBridgeA: a.summary.missNoBridge ?? null,
    missNoBridgeB: b.summary.missNoBridge ?? null,
    droppedA: a.summary.dropped ?? null,
    droppedB: b.summary.dropped ?? null,
    cover5A: summaryCover5(a.summary),
    cover5B: summaryCover5(b.summary),
    rows: sortCompareRows(rows),
    buckets,
  }
}
