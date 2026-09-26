import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import type { RetrievalCandidate, RetrievalDiagnostics } from '../api/client'
import {
  boolText,
  buildDiagnosticsView,
  buildEnvView,
  buildFunnel,
  buildNextRankView,
  buildQueryChain,
  buildScoreRow,
  buildScoreRows,
  buildSelfConsistency,
  citedTag,
  displayChunkId,
  finalScoreFormula,
  formatScore,
  MERGED_CANDIDATES_HINT,
  rewriteStageValueText,
  SCORING_FORMULA_NOTE,
  scoreRowClass,
  sourceMeta,
  timingLines,
  truncatedText,
  vectorMap,
} from './retrievalDiagnostics.ts'

// ── 检索诊断数据整形 / 自洽检查单测（feat-A009，node:test，跑法：npm test）──

const fullDiagnostics: RetrievalDiagnostics = {
  truncated: false,
  truncatedCount: 0,
  query: {
    raw: '云长千里走单骑的经过',
    normalized: '关羽 千里走单骑 经过',
    tokens: ['关羽', '千里', '走单骑', '经过'],
    rewrites: [{ from: '云长', to: '关羽' }],
  },
  env: {
    vectorScheme: 'bge-m3',
    degradedBm25Only: false,
    corpusChunks: 2344,
    aliasCount: 87,
    vectorDim: 1024,
    normVersion: 'a1b2c3d4e5',
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
      bm25Norm: 0.66,
      cosine: 0.812,
      labelHit: true,
      hitLabels: ['人物之死-关羽之死', '人物之死'],
      finalScore: 0.842,
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
      bm25Norm: null,
      cosine: 0.42,
      labelHit: false,
      finalScore: 0.426,
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
    bm25Norm: null,
    cosine: 0.42,
    labelHit: false,
    finalScore: 0.426,
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
    assert.equal(view.query.raw, '云长千里走单骑的经过')
    assert.deepEqual(view.query.rewrites, [{ from: '云长', to: '关羽' }])
    assert.equal(view.env.vectorSchemeText, 'bge-m3')
    assert.equal(view.env.corpusChunks, 2344)
    assert.equal(view.env.aliasCount, 87)
    assert.equal(view.env.vectorDimText, '1024')
    assert.equal(view.env.normVersion, 'a1b2c3d4e5')
    assert.equal(view.funnel.pre.key, 'rewrite')
    assert.equal(view.funnel.pre.label, '归一化改写')
    assert.equal(view.funnel.pre.value, 1)
    assert.equal(view.funnel.pre.hint, 'embed 前')
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

describe('feat-A016 验收 8：归一化改写可观测（rewrites / normVersion / 漏斗预置环节）', () => {
  it('漏斗 pre 预置环节：key / label / value=rewrites 命中数 / hint「embed 前」，位于语料 chunk 之前', () => {
    const funnel = buildFunnel(fullDiagnostics.funnel, 3)
    assert.equal(funnel.pre.key, 'rewrite')
    assert.equal(funnel.pre.label, '归一化改写')
    assert.equal(funnel.pre.value, 3)
    assert.equal(funnel.pre.hint, 'embed 前')
    assert.equal(funnel.lead.key, 'corpus')
    assert.equal(funnel.lead.label, '语料 chunk')
    // 预置环节位于 lead 之前：hints 首条即「embed 前」，随后才是合并候选口径说明
    assert.deepEqual(funnel.hints, ['embed 前', MERGED_CANDIDATES_HINT])
  })

  it('rewriteCount 缺省按 0（老用例 / 无改写），不产生残留环节', () => {
    const funnel = buildFunnel(fullDiagnostics.funnel)
    assert.equal(funnel.pre.value, 0)
  })

  it('归一化改写环节展示文本：命中数 > 0 显示数字，0 显示「无改写」', () => {
    assert.equal(rewriteStageValueText(0), '无改写')
    assert.equal(rewriteStageValueText(1), '1')
    assert.equal(rewriteStageValueText(3), '3')
  })

  it('query 链透传改写明细（原文片段 → 规范形），历史 trace 无字段缺省 []', () => {
    assert.deepEqual(buildQueryChain(fullDiagnostics.query).rewrites, [{ from: '云长', to: '关羽' }])
    const legacy = buildQueryChain({ raw: 'x', normalized: 'y', tokens: [] })
    assert.deepEqual(legacy.rewrites, [])
  })

  it('env 透传 normVersion，历史 trace 无字段缺省空串', () => {
    assert.equal(buildEnvView(fullDiagnostics.env).normVersion, 'a1b2c3d4e5')
    const legacy = buildEnvView({ vectorScheme: null, degradedBm25Only: false, corpusChunks: 2344, aliasCount: 87, vectorDim: null })
    assert.equal(legacy.normVersion, '')
  })

  it('汇总视图联动：rewrites 命中数注入漏斗 pre.value，历史 trace 整体缺省（pre=0 / rewrites=[] / normVersion=""）', () => {
    const view = buildDiagnosticsView(fullDiagnostics, null)
    assert.ok(view)
    assert.equal(view.funnel.pre.value, fullDiagnostics.query.rewrites!.length)
    const legacy = buildDiagnosticsView(
      {
        ...fullDiagnostics,
        query: { raw: 'x', normalized: 'y', tokens: [] },
        env: { vectorScheme: null, degradedBm25Only: false, corpusChunks: 2344, aliasCount: 87, vectorDim: null },
      },
      null,
    )
    assert.ok(legacy)
    assert.equal(legacy.funnel.pre.value, 0)
    assert.deepEqual(legacy.query.rewrites, [])
    assert.equal(legacy.env.normVersion, '')
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

  it('分数表行：chunkId / 回目 / BM25归一化 / 向量映射 null 显示 —，rank 进 top-N 标记', () => {
    const row = buildScoreRow(fullDiagnostics.candidates[1], fullDiagnostics.funnel.topN)
    assert.equal(row.chunkId, 'sanguo-yanyi:0075:c0003')
    assert.equal(row.chapterText, '第 75 回 关云长刮骨疗毒　吕子明白衣渡江')
    assert.equal(row.bm25NormText, '—')
    assert.equal(row.vectorMapText, '0.71')
    assert.equal(row.labelHit, false)
    assert.equal(row.finalScoreText, '0.426')
    assert.equal(row.bm25RawText, '—')
    assert.equal(row.cosineRawText, '0.42')
    assert.equal(row.injectedText, '否')
    assert.equal(row.citedText, '是')
    assert.equal(row.inTopN, false)
    assert.equal(buildScoreRow(fullDiagnostics.candidates[0], 10).inTopN, true)
  })

  it('chunkId 展示文本：去掉 sanguo-yanyi: 前缀，完整 chunkId 仍供点击 / 复制（feat-A012 验收 6.1）', () => {
    const row = buildScoreRow(fullDiagnostics.candidates[0], fullDiagnostics.funnel.topN)
    assert.equal(row.chunkId, 'sanguo-yanyi:0073:c0007')
    assert.equal(row.chunkIdText, '0073:c0007')
    assert.equal(displayChunkId('sanguo-yanyi:0005:c0018'), '0005:c0018')
    // 非 sanguo 前缀原样展示（兜底不误删）
    assert.equal(displayChunkId('other-domain:x'), 'other-domain:x')
  })

  it('标签命中列 tooltip：命中候选逐行拼接命中标签，未命中 / 历史 trace 无字段为空串', () => {
    const hit = buildScoreRow(fullDiagnostics.candidates[0], fullDiagnostics.funnel.topN)
    assert.equal(hit.hitLabelsTitle, '人物之死-关羽之死\n人物之死')
    assert.equal(hit.labelHit, true)
    // 历史 trace 落库的诊断没有 hitLabels（undefined），title 必须为空串、不得出现 undefined 字样
    const legacy = buildScoreRow({ ...fullDiagnostics.candidates[0], hitLabels: undefined }, 10)
    assert.equal(legacy.hitLabelsTitle, '')
    assert.doesNotMatch(legacy.hitLabelsTitle, /undefined/)
    // 未命中候选：labelHit 为 false 且无命中标签
    const miss = buildScoreRow(fullDiagnostics.candidates[1], fullDiagnostics.funnel.topN)
    assert.equal(miss.labelHit, false)
    assert.equal(miss.hitLabelsTitle, '')
  })
})

describe('feat-A010 验收 5：候选行携带原始 chapter / title（阅读器入参，不解析 chunkId 字符串）', () => {
  it('buildScoreRow 输出原始回号与回目，供打开阅读器直接使用', () => {
    const row = buildScoreRow(fullDiagnostics.candidates[0], fullDiagnostics.funnel.topN)
    assert.equal(row.chapter, 73)
    assert.equal(row.title, '玄德进位汉中王　云长攻拔襄阳郡')
    assert.equal(row.chunkId, 'sanguo-yanyi:0073:c0007')
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

  it('第 N+1 名视图：chunkId / 回目 / 三路分（bm25归一化 + 向量映射 + 标签）/ gapToTopN 文本', () => {
    const next = buildNextRankView(fullDiagnostics.nextRank!)
    assert.equal(next.chunkId, 'sanguo-yanyi:0075:c0003')
    assert.equal(next.chapterText, '第 75 回 关云长刮骨疗毒　吕子明白衣渡江')
    assert.equal(next.bm25NormText, '—')
    assert.equal(next.vectorMapText, '0.71')
    assert.equal(next.labelHit, false)
    assert.equal(next.finalScoreText, '0.426')
    assert.equal(next.bm25RawText, '—')
    assert.equal(next.cosineRawText, '0.42')
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

describe('验收修复：被引用标记与口径说明（feat-A009 / story-A009-04）', () => {
  it('cited=true 的行带「被引用」cyan 标记，未引用行标记为 null', () => {
    assert.deepEqual(citedTag(true), { text: '被引用', color: 'cyan' })
    assert.equal(citedTag(false), null)
    assert.equal(citedTag(null), null)
    const citedRow = buildScoreRow(fullDiagnostics.candidates[0], fullDiagnostics.funnel.topN)
    assert.equal(citedRow.cited, true)
    assert.deepEqual(citedRow.citedTag, { text: '被引用', color: 'cyan' })
    const uncitedRow = buildScoreRow({ ...fullDiagnostics.candidates[0], cited: null }, 10)
    assert.equal(uncitedRow.cited, false)
    assert.equal(uncitedRow.citedTag, null)
  })

  it('行高亮 class：进 top-N 绿标与被引用高亮可叠加，普通行无 class', () => {
    const [citedTopN, citedOutsideTopN, plain] = buildScoreRows(
      [
        fullDiagnostics.candidates[0],
        fullDiagnostics.candidates[1],
        { ...fullDiagnostics.candidates[0], rank: 20, cited: false },
      ],
      fullDiagnostics.funnel.topN,
    )
    assert.equal(scoreRowClass(citedTopN), 'diag-row-in-topn diag-row-cited')
    assert.equal(scoreRowClass(citedOutsideTopN), 'diag-row-cited')
    assert.equal(scoreRowClass(plain), '')
  })

  it('漏斗给出合并候选口径说明：三路并集去重、非相加', () => {
    const funnel = buildFunnel(fullDiagnostics.funnel)
    assert.equal(funnel.hints.length, 2)
    assert.equal(funnel.hints[0], 'embed 前')
    assert.equal(funnel.hints[1], MERGED_CANDIDATES_HINT)
    assert.match(funnel.hints[1], /并集去重/)
    assert.match(funnel.hints[1], /非相加/)
    assert.equal(
      funnel.tail.find((stage) => stage.key === 'merged')?.hint,
      MERGED_CANDIDATES_HINT,
    )
    const partial = buildFunnel({ ...fullDiagnostics.funnel, injected: null, cited: null })
    assert.equal(partial.hints.length, 2)
  })

  it('计分口径说明非空、含三路权重与取值区间，并随汇总视图下发', () => {
    assert.ok(SCORING_FORMULA_NOTE.length > 0)
    assert.match(SCORING_FORMULA_NOTE, /0\.6/)
    assert.match(SCORING_FORMULA_NOTE, /0\.3/)
    assert.match(SCORING_FORMULA_NOTE, /0\.1/)
    assert.match(SCORING_FORMULA_NOTE, /\[0,1\]/)
    const view = buildDiagnosticsView(fullDiagnostics, 3)
    assert.ok(view)
    assert.equal(view.scoringNote, SCORING_FORMULA_NOTE)
  })
})

describe('bug-00013：候选分数三路分量肉眼复算 finalScore', () => {
  it('向量映射 helper：cosine 有值时 (cosine+1)/2，null（降级纯 BM25）按 0', () => {
    assert.equal(formatScore(vectorMap(0.812)), '0.906')
    assert.equal(formatScore(vectorMap(0.42)), '0.71')
    assert.equal(vectorMap(null), 0)
  })

  it('分数表行直接给出 bm25 归一化 / 向量映射 / 标签命中 / 最终分，按公式可复算', () => {
    const row = buildScoreRow(fullDiagnostics.candidates[0], fullDiagnostics.funnel.topN)
    assert.equal(row.bm25NormText, '0.66')
    assert.equal(row.vectorMapText, '0.906')
    assert.equal(row.labelHit, true)
    assert.equal(row.finalScoreText, '0.842')
    // 复算：0.3 × 0.66 + 0.6 × 0.906 + 0.1 × 1 = 0.8416 → round3 = 0.842
    const recomputed = 0.3 * 0.66 + 0.6 * 0.906 + 0.1 * 1
    assert.equal(Number(row.finalScoreText), Number(recomputed.toFixed(3)))
  })

  it('cosine 为 null（降级纯 BM25）时向量映射按 0，仍可复算', () => {
    const degraded = buildScoreRow(
      { ...fullDiagnostics.candidates[0], cosine: null, bm25Norm: 0.55, labelHit: false, finalScore: 0.165 },
      fullDiagnostics.funnel.topN,
    )
    assert.equal(degraded.bm25NormText, '0.55')
    assert.equal(degraded.vectorMapText, '0')
    assert.equal(degraded.cosineRawText, '—')
    assert.equal(degraded.labelHit, false)
    assert.equal(degraded.finalScoreText, '0.165')
    assert.equal(Number(degraded.finalScoreText), Number((0.3 * 0.55).toFixed(3)))
  })

  it('第 N+1 名卡片三路分含 bm25 归一化 / 向量映射 / 标签命中 / 最终分', () => {
    const next = buildNextRankView(fullDiagnostics.nextRank!)
    assert.equal(next.bm25NormText, '—')
    assert.equal(next.vectorMapText, '0.71')
    assert.equal(next.labelHit, false)
    assert.equal(next.finalScoreText, '0.426')
  })
})

describe('feat-A009 验收 6b：finalScore 算式代入 tooltip（finalScoreFormula）', () => {
  it('浮层首行原样列出算式，三项逐项代入，末行给出全精度求和与 round3 结果', () => {
    const title = finalScoreFormula({
      ...fullDiagnostics.candidates[0],
      bm25Norm: 1,
      cosine: 0.622,
      labelHit: true,
      finalScore: 0.887,
    })
    assert.deepEqual(title.split('\n'), [
      'finalScore = round3( 0.3 × BM25归一化 + 0.6 × 向量映射((cosine+1)/2) + 0.1 × 标签命中 )',
      '0.3 × 1（BM25归一化）',
      '0.6 × 0.811（(cosine+1)/2，cosine=0.622）',
      '0.1 × 1（标签命中）',
      '= 0.8866 → round3 = 0.887',
    ])
  })

  it('乘积与求和按全精度计算，数值展示 4 位小数（整数不带小数点）', () => {
    const lines = finalScoreFormula({
      ...fullDiagnostics.candidates[0],
      bm25Norm: 0.66,
      cosine: 0.812,
      labelHit: true,
      finalScore: 0.842,
    }).split('\n')
    assert.equal(lines[1], '0.3 × 0.66（BM25归一化）')
    assert.equal(lines[2], '0.6 × 0.906（(cosine+1)/2，cosine=0.812）')
    assert.equal(lines[3], '0.1 × 1（标签命中）')
    assert.equal(lines[4], '= 0.8416 → round3 = 0.842')
  })

  it('bm25Norm 为 null 时代入 0 并标注非词法命中', () => {
    const lines = finalScoreFormula({
      ...fullDiagnostics.candidates[0],
      bm25Norm: null,
      cosine: 0.42,
      labelHit: false,
      finalScore: 0.426,
    }).split('\n')
    assert.equal(lines[1], '0.3 × 0（非词法命中）')
    assert.equal(lines[2], '0.6 × 0.71（(cosine+1)/2，cosine=0.42）')
    assert.equal(lines[3], '0.1 × 0（标签命中）')
    assert.equal(lines[4], '= 0.426 → round3 = 0.426')
  })

  it('cosine 为 null 时代入 0 并标注降级纯 BM25', () => {
    const lines = finalScoreFormula({
      ...fullDiagnostics.candidates[0],
      bm25Norm: 0.55,
      cosine: null,
      labelHit: false,
      finalScore: 0.165,
    }).split('\n')
    assert.equal(lines[1], '0.3 × 0.55（BM25归一化）')
    assert.equal(lines[2], '0.6 × 0（降级纯 BM25，无向量分）')
    assert.equal(lines[4], '= 0.165 → round3 = 0.165')
  })

  it('字段缺失（历史 trace）时按 null 语义降级，浮层不出现 undefined / NaN', () => {
    const legacy = {
      ...fullDiagnostics.candidates[0],
      bm25Norm: undefined,
      cosine: undefined,
      labelHit: undefined,
      finalScore: undefined,
    } as unknown as RetrievalCandidate
    const lines = finalScoreFormula(legacy).split('\n')
    assert.equal(lines.length, 5)
    assert.ok(!lines.some((line) => line.includes('undefined') || line.includes('NaN')))
    assert.equal(lines[1], '0.3 × 0（非词法命中）')
    assert.equal(lines[2], '0.6 × 0（降级纯 BM25，无向量分）')
    assert.equal(lines[3], '0.1 × 0（标签命中）')
    assert.equal(lines[4], '= 0 → round3 = —')
  })

  it('分数表行与第 N+1 名卡片各自带 finalScoreTitle，内容即算式代入', () => {
    const row = buildScoreRow(fullDiagnostics.candidates[0], fullDiagnostics.funnel.topN)
    assert.equal(row.finalScoreTitle, finalScoreFormula(fullDiagnostics.candidates[0]))
    assert.equal(row.finalScoreTitle.split('\n')[4], '= 0.8416 → round3 = 0.842')
    const next = buildNextRankView(fullDiagnostics.nextRank!)
    assert.equal(next.finalScoreTitle, finalScoreFormula(fullDiagnostics.nextRank!))
    assert.equal(next.finalScoreTitle.split('\n')[1], '0.3 × 0（非词法命中）')
  })
})

describe('feat-A013 验收：各阶段耗时（timingLines）', () => {
  it('timing 缺失返回 null，旧数据不展示 4 行', () => {
    assert.equal(timingLines(undefined), null)
  })

  it('值完整时输出 BM25 / 向量 / 标签 / 合并四行，单位 ms，null 显示 —', () => {
    const lines = timingLines({ bm25: 12, vector: null, label: 0, merge: 1.5 })
    assert.deepEqual(lines, [
      'BM25 耗时 12ms',
      '向量库查询耗时 —',
      '标签匹配耗时 0ms',
      '多路召回合并耗时 1.5ms',
    ])
  })

  it('毫秒去浮点长尾：保留 2 位小数并去尾零（2.3948… → 2.39，3.10 → 3.1）', () => {
    const lines = timingLines({ bm25: 2.394800000001851, vector: 3.1, label: 5, merge: 0 })
    assert.deepEqual(lines, [
      'BM25 耗时 2.39ms',
      '向量库查询耗时 3.1ms',
      '标签匹配耗时 5ms',
      '多路召回合并耗时 0ms',
    ])
  })

  it('buildDiagnosticsView 透传 timingLines，缺失时为 null', () => {
    const view = buildDiagnosticsView(
      { ...fullDiagnostics, timing: { bm25: 3, vector: 5, label: 2, merge: 1 } },
      null,
    )
    assert.ok(view)
    assert.deepEqual(view.timingLines, ['BM25 耗时 3ms', '向量库查询耗时 5ms', '标签匹配耗时 2ms', '多路召回合并耗时 1ms'])
    const legacy = buildDiagnosticsView(fullDiagnostics, null)
    assert.ok(legacy)
    assert.equal(legacy.timingLines, null)
  })
})
