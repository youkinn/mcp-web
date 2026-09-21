import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import type { RetrievalDiagnostics } from '../api/client'
import {
  boolText,
  buildDiagnosticsView,
  buildEnvView,
  buildFunnel,
  buildNextRankView,
  buildScoreRow,
  buildSelfConsistency,
  formatScore,
  sourceMeta,
  truncatedText,
} from './retrievalDiagnostics.ts'

// ── 检索诊断数据整形 / 自洽检查单测（feat-A009，node:test，跑法：npm test）──

const fullDiagnostics: RetrievalDiagnostics = {
  truncated: false,
  truncatedCount: 0,
  query: {
    raw: '关羽千里走单骑的经过',
    normalized: '关羽 千里走单骑 经过',
    tokens: ['关羽', '千里', '走单骑', '经过'],
  },
  env: {
    vectorScheme: 'bge-m3',
    degradedBm25Only: false,
    corpusChunks: 2344,
    aliasCount: 87,
    vectorDim: 1024,
  },
  funnel: {
    corpusChunks: 2344,
    lexicalHits: 42,
    vectorTop50: 50,
    labelHits: 3,
    mergedCandidates: 45,
    topN: 10,
    injected: 5,
    cited: 3,
  },
  candidates: [
    {
      rank: 1,
      chunkId: 'sanguo-yanyi:0073:c0007',
      chapter: 73,
      title: '玄德进位汉中王　云长攻拔襄阳郡',
      bm25: 12.34,
      cosine: 0.812,
      labelHit: true,
      finalScore: 0.92,
      sources: ['lexical', 'vector'],
      injected: true,
      cited: true,
    },
    {
      rank: 11,
      chunkId: 'sanguo-yanyi:0075:c0003',
      chapter: 75,
      title: '关云长刮骨疗毒　吕子明白衣渡江',
      bm25: null,
      cosine: 0.42,
      labelHit: false,
      finalScore: 0.33,
      sources: ['vector'],
      injected: false,
      cited: true,
    },
  ],
  nextRank: {
    rank: 11,
    chunkId: 'sanguo-yanyi:0075:c0003',
    chapter: 75,
    title: '关云长刮骨疗毒　吕子明白衣渡江',
    bm25: null,
    cosine: 0.42,
    labelHit: false,
    finalScore: 0.33,
    sources: ['vector'],
    injected: false,
    cited: true,
    gapToTopN: 0.19,
  },
  deathIntent: {
    detected: true,
    pinned: true,
    chunkIds: ['sanguo-yanyi:0001:c0001'],
  },
}

describe('buildDiagnosticsView 汇总视图', () => {
  it('diagnostics 有值时返回完整视图（漏斗 / 分数表 / query 链 / 环境 / nextRank / 死亡意图）', () => {
    const view = buildDiagnosticsView(fullDiagnostics, 3)
    assert.ok(view, '有诊断时应返回视图')
    assert.equal(view.truncatedText, null)
    assert.equal(view.funnel.lead.value, 2344)
    assert.equal(view.funnel.lead.label, '语料 chunk')
    assert.equal(view.funnel.branch.length, 3)
    assert.equal(view.funnel.branch[1].label, '向量 top50')
    assert.equal(view.funnel.tail.length, 4)
    assert.equal(view.funnel.tail[1].key, 'topn')
    assert.equal(view.funnel.tail[1].topn, true)
    assert.equal(view.scoreRows.length, 2)
    assert.equal(view.scoreRows[0].chunkId, 'sanguo-yanyi:0073:c0007')
    assert.equal(view.scoreRows[0].inTopN, true)
    assert.equal(view.scoreRows[0].chapterText, '第 73 回 玄德进位汉中王　云长攻拔襄阳郡')
    assert.equal(view.scoreRows[0].sources.length, 2)
    assert.equal(view.nextRank?.gapToTopNText, '0.19')
    assert.equal(view.query.raw, '关羽千里走单骑的经过')
    assert.equal(view.env.vectorSchemeText, 'bge-m3')
    assert.equal(view.env.corpusChunks, 2344)
    assert.equal(view.env.aliasCount, 87)
    assert.equal(view.env.vectorDimText, '1024')
    assert.equal(view.deathIntent.detected, true)
    assert.equal(view.deathIntent.chunkIds[0], 'sanguo-yanyi:0001:c0001')
  })

  it('diagnostics 为 null 时返回 null（老数据 / 未产出，前端不渲染面板）', () => {
    assert.equal(buildDiagnosticsView(null, null), null)
    assert.equal(buildDiagnosticsView(null, 0), null)
  })

  it('truncated 为 true 时给出截断标记与丢弃条数，未截断返回 null', () => {
    const view = buildDiagnosticsView({ ...fullDiagnostics, truncated: true, truncatedCount: 7 }, null)
    assert.ok(view?.truncatedText)
    assert.match(view!.truncatedText!, /诊断已截断（64KB），候选显示不全/)
    assert.match(view!.truncatedText!, /已丢弃 7 条候选/)
    assert.equal(truncatedText(fullDiagnostics), null)
  })

  it('nextRank 缺失（null）时 nextRank 视图为 null', () => {
    const view = buildDiagnosticsView({ ...fullDiagnostics, nextRank: null }, null)
    assert.ok(view)
    assert.equal(view.nextRank, null)
  })

  it('sango 产出阶段 funnel 的 injected / cited 为 null，漏斗不含对应阶段', () => {
    const funnel = buildFunnel({ ...fullDiagnostics.funnel, injected: null, cited: null })
    assert.equal(funnel.tail.length, 2)
    assert.deepEqual(
      funnel.tail.map((stage) => stage.key),
      ['merged', 'topn'],
    )
    const view = buildDiagnosticsView({ ...fullDiagnostics, funnel: { ...fullDiagnostics.funnel, injected: null, cited: null } }, null)
    assert.ok(view)
    assert.equal(view.funnel.tail.length, 2)
  })
})

