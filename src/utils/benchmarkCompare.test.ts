import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import type { BenchmarkCategorySummary, BenchmarkData, BenchmarkResultItem } from '../api/client'
import { categoryOfItem, compareSnapshots, isRankDown, isRankUp } from './benchmarkCompare.ts'

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

  it('名次上升 / 下降 / 持平判定（up/down/flat）', () => {
    const a = snapshot('A', [
      item('up', '名次升', 5, 'tail'),
      item('down', '名次降', 1, 'top5'),
      item('flat', '名次平', 3, 'top5'),
    ])
    const b = snapshot('B', [
      item('up', '名次升', 2, 'top5'),
      item('down', '名次降', 7, 'tail'),
      item('flat', '名次平', 3, 'top5'),
    ])
    const c = compareSnapshots(a, b)
    assert.ok(c)
    assert.equal(c.rows.find((r) => r.id === 'up')?.change, 'up')
    assert.equal(c.rows.find((r) => r.id === 'down')?.change, 'down')
    assert.equal(c.rows.find((r) => r.id === 'flat')?.change, 'flat')
  })

  it('入榜 / 出榜判定（0 与 >0 互转）', () => {
    const a = snapshot('A', [item('enter', '新入', 0, 'miss'), item('leave', '跌出', 8, 'tail')])
    const b = snapshot('B', [item('enter', '新入', 4, 'top5'), item('leave', '跌出', 0, 'miss')])
    const c = compareSnapshots(a, b)
    assert.ok(c)
    assert.equal(c.rows.find((r) => r.id === 'enter')?.change, 'enter')
    assert.equal(c.rows.find((r) => r.id === 'leave')?.change, 'leave')
  })

  it('单侧缺失：只在 A 视为出榜，只在 B 视为入榜', () => {
    const a = snapshot('A', [item('onlyA', '仅在A', 3, 'top5')])
    const b = snapshot('B', [item('onlyB', '仅在B', 2, 'top5')])
    const c = compareSnapshots(a, b)
    assert.ok(c)
    assert.equal(c.rows.find((r) => r.id === 'onlyA')?.change, 'leave')
    assert.equal(c.rows.find((r) => r.id === 'onlyA')?.rankB, 0)
    assert.equal(c.rows.find((r) => r.id === 'onlyB')?.change, 'enter')
    assert.equal(c.rows.find((r) => r.id === 'onlyB')?.rankA, 0)
  })

  it('类别计数变化：名称并集 + 各指标 A→B 差值', () => {
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
    assert.equal(jia.top5Delta, -1)
    assert.equal(jia.tailDelta, 1)
    const yi = c.categories.find((x) => x.name === '乙')
    assert.ok(yi)
    assert.equal(yi.missDelta, -1)
    const bing = c.categories.find((x) => x.name === '丙')
    assert.ok(bing)
    assert.equal(bing.missDelta, 1)
  })

  it('排序：入榜/出榜 > 升降 > 持平，未召回殿后', () => {
    const a = snapshot('A', [
      item('flat', '平', 2, 'top5'),
      item('up', '升', 9, 'tail'),
      item('z', '未召回', 0, 'miss'),
      item('enter', '入榜', 0, 'miss'),
    ])
    const b = snapshot('B', [
      item('flat', '平', 2, 'top5'),
      item('up', '升', 1, 'top5'),
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
