import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import type { BenchmarkResultItem, BenchmarkSummary } from '../api/client'
import { chapterRankOf, chapterTop5Of, isNoAnchor, judgedOf, noAnchorCountOf } from './benchmarkJudged.ts'

// ── 零锚题口径单测（bug-00052）：可判题数 / 未参与评分数的兜底规则 ──

function baseSummary(extra: Partial<BenchmarkSummary>): BenchmarkSummary {
  return {
    tool: 'mock',
    version: '1',
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

describe('judgedOf', () => {
  it('新快照：有 judged 直接采用', () => {
    assert.equal(judgedOf(baseSummary({ judged: 8, noAnchorCount: 2 })), 8)
  })

  it('过渡期：无 judged 有 noAnchorCount 按 total - noAnchorCount', () => {
    assert.equal(judgedOf(baseSummary({ noAnchorCount: 2 })), 8)
  })

  it('老快照：judged / noAnchorCount 都缺按 total 兜底', () => {
    assert.equal(judgedOf(baseSummary({})), 10)
  })

  it('异常数据：noAnchorCount 超过 total 时钳制为非负', () => {
    assert.equal(judgedOf(baseSummary({ noAnchorCount: 99 })), 0)
  })
})

describe('noAnchorCountOf', () => {
  it('有 noAnchorCount 采用，无则按 0 兜底', () => {
    assert.equal(noAnchorCountOf(baseSummary({ noAnchorCount: 2 })), 2)
    assert.equal(noAnchorCountOf(baseSummary({})), 0)
  })
})

describe('isNoAnchor', () => {
  const item = { noAnchor: true } as unknown as BenchmarkResultItem
  it('noAnchor=true 判定为零锚，缺省 / false 视为参与评分', () => {
    assert.equal(isNoAnchor(item), true)
    assert.equal(isNoAnchor({ ...item, noAnchor: false }), false)
    assert.equal(isNoAnchor({ ...item, noAnchor: undefined }), false)
  })
})

// ── 回级命中口径（bug-00063）：分类 / 顶层回级命中数、单题回目池内名次的兜底规则 ──

describe('chapterTop5Of', () => {
  it('有值时透传', () => {
    assert.equal(chapterTop5Of({ chapterTop5: 7 }), 7)
  })

  it('老快照缺字段按 0 兜底', () => {
    assert.equal(chapterTop5Of({}), 0)
    assert.equal(chapterTop5Of({ chapterTop5: undefined }), 0)
  })
})

describe('chapterRankOf', () => {
  it('有值时透传（未进池的 0 原样返回）', () => {
    assert.equal(chapterRankOf({ chapterRank: 3 } as BenchmarkResultItem), 3)
    assert.equal(chapterRankOf({ chapterRank: 0 } as BenchmarkResultItem), 0)
  })

  it('老快照缺字段按 0 兜底', () => {
    assert.equal(chapterRankOf({} as BenchmarkResultItem), 0)
  })
})