describe('分数整形（buildScoreRow / formatScore / boolText / sourceMeta）', () => {
  it('分数格式化：整数原样、浮点保留最多 4 位、null 显示 —', () => {
    assert.equal(formatScore(12.34), '12.34')
    assert.equal(formatScore(0.812), '0.812')
    assert.equal(formatScore(0.19), '0.19')
    assert.equal(formatScore(10), '10')
    assert.equal(formatScore(null), '—')
  })

  it('布尔整形：true 是 / false 否 / null —', () => {
    assert.equal(boolText(true), '是')
    assert.equal(boolText(false), '否')
    assert.equal(boolText(null), '—')
  })

  it('来源映射：lexical / vector / label 中文文案，未知来源回退原值', () => {
    assert.deepEqual(sourceMeta('lexical'), { text: '词法', color: 'blue' })
    assert.deepEqual(sourceMeta('vector'), { text: '向量', color: 'purple' })
    assert.deepEqual(sourceMeta('label'), { text: '标签', color: 'gold' })
    assert.deepEqual(sourceMeta('unknown'), { text: 'unknown', color: 'default' })
  })

  it('分数表行：chunkId / 回目 / BM25 / 余弦 null 显示 —，rank 进 top-N 标记', () => {
    const row = buildScoreRow(fullDiagnostics.candidates[1], fullDiagnostics.funnel.topN)
    assert.equal(row.chunkId, 'sanguo-yanyi:0075:c0003')
    assert.equal(row.chapterText, '第 75 回 关云长刮骨疗毒　吕子明白衣渡江')
    assert.equal(row.bm25Text, '—')
    assert.equal(row.cosineText, '0.42')
    assert.equal(row.finalScoreText, '0.33')
    assert.equal(row.injectedText, '否')
    assert.equal(row.citedText, '是')
    assert.equal(row.inTopN, false)
    assert.equal(buildScoreRow(fullDiagnostics.candidates[0], 10).inTopN, true)
  })
})

describe('环境与降级（buildEnvView / nextRank 视图）', () => {
  it('降级纯 BM25：degradedBm25Only 为 true，向量 scheme / dim 显示 —', () => {
    const env = buildEnvView({ vectorScheme: null, degradedBm25Only: true, corpusChunks: 2344, aliasCount: 87, vectorDim: null })
    assert.equal(env.degradedBm25Only, true)
    assert.equal(env.vectorSchemeText, '—')
    assert.equal(env.vectorDimText, '—')
    const view = buildDiagnosticsView(
      {
        ...fullDiagnostics,
        env: { vectorScheme: null, degradedBm25Only: true, corpusChunks: 2344, aliasCount: 87, vectorDim: null },
      },
      null,
    )
    assert.ok(view)
    assert.equal(view.env.degradedBm25Only, true)
  })

  it('第 N+1 名视图：chunkId / 回目 / 三路分 / gapToTopN 文本', () => {
    const next = buildNextRankView(fullDiagnostics.nextRank!)
    assert.equal(next.chunkId, 'sanguo-yanyi:0075:c0003')
    assert.equal(next.chapterText, '第 75 回 关云长刮骨疗毒　吕子明白衣渡江')
    assert.equal(next.bm25Text, '—')
    assert.equal(next.cosineText, '0.42')
    assert.equal(next.finalScoreText, '0.33')
    assert.equal(next.gapToTopNText, '0.19')
  })
})

describe('自洽检查（buildSelfConsistency）', () => {
  it('citations 与 funnel.cited 一致时不告警', () => {
    const result = buildSelfConsistency(fullDiagnostics.funnel, fullDiagnostics.candidates, 3)
    assert.equal(result.citationMismatch, false)
  })

  it('citations 与 funnel.cited 不一致时告警并给出分差文本', () => {
    const result = buildSelfConsistency(fullDiagnostics.funnel, fullDiagnostics.candidates, 5)
    assert.equal(result.citationMismatch, true)
    assert.match(result.citationMismatchText, /引用与召回不自洽：citations 5 条 vs funnel.cited 3 条/)
  })

  it('citations 条数未知（null）时不做引用数自洽判断', () => {
    const result = buildSelfConsistency(fullDiagnostics.funnel, fullDiagnostics.candidates, null)
    assert.equal(result.citationMismatch, false)
    assert.equal(result.citationMismatchText, '')
  })

  it('存在 cited=true 且 rank 大于 topN 的候选时标记被引用未进 top-N', () => {
    const result = buildSelfConsistency(fullDiagnostics.funnel, fullDiagnostics.candidates, 3)
    assert.equal(result.citedOutsideTopN, true)
  })

  it('所有被引用候选都在 top-N 内时不告警', () => {
    const candidates = fullDiagnostics.candidates.map((candidate) => ({ ...candidate, cited: false }))
    const result = buildSelfConsistency(fullDiagnostics.funnel, candidates, 0)
    assert.equal(result.citedOutsideTopN, false)
  })
})