import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import type { BenchmarkResultItem, BenchmarkSummary } from '../api/client'
import {
  cover5OfItem,
  cover5OfResults,
  firstRankText,
  groupBucketLabel,
  groupBucketOf,
  groupCountRateText,
  groupCountText,
  groupMetricRows,
  groupMetrics,
  groupRateText,
  isGroupSummary,
  isUnpooled,
  missKindLabel,
  missKindOf,
  splitMisses,
  summaryCover5,
} from './benchmarkGroup.ts'

// ── 组判分口径单测（feat-A018 story-03）：分档 / cover@5 / 未进池归因 / 锚集缺字段兜底 ──

function anchorSummary(extra: Partial<BenchmarkSummary> = {}): BenchmarkSummary {
  return {
    tool: 'feat-A015-verify.mjs',
    version: 'v2',
    time: '2026-09-30T00:00:00Z',
    benchmark: 'mock',
    engine: null,
    total: 10,
    top5: 6,
    tail: 1,
    miss: 3,
    top3: 5,
    top10: 7,
    inPool50: 8,
    category: {},
    runId: 'feat-A015-mock',
    ...extra,
  }
}

function groupSummary(extra: Partial<BenchmarkSummary> = {}): BenchmarkSummary {
  return anchorSummary({
    setId: 'events',
    setName: '事件 / 典故组召回（组判分）',
    judge: 'group',
    total: 4,
    hit5: 2,
    hit10: 3,
    hit50: 3,
    miss: 1,
    noBridge: 1,
    missNoBridge: 1,
    dropped: 0,
    sumHits5: 5,
    sumCap5: 8,
    hit10Rate: 0.75,
    cover5: 0.625,
    ...extra,
  })
}

function anchorItem(extra: Partial<BenchmarkResultItem> = {}): BenchmarkResultItem {
  return {
    id: 'A#001',
    question: 'q',
    answer: 'a',
    evidence: 'e',
    textAnchors: [],
    titleAnchors: [],
    chapterRefs: [],
    rank: 1,
    status: 'top5',
    hit: null,
    candidates: [],
    ...extra,
  }
}

function groupItem(extra: Partial<BenchmarkResultItem> = {}): BenchmarkResultItem {
  return anchorItem({
    id: 'L1#E00101',
    category: 'L1',
    segCount: 2,
    crossChapter: false,
    status: 'miss',
    firstRank: 0,
    hits5: 0,
    hits10: 0,
    hit5: false,
    hit10: false,
    hit50: false,
    bridgeGroups: 0,
    bridgeHit: false,
    chunkIds: [],
    top10Ids: [],
    ...extra,
  })
}

describe('groupBucketOf 状态分档（组内首段名次）', () => {
  it('首段进 1–5 判 hit5', () => {
    assert.equal(groupBucketOf(groupItem({ firstRank: 1 })), 'hit5')
    assert.equal(groupBucketOf(groupItem({ firstRank: 5 })), 'hit5')
  })

  it('首段进 6–10 判 hit10', () => {
    assert.equal(groupBucketOf(groupItem({ firstRank: 6 })), 'hit10')
    assert.equal(groupBucketOf(groupItem({ firstRank: 10 })), 'hit10')
  })

  it('首段进 11–50 判 hit50', () => {
    assert.equal(groupBucketOf(groupItem({ firstRank: 11 })), 'hit50')
    assert.equal(groupBucketOf(groupItem({ firstRank: 50 })), 'hit50')
  })

  it('首段未进 50 路池（firstRank = 0）判 miss', () => {
    assert.equal(groupBucketOf(groupItem({ firstRank: 0 })), 'miss')
  })

  it('首段名次超出 50 路池（异常读数）不归任何档', () => {
    assert.equal(groupBucketOf(groupItem({ firstRank: 51 })), null)
  })

  it('缺 firstRank 时回退服务端 status（老快照 / 部分字段场景）', () => {
    assert.equal(groupBucketOf(groupItem({ firstRank: undefined, status: 'hit10' })), 'hit10')
  })

  it('锚集题（无 firstRank、status 为 top5/tail/miss）不归组集档', () => {
    assert.equal(groupBucketOf(anchorItem()), null)
    assert.equal(groupBucketOf(anchorItem({ status: 'miss' })), null)
  })

  it('档位标签：hit@5 / hit@10 / hit@50 / 未进池，缺档为「—」', () => {
    assert.equal(groupBucketLabel('hit5'), 'hit@5')
    assert.equal(groupBucketLabel('hit50'), 'hit@50')
    assert.equal(groupBucketLabel('miss'), '未进池')
    assert.equal(groupBucketLabel(null), '—')
  })
})

