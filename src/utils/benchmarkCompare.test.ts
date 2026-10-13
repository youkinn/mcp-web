import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import type { BenchmarkCategorySummary, BenchmarkData, BenchmarkResultItem } from '../api/client'
import {
  categoryOfItem,
  compareGroupSnapshots,
  compareSnapshots,
  deltaClass,
  isRankDown,
  isRankUp,
} from './benchmarkCompare.ts'
import type { BenchmarkGroupBucketSummary } from '../api/client'

function item(id: string, question: string, rank: number, status: BenchmarkResultItem['status']): BenchmarkResultItem {
  return {
    id,
    question,
    answer: '',
    evidence: '',
    textAnchors: [],
    titleAnchors: [],
    chapterRefs: [],
    rank,
    status,
    hit: null,
    candidates: [],
  }
}

function snapshot(
  runId: string,
  items: BenchmarkResultItem[],
  category: Record<string, BenchmarkCategorySummary> = {},
): BenchmarkData {
  const top5 = items.filter((i) => i.status === 'top5').length
  const tail = items.filter((i) => i.status === 'tail').length
  const miss = items.filter((i) => i.status === 'miss').length
  return {
    runId,
    time: '2026-09-29T00:00:00.000Z',
    summary: {
      runId,
      tool: 't',
      version: 'v',
      time: '2026-09-29T00:00:00.000Z',
      benchmark: 'b',
      engine: null,
      total: items.length,
      top5,
      tail,
      miss,
      top3: 0,
      top10: top5 + tail,
      inPool50: top5 + tail,
      noAnchorCount: 0,
      noAnchor: [],
      category,
    },
    results: items,
  }
}

