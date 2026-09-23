import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import type { CacheLogRecord } from '../api/client'
import {
  bucketZone,
  CACHE_LOW_SIM_LINE,
  CACHE_REASON_LABELS,
  CACHE_ZONE_COLORS,
  cacheBadge,
  cacheFormulaText,
  cacheHitTooltipText,
  cacheZone,
  formatHitLine,
  similarityHitBadge,
  similarityHitStatus,
  formatSimilarity,
} from './cacheDiagnostics.ts'

// ── 缓存判定展示：格式化与区间着色单测（feat-A013，node:test，跑法：npm test）──

const HIT_LINE = 0.92

describe('formatSimilarity（相似度 4 位小数口径）', () => {
  it('0.9821 → 0.9821；1 → 1.0000；0.8 → 0.8000', () => {
    assert.equal(formatSimilarity(0.9821), '0.9821')
    assert.equal(formatSimilarity(1), '1.0000')
    assert.equal(formatSimilarity(0.8), '0.8000')
  })

  it('null / undefined → —（池空）', () => {
    assert.equal(formatSimilarity(null), '—')
    assert.equal(formatSimilarity(undefined), '—')
  })
})

describe('formatHitLine（命中线去尾零）', () => {
  it('0.92 → 0.92；0.9821 → 0.9821', () => {
    assert.equal(formatHitLine(0.92), '0.92')
    assert.equal(formatHitLine(0.9821), '0.9821')
  })
})

describe('cacheZone 分区边界（0.80 下沿固定 / 命中线可配置）', () => {
  it('低相似 < 0.80', () => {
    assert.equal(CACHE_LOW_SIM_LINE, 0.8)
    assert.equal(cacheZone(0.79, HIT_LINE), 'low')
    assert.equal(cacheZone(0, HIT_LINE), 'low')
  })

  it('灰色区 [0.80, hitLine)', () => {
    assert.equal(cacheZone(0.8, HIT_LINE), 'gray')
    assert.equal(cacheZone(0.9199, HIT_LINE), 'gray')
  })

  it('高置信 ≥ hitLine', () => {
    assert.equal(cacheZone(0.92, HIT_LINE), 'high')
    assert.equal(cacheZone(1, HIT_LINE), 'high')
  })

  it('null（池空行）落低相似档', () => {
    assert.equal(cacheZone(null, HIT_LINE), 'low')
  })

  it('命中线变化只改分界，不区域分逻辑', () => {
    assert.equal(cacheZone(0.85, 0.9), 'gray')
    assert.equal(cacheZone(0.9, 0.9), 'high')
  })
})

describe('bucketZone 桶按区间（下沿）着色', () => {
  it('0.80 / 0.92 恰为桶边界，着色不跨桶', () => {
    assert.equal(bucketZone(0.78, HIT_LINE), 'low')
    assert.equal(bucketZone(0.8, HIT_LINE), 'gray')
    assert.equal(bucketZone(0.9, HIT_LINE), 'gray')
    assert.equal(bucketZone(0.92, HIT_LINE), 'high')
    assert.equal(bucketZone(0.98, HIT_LINE), 'high')
  })
})

describe('CACHE_ZONE_COLORS 三色', () => {
  it('蓝（低相似）/ 黄（灰色区）/ 绿（高置信）', () => {
    assert.equal(CACHE_ZONE_COLORS.low, '#8ab6e8')
    assert.equal(CACHE_ZONE_COLORS.gray, '#f0bf4c')
    assert.equal(CACHE_ZONE_COLORS.high, '#2e7d57')
  })
})

function mkCache(partial: Partial<CacheLogRecord>): CacheLogRecord {
  return {
    hit: true,
    hitLine: 0.92,
    similarity: 0.9821,
    tieHits: 1,
    userQuery: '严颜是怎么被义释的',
    nearestQuery: '义释严颜是怎么回事',
    reason: 'hit',
    marked: false,
    createdAt: 1779408000000,
    ...partial,
  }
}

describe('cacheFormulaText 命中解释算式代入（对齐 A009 最终分口径，非只给数字）', () => {
  it('命中：最高相似度 0.9821 ≥ 命中线 0.92 → 命中', () => {
    assert.equal(cacheFormulaText(mkCache({})), '最高相似度 0.9821 ≥ 命中线 0.92 → 命中')
  })

  it('灰色区：最高相似度 0.8512 < 命中线 0.92 → 未命中（灰色区）', () => {
    assert.equal(
      cacheFormulaText(mkCache({ hit: false, reason: 'miss-gray', similarity: 0.8512 })),
      '最高相似度 0.8512 < 命中线 0.92 → 未命中（灰色区）',
    )
  })

  it('低相似：最高相似度 0.7163 < 命中线 0.92 → 未命中（低相似）', () => {
    assert.equal(
      cacheFormulaText(mkCache({ hit: false, reason: 'miss-low', similarity: 0.7163 })),
      '最高相似度 0.7163 < 命中线 0.92 → 未命中（低相似）',
    )
  })

  it('歧义：≥ 命中线候选 2 条 → 歧义，不命中', () => {
    assert.equal(
      cacheFormulaText(mkCache({ hit: false, reason: 'miss-tie', similarity: 0.955, tieHits: 2 })),
      '≥ 命中线候选 2 条 → 歧义，不命中',
    )
  })

  it('焦点拒判：最高相似度 0.9550 ≥ 命中线 0.92，焦点不一致 → 不命中', () => {
    assert.equal(
      cacheFormulaText(mkCache({ hit: false, reason: 'miss-focus', similarity: 0.955 })),
      '最高相似度 0.9550 ≥ 命中线 0.92，焦点不一致 → 不命中',
    )
  })

  it('低相似且池空（similarity null）：最高相似度 — < 命中线 0.92 → 未命中（低相似）', () => {
    assert.equal(
      cacheFormulaText(mkCache({ hit: false, reason: 'miss-low', similarity: null })),
      '最高相似度 — < 命中线 0.92 → 未命中（低相似）',
    )
  })
})

describe('cacheBadge 缓存判定徽标', () => {
  it('命中 → 绿标「缓存命中，未走检索」', () => {
    const badge = cacheBadge(mkCache({}))
    assert.equal(badge.text, '缓存命中，未走检索')
    assert.equal(badge.color, 'green')
  })

  it('低相似 → 灰标；灰色区 → 黄标（差点命中谁）', () => {
    assert.equal(cacheBadge(mkCache({ hit: false, reason: 'miss-low' })).color, 'default')
    const gray = cacheBadge(mkCache({ hit: false, reason: 'miss-gray' }))
    assert.equal(gray.color, 'gold')
    assert.ok(gray.text.includes('差点命中谁'))
  })

  it('歧义 / 焦点拒判 → 橙标', () => {
    assert.equal(cacheBadge(mkCache({ hit: false, reason: 'miss-tie' })).color, 'orange')
    assert.equal(cacheBadge(mkCache({ hit: false, reason: 'miss-focus' })).color, 'orange')
  })
})

describe('cacheHitTooltipText 列表行 hover 一行', () => {
  it('1 → 缓存命中；0 → 缓存未命中；null / undefined 无标', () => {
    assert.equal(cacheHitTooltipText(1), '缓存命中')
    assert.equal(cacheHitTooltipText(0), '缓存未命中')
    assert.equal(cacheHitTooltipText(null), null)
    assert.equal(cacheHitTooltipText(undefined), null)
  })
})

describe('CACHE_REASON_LABELS reason 文案', () => {
  it('五种 reason 均有可读文案', () => {
    assert.equal(CACHE_REASON_LABELS.hit, '命中')
    assert.equal(CACHE_REASON_LABELS['miss-gray'], '灰色区未命中')
    assert.equal(CACHE_REASON_LABELS['miss-tie'], '歧义未命中')
  })
})

// ── 相似度分布明细命中状态（bug-00027，§3.11 行派生口径）──

describe('similarityHitStatus（分布明细命中状态派生）', () => {
  it('hit=1 → 命中（不论 similarity / tieHits）', () => {
    assert.equal(similarityHitStatus(true, 0.8512, HIT_LINE, 1), 'hit')
    assert.equal(similarityHitStatus(true, null, HIT_LINE, null), 'hit')
  })

  it('hit=0 且 similarity===null（池空）→ 未命中·低相似', () => {
    assert.equal(similarityHitStatus(false, null, HIT_LINE, null), 'miss-low')
    assert.equal(similarityHitStatus(false, undefined, HIT_LINE, undefined), 'miss-low')
  })

  it('hit=0 且 similarity<0.80 → 未命中·低相似', () => {
    assert.equal(similarityHitStatus(false, 0.79, HIT_LINE, 1), 'miss-low')
    assert.equal(similarityHitStatus(false, 0.716, HIT_LINE, null), 'miss-low')
    assert.equal(similarityHitStatus(false, 0, HIT_LINE, 2), 'miss-low')
  })

  it('hit=0 且 0.80 ≤ similarity < hitLine → 未命中·灰色区', () => {
    assert.equal(similarityHitStatus(false, 0.8, HIT_LINE, 1), 'miss-gray')
    assert.equal(similarityHitStatus(false, 0.9199, HIT_LINE, null), 'miss-gray')
  })

  it('hit=0 且 similarity ≥ hitLine：tieHits≥2 → 歧义；否则 → 焦点拒判', () => {
    assert.equal(similarityHitStatus(false, 0.92, HIT_LINE, 2), 'miss-tie')
    assert.equal(similarityHitStatus(false, 0.98, HIT_LINE, 5), 'miss-tie')
    assert.equal(similarityHitStatus(false, HIT_LINE, HIT_LINE, 1), 'miss-focus')
    assert.equal(similarityHitStatus(false, 0.9821, HIT_LINE, null), 'miss-focus')
    assert.equal(similarityHitStatus(false, 1, HIT_LINE, 0), 'miss-focus')
  })
})

describe('similarityHitBadge（标签文案与颜色）', () => {
  it('五档文案符合 bug-00027 口径', () => {
    assert.deepEqual(similarityHitBadge('hit'), { text: '命中', color: 'green' })
    assert.deepEqual(similarityHitBadge('miss-low'), { text: '未命中·低相似', color: 'default' })
    assert.deepEqual(similarityHitBadge('miss-gray'), { text: '未命中·灰色区', color: 'gold' })
    assert.deepEqual(similarityHitBadge('miss-tie'), { text: '未命中·歧义', color: 'orange' })
    assert.deepEqual(similarityHitBadge('miss-focus'), { text: '未命中·焦点拒判', color: 'orange' })
  })
})