describe('cover@5 单题口径', () => {
  it('组内段数不足 5：分母取 segCount', () => {
    assert.equal(cover5OfItem(groupItem({ hit5: false, hits5: 1, segCount: 2 })), 0.5)
    assert.equal(cover5OfItem(groupItem({ hits5: 1, segCount: 1 })), 1)
  })

  it('组内段数超过 5：分母取 5', () => {
    assert.equal(cover5OfItem(groupItem({ hits5: 4, segCount: 8 })), 0.8)
  })

  it('缺 hits5 / segCount 非正：不可算返回 null（展示「—」）', () => {
    assert.equal(cover5OfItem(groupItem({ hits5: undefined })), null)
    assert.equal(cover5OfItem(groupItem({ segCount: undefined })), null)
    assert.equal(cover5OfItem(groupItem({ hits5: 0, segCount: 0 })), null)
  })
})

describe('cover@5 汇总口径', () => {
  it('优先采用快照 summary.cover5', () => {
    assert.equal(summaryCover5(groupSummary({ cover5: 0.625 })), 0.625)
  })

  it('缺 cover5 时回落 sumHits5 / sumCap5', () => {
    assert.equal(summaryCover5(groupSummary({ cover5: undefined })), 5 / 8)
  })

  it('cover5 / sumHits5 / sumCap5 全缺返回 null', () => {
    assert.equal(summaryCover5(groupSummary({ cover5: undefined, sumHits5: undefined, sumCap5: undefined })), null)
    assert.equal(summaryCover5(groupSummary({ cover5: undefined, sumCap5: 0 })), null)
    assert.equal(summaryCover5(null), null)
  })

  it('明细兜底：Σhits5 / Σmin(5, segCount)', () => {
    const results = [groupItem({ hits5: 1, segCount: 2 }), groupItem({ hits5: 2, segCount: 8 })]
    assert.equal(cover5OfResults(results), 3 / 7)
    assert.equal(cover5OfResults([]), null)
  })

  it('summary 全缺字段时 groupMetrics 用明细现算 cover@5', () => {
    const results = [groupItem({ hits5: 1, segCount: 2 }), groupItem({ hits5: 2, segCount: 8 })]
    const metrics = groupMetrics(groupSummary({ cover5: undefined, sumHits5: undefined, sumCap5: undefined }), results)
    assert.equal(metrics.cover5, 3 / 7)
  })
})