describe('历史快照比较（benchmarkCompare，bug-00047）', () => {
  it('题量不一致返回 null 不做比较', () => {
    const a = snapshot('A', [item('a1', 'q1', 1, 'top5')])
    const b = snapshot('B', [item('a1', 'q1', 1, 'top5'), item('a2', 'q2', 6, 'tail')])
    assert.equal(compareSnapshots(a, b), null)
  })

  it('名次上升 / 下降 / 持平判定（up/down/flat，按当前快照主体）', () => {
    const a = snapshot('A', [
      item('up', '名次升', 2, 'top5'),
      item('down', '名次降', 7, 'tail'),
      item('flat', '名次平', 3, 'top5'),
    ])
    const b = snapshot('B', [
      item('up', '名次升', 5, 'tail'),
      item('down', '名次降', 1, 'top5'),
      item('flat', '名次平', 3, 'top5'),
    ])
    const c = compareSnapshots(a, b)
    assert.ok(c)
    assert.equal(c.rows.find((r) => r.id === 'up')?.change, 'up')
    assert.equal(c.rows.find((r) => r.id === 'down')?.change, 'down')
    assert.equal(c.rows.find((r) => r.id === 'flat')?.change, 'flat')
  })

  it('入榜 / 出榜判定（0 与 >0 互转，按当前快照主体）', () => {
    const a = snapshot('A', [item('enter', '新入', 4, 'top5'), item('leave', '跌出', 0, 'miss')])
    const b = snapshot('B', [item('enter', '新入', 0, 'miss'), item('leave', '跌出', 8, 'tail')])
    const c = compareSnapshots(a, b)
    assert.ok(c)
    assert.equal(c.rows.find((r) => r.id === 'enter')?.change, 'enter')
    assert.equal(c.rows.find((r) => r.id === 'leave')?.change, 'leave')
  })

  it('单侧缺失（题集不一致防御分支）：只在当前快照视为入榜、只在目标视为出榜', () => {
    const a = snapshot('A', [item('onlyA', '仅在A', 3, 'top5')])
    const b = snapshot('B', [item('onlyB', '仅在B', 2, 'top5')])
    const c = compareSnapshots(a, b)
    assert.ok(c)
    assert.equal(c.rows.find((r) => r.id === 'onlyA')?.change, 'enter')
    assert.equal(c.rows.find((r) => r.id === 'onlyA')?.rankB, 0)
    assert.equal(c.rows.find((r) => r.id === 'onlyB')?.change, 'leave')
    assert.equal(c.rows.find((r) => r.id === 'onlyB')?.rankA, 0)
  })

  it('类别计数变化：名称并集 + 各指标 当前−目标 差值（bug-00060）', () => {
    const a = snapshot(
      'A',
      [item('a1', 'q1', 1, 'top5'), item('b1', 'q2', 0, 'miss')],
      {
        甲: { total: 1, top5: 1, tail: 0, miss: 0 },
        乙: { total: 1, top5: 0, tail: 0, miss: 1 },
      },
    )
    const b = snapshot(
      'B',
      [item('a1', 'q1', 6, 'tail'), item('b1', 'q2', 0, 'miss')],
      {
        甲: { total: 1, top5: 0, tail: 1, miss: 0 },
        丙: { total: 1, top5: 0, tail: 0, miss: 1 },
      },
    )
    const c = compareSnapshots(a, b)
    assert.ok(c)
    assert.deepEqual(c.categories.map((x) => x.name).sort(), ['丙', '乙', '甲'])
    const jia = c.categories.find((x) => x.name === '甲')
    assert.ok(jia)
    assert.equal(jia.top5Delta, 1)
    assert.equal(jia.tailDelta, -1)
    const yi = c.categories.find((x) => x.name === '乙')
    assert.ok(yi)
    assert.equal(yi.missDelta, 1)
    const bing = c.categories.find((x) => x.name === '丙')
    assert.ok(bing)
    assert.equal(bing.missDelta, -1)
  })

  it('排序：入榜/出榜 > 升降 > 持平，未召回殿后', () => {
    const a = snapshot('A', [
      item('flat', '平', 2, 'top5'),
      item('up', '升', 1, 'top5'),
      item('z', '未召回', 0, 'miss'),
      item('enter', '入榜', 0, 'miss'),
    ])
    const b = snapshot('B', [
      item('flat', '平', 2, 'top5'),
      item('up', '升', 9, 'tail'),
      item('z', '未召回', 0, 'miss'),
      item('enter', '入榜', 5, 'tail'),
    ])
    const c = compareSnapshots(a, b)
    assert.ok(c)
    assert.deepEqual(
      c.rows.map((r) => r.id),
      ['enter', 'up', 'flat', 'z'],
    )
  })

  it('筛选口径：入榜并入上升、出榜并入下降（负责人 2026-09-29 定）', () => {
    assert.equal(isRankUp('up'), true)
    assert.equal(isRankUp('enter'), true)
    assert.equal(isRankUp('down'), false)
    assert.equal(isRankUp('leave'), false)
    assert.equal(isRankUp('flat'), false)
    assert.equal(isRankDown('down'), true)
    assert.equal(isRankDown('leave'), true)
    assert.equal(isRankDown('up'), false)
    assert.equal(isRankDown('enter'), false)
    assert.equal(isRankDown('flat'), false)
  })

  it('分类口径：id 的「类别#序号」前缀（与类别汇总 categoryOf 一致）', () => {
    assert.equal(categoryOfItem('人物#1'), '人物')
    assert.equal(categoryOfItem(' 地名 #2'), '地名')
    assert.equal(categoryOfItem('no-anchor-id'), 'no-anchor-id')
  })

  it('比较行携带两侧完整题目：入榜只带 B、出榜只带 A、双侧同在两边都有', () => {
    const a = snapshot('A', [item('onlyA', 'qA', 3, 'top5'), item('both', 'qB', 1, 'top5')])
    const b = snapshot('B', [item('onlyB', 'qB2', 2, 'top5'), item('both', 'qB', 5, 'tail')])
    const c = compareSnapshots(a, b)
    assert.ok(c)
    const leaveRow = c.rows.find((r) => r.id === 'onlyA')
    const enterRow = c.rows.find((r) => r.id === 'onlyB')
    const bothRow = c.rows.find((r) => r.id === 'both')
    assert.ok(leaveRow)
    assert.equal(leaveRow.itemA?.id, 'onlyA')
    assert.equal(leaveRow.itemB, null)
    assert.ok(enterRow)
    assert.equal(enterRow.itemA, null)
    assert.equal(enterRow.itemB?.id, 'onlyB')
    assert.ok(bothRow)
    assert.equal(bothRow.itemA?.id, 'both')
    assert.equal(bothRow.itemB?.id, 'both')
  })
})

// ── 组判分快照比较（feat-A018 story-03）：比较字段为 status @ firstRank ──

function groupBucket(hit5: number, miss: number, total: number, cover5: number): BenchmarkGroupBucketSummary {
  return {
    total,
    hit5,
    hit10: hit5,
    hit50: hit5 + miss,
    miss,
    noBridge: 1,
    missNoBridge: 1,
    dropped: miss - 1,
    sumHits5: hit5,
    sumCap5: hit5 + miss,
    hit10Rate: 0.9,
    cover5,
  }
}

function groupItem(
  id: string,
  firstRank: number,
  bucket: 'hit5' | 'hit10' | 'hit50' | 'miss',
  bridgeHit: boolean,
): BenchmarkResultItem {
  return { ...item(id, `q-${id}`, 0, bucket), category: 'L1', segCount: 2, firstRank, bridgeHit }
}

function groupSnapshot(runId: string, items: BenchmarkResultItem[]): BenchmarkData {
  const data = snapshot(runId, items)
  return {
    ...data,
    summary: {
      ...data.summary,
      setId: 'events',
      setName: '事件 / 典故组召回（组判分）',
      judge: 'group',
      hit5: items.filter((i) => i.status === 'hit5').length,
      miss: items.filter((i) => i.status === 'miss').length,
      missNoBridge: items.filter((i) => i.status === 'miss' && i.bridgeHit === false).length,
      dropped: items.filter((i) => i.status === 'miss' && i.bridgeHit === true).length,
      cover5: 0.5,
      byCategory: { L1: groupBucket(1, 1, 2, 0.5) },
    },
  }
}

describe('组判分快照比较（compareGroupSnapshots，feat-A018 story-03）', () => {
  it('比较字段为 status @ firstRank：当前前移 up / 当前后移 down / 当前未进池 leave / 均未进池 flat', () => {
    const a = groupSnapshot('A', [
      groupItem('g1', 8, 'hit10', true),
      groupItem('g2', 3, 'hit5', true),
      groupItem('g3', 0, 'miss', true),
      groupItem('g4', 0, 'miss', false),
    ])
    const b = groupSnapshot('B', [
      groupItem('g1', 4, 'hit5', true),
      groupItem('g2', 9, 'hit10', true),
      groupItem('g3', 12, 'hit50', true),
      groupItem('g4', 0, 'miss', false),
    ])
    const comparison = compareGroupSnapshots(a, b)
    assert.ok(comparison)
    const changeOfId = (id: string): string | undefined => comparison.rows.find((r) => r.id === id)?.change
    assert.equal(changeOfId('g1'), 'down')
    assert.equal(changeOfId('g2'), 'up')
    assert.equal(changeOfId('g3'), 'leave')
    assert.equal(changeOfId('g4'), 'flat')
    assert.equal(comparison.rows.find((r) => r.id === 'g1')?.bucketB, 'hit5')
  })

  it('锚集快照 / 题量不一致 / 缺 firstRank 一律返回 null（不做猜测性比较）', () => {
    assert.equal(
      compareGroupSnapshots(snapshot('A', [item('a1', 'q1', 1, 'top5')]), snapshot('B', [item('a1', 'q1', 1, 'top5')])),
      null,
    )
    assert.equal(
      compareGroupSnapshots(
        groupSnapshot('A', [groupItem('g1', 1, 'hit5', true)]),
        groupSnapshot('B', [groupItem('g1', 1, 'hit5', true), groupItem('g2', 0, 'miss', false)]),
      ),
      null,
    )
    const legacy = groupSnapshot('C', [groupItem('g1', 1, 'hit5', true)])
    legacy.results[0]!.firstRank = undefined
    assert.equal(compareGroupSnapshots(legacy, groupSnapshot('D', [groupItem('g1', 1, 'hit5', true)])), null)
  })

  it('分类桶差值 + 汇总 cover@5 / 未进池读数', () => {
    const comparison = compareGroupSnapshots(
      groupSnapshot('A', [groupItem('g1', 3, 'hit5', true), groupItem('g2', 0, 'miss', true)]),
      groupSnapshot('B', [groupItem('g1', 0, 'miss', false), groupItem('g2', 0, 'miss', true)]),
    )
    assert.ok(comparison)
    assert.equal(comparison.judge, 'group')
    assert.equal(comparison.cover5A, 0.5)
    assert.equal(comparison.cover5B, 0.5)
    assert.equal(comparison.missA, 1)
    assert.equal(comparison.missB, 2)
    assert.equal(comparison.missNoBridgeB, 1)
    assert.equal(comparison.droppedB, 1)
    assert.equal(comparison.buckets[0]?.name, 'L1')
    assert.equal(comparison.buckets[0]?.cover5Delta, 0)
  })
})