describe('未进池两类归因', () => {
  it('未进池 + 桥未命中（bridgeHit = false）归「桥未命中」', () => {
    assert.equal(missKindOf(groupItem({ firstRank: 0, bridgeHit: false })), 'noBridge')
  })

  it('未进池 + 桥已命中（bridgeHit = true）归「并池后掉窗」', () => {
    assert.equal(missKindOf(groupItem({ firstRank: 0, bridgeHit: true })), 'dropped')
  })

  it('已进池不算未进池归因', () => {
    assert.equal(missKindOf(groupItem({ firstRank: 3, bridgeHit: false })), null)
  })

  it('缺 bridgeHit 无法归因，返回 null', () => {
    assert.equal(missKindOf(groupItem({ firstRank: 0, bridgeHit: undefined })), null)
  })

  it('|未进池| 判定：仅 firstRank = 0 计；缺字段不计', () => {
    assert.equal(isUnpooled(groupItem({ firstRank: 0 })), true)
    assert.equal(isUnpooled(groupItem({ firstRank: 11 })), false)
    assert.equal(isUnpooled(groupItem({ firstRank: undefined })), false)
  })

  it('未进池清单按 bridgeHit 分成两组', () => {
    const split = splitMisses([
      groupItem({ id: 'L1#E00101', firstRank: 0, bridgeHit: false }),
      groupItem({ id: 'L2#E00201', firstRank: 0, bridgeHit: true }),
      groupItem({ id: 'L1#E00102', firstRank: 4, bridgeHit: true }),
    ])
    assert.deepEqual(split.noBridge.map((i) => i.id), ['L1#E00101'])
    assert.deepEqual(split.dropped.map((i) => i.id), ['L2#E00201'])
  })

  it('归因标签：桥未命中 / 并池后掉窗', () => {
    assert.equal(missKindLabel('noBridge'), '桥未命中')
    assert.equal(missKindLabel('dropped'), '并池后掉窗')
    assert.equal(missKindLabel(null), '—')
  })
})

describe('锚集缺字段兜底（老快照 / 异集快照一律「—」）', () => {
  it('judge 非 group（含缺 judge 的老快照）不算组判分集', () => {
    assert.equal(isGroupSummary(groupSummary()), true)
    assert.equal(isGroupSummary(anchorSummary()), false)
    assert.equal(isGroupSummary(anchorSummary({ judge: 'anchor' })), false)
    assert.equal(isGroupSummary(null), false)
  })

  it('锚集快照的组判分指标全为 null（不显示 undefined / NaN）', () => {
    const metrics = groupMetrics(anchorSummary(), [anchorItem()])
    assert.deepEqual(Object.values(metrics), [null, null, null, null, null, null, null, null, null])
  })

  it('锚集快照的指标行全部显示「—」', () => {
    const rows = groupMetricRows(anchorSummary(), [anchorItem()])
    assert.equal(rows.length, 8)
    assert.deepEqual([...new Set(rows.map((r) => r.text))], ['—'])
  })

  it('组集快照指标行给出读数（cover@5 主判据在前）', () => {
    const rows = groupMetricRows(groupSummary(), [groupItem({ firstRank: 0, bridgeHit: false })])
    assert.deepEqual(rows.map((r) => r.key), [
      'cover5',
      'hit5',
      'hit10',
      'hit50',
      'bridgeHitRate',
      'miss',
      'missNoBridge',
      'dropped',
    ])
    assert.equal(rows[0]?.text, '62.5%')
    assert.equal(rows[1]?.text, '2/4（50.0%）')
    assert.equal(rows[4]?.text, '75.0%')
    assert.equal(rows[5]?.text, '1/4（25.0%）')
    assert.equal(rows[6]?.text, '1')
    assert.equal(rows[7]?.text, '0')
  })

  it('每个指标行都带移入说明（简洁非空，且互不重复）', () => {
    const rows = groupMetricRows(groupSummary(), [groupItem({ firstRank: 0, bridgeHit: false })])
    assert.equal(rows.every((r) => r.tip.length > 0), true)
    assert.equal(new Set(rows.map((r) => r.tip)).size, rows.length)
    assert.equal(rows.every((r) => r.tip.length <= 40), true)
  })

  it('展示兜底：缺字段计数 / 比率 / 分子分母都显示「—」，不出现 undefined / NaN', () => {
    assert.equal(groupCountText(undefined), '—')
    assert.equal(groupCountText(null), '—')
    assert.equal(groupRateText(undefined), '—')
    assert.equal(groupCountRateText(undefined, 4), '—')
    assert.equal(groupCountRateText(4, undefined), '—')
    const texts = groupMetricRows(anchorSummary(), []).map((r) => r.text)
    assert.equal(texts.every((t) => t === '—'), true)
  })

  it('首段名次展示：未进池 / 名次 / 缺字段', () => {
    assert.equal(firstRankText(0), '未进池')
    assert.equal(firstRankText(7), '7')
    assert.equal(firstRankText(null), '—')
  })
})