// ── 比较方向与配色（bug-00060）：A=当前快照、B=目标快照 ──

describe('比较方向（A=当前、B=目标，bug-00060）', () => {
  it('delta = 当前 − 目标；行内 rankA=当前名次、rankB=目标名次', () => {
    const current = snapshot(
      'current',
      [item('q1', 'q1', 2, 'top5'), item('q2', 'q2', 3, 'top5')],
      { 甲: { total: 2, top5: 2, tail: 0, miss: 0 } },
    )
    const target = snapshot(
      'target',
      [item('q1', 'q1', 7, 'tail'), item('q2', 'q2', 0, 'miss')],
      { 甲: { total: 2, top5: 0, tail: 1, miss: 1 } },
    )
    const c = compareSnapshots(current, target)
    assert.ok(c)
    assert.equal(c.runIdA, 'current')
    assert.equal(c.runIdB, 'target')
    assert.equal(c.top5A, 2)
    assert.equal(c.top5B, 0)
    const q1 = c.rows.find((r) => r.id === 'q1')
    assert.equal(q1?.rankA, 2)
    assert.equal(q1?.rankB, 7)
    assert.equal(q1?.change, 'up')
    assert.equal(c.rows.find((r) => r.id === 'q2')?.change, 'enter')
    const jia = c.categories.find((x) => x.name === '甲')
    assert.equal(jia?.top5Delta, 2)
    assert.equal(jia?.missDelta, -1)
  })
})

describe('行级变化按当前快照主体（bug-00060，典故#12 同类）', () => {
  it('当前名次 3 → 目标名次 1：当前退后，判 down', () => {
    const current = snapshot('c', [item('d1', 'd1', 3, 'top5')], { 甲: { total: 1, top5: 1, tail: 0, miss: 0 } })
    const target = snapshot('t', [item('d1', 'd1', 1, 'top5')], { 甲: { total: 1, top5: 1, tail: 0, miss: 0 } })
    const c = compareSnapshots(current, target)
    assert.ok(c)
    assert.equal(c.rows[0]?.rankA, 3)
    assert.equal(c.rows[0]?.rankB, 1)
    assert.equal(c.rows[0]?.change, 'down')
    assert.equal(c.categories[0]?.top5Delta, 0)
  })
})

describe('delta 配色（deltaClass，bug-00060）', () => {
  it('正数绿、负数红、0 不着色（按符号，不按好坏语义）', () => {
    assert.equal(deltaClass(1), 'compare-delta-pos')
    assert.equal(deltaClass(3), 'compare-delta-pos')
    assert.equal(deltaClass(-1), 'compare-delta-neg')
    assert.equal(deltaClass(-5), 'compare-delta-neg')
    assert.equal(deltaClass(0), '')
  })
})
