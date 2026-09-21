import type { RetrievalCandidate, RetrievalDiagnostics } from '../api/client'

// ── 检索诊断面板：数据整形与自洽检查（feat-A009）──
// 组件只做渲染，判断 / 格式化逻辑收敛在本模块，便于 node:test 单测。

export interface SourceTag {
  text: string
  color: string
}

const SOURCE_META: Record<string, SourceTag> = {
  lexical: { text: '词法', color: 'blue' },
  vector: { text: '向量', color: 'purple' },
  label: { text: '标签', color: 'gold' },
}

export function sourceMeta(source: string): SourceTag {
  return SOURCE_META[source] ?? { text: source, color: 'default' }
}

// 被引用标记：被引用列在表格最右（横向滚动看不到），故在 rank 列重复标记一次
export const CITED_TAG: SourceTag = { text: '被引用', color: 'cyan' }

export function citedTag(cited: boolean | null): SourceTag | null {
  return cited === true ? { ...CITED_TAG } : null
}

// 口径说明文案：收敛于此，组件只渲染（验收打回 B / C）
export const MERGED_CANDIDATES_HINT = '合并候选 = 词法 / 向量 / 标签三路候选并集去重，非相加'

export const SCORING_FORMULA_NOTE =
  '最终得分计分口径：finalScore = round3( 0.3 × bm25归一化 + 0.6 × 向量映射((cosine+1)/2) + 0.1 × 标签命中 )；三路分量均在 [0,1]，cosine 为 null 时向量映射按 0'

export function formatScore(value: number | null): string {
  if (value === null || value === undefined) return '—'
  if (Number.isInteger(value)) return String(value)
  return String(parseFloat(value.toFixed(4)))
}

// 向量映射：(cosine+1)/2 归一到 [0,1]；cosine 为 null（降级纯 BM25）时按 0 参与计分（bug-00013）
export function vectorMap(cosine: number | null): number {
  return cosine === null ? 0 : (cosine + 1) / 2
}

export function boolText(value: boolean | null): string {
  if (value === true) return '是'
  if (value === false) return '否'
  return '—'
}

// finalScore 算式代入（feat-A009 验收 6b）：hover 浮层逐行给出代入过程，免除手算
const FINAL_SCORE_FORMULA_LINE =
  'finalScore = round3( 0.3 × BM25归一化 + 0.6 × 向量映射((cosine+1)/2) + 0.1 × 标签命中 )'

export function finalScoreFormula(candidate: RetrievalCandidate): string {
  // 历史 trace 可能缺字段，一律按 null 语义降级，浮层不出现 undefined / NaN
  const bm25Norm = candidate.bm25Norm ?? null
  const cosine = candidate.cosine ?? null
  const labelHit = candidate.labelHit === true
  const finalScore = candidate.finalScore ?? null
  const bm25Line =
    bm25Norm === null ? '0.3 × 0（非词法命中）' : `0.3 × ${formatScore(bm25Norm)}（BM25归一化）`
  const vectorLine =
    cosine === null
      ? '0.6 × 0（降级纯 BM25，无向量分）'
      : `0.6 × ${formatScore(vectorMap(cosine))}（(cosine+1)/2，cosine=${formatScore(cosine)}）`
  const labelLine = `0.1 × ${labelHit ? 1 : 0}（标签命中）`
  // 乘积与求和用全精度，最后一步 round3 显式写出
  const sum = 0.3 * (bm25Norm ?? 0) + 0.6 * vectorMap(cosine) + 0.1 * (labelHit ? 1 : 0)
  return [
    FINAL_SCORE_FORMULA_LINE,
    bm25Line,
    vectorLine,
    labelLine,
    `= ${formatScore(sum)} → round3 = ${formatScore(finalScore)}`,
  ].join('\n')
}

// ── 召回漏斗 ──

export interface FunnelStage {
  key: string
  label: string
  value: number
  topn?: boolean
  hint?: string
}

export interface FunnelView {
  lead: FunnelStage
  branch: FunnelStage[]
  tail: FunnelStage[]
  hints: string[]
}

export function buildFunnel(funnel: RetrievalDiagnostics['funnel']): FunnelView {
  const lead: FunnelStage = { key: 'corpus', label: '语料 chunk', value: funnel.corpusChunks }
  const branch: FunnelStage[] = [
    { key: 'lexical', label: '词法命中', value: funnel.lexicalHits },
    { key: 'vector', label: '向量 top50', value: funnel.vectorTop50 },
    { key: 'label', label: '标签命中', value: funnel.labelHits },
  ]
  const tail: FunnelStage[] = [
    { key: 'merged', label: '合并候选', value: funnel.mergedCandidates, hint: MERGED_CANDIDATES_HINT },
    { key: 'topn', label: 'topN', value: funnel.topN, topn: true },
  ]
  // sango 产出阶段 injected / cited 为 null，不进入漏斗展示
  if (funnel.injected !== null) tail.push({ key: 'injected', label: '进注入视图', value: funnel.injected })
  if (funnel.cited !== null) tail.push({ key: 'cited', label: '被引用', value: funnel.cited })
  const hints = [lead, ...branch, ...tail].flatMap((stage) => (stage.hint ? [stage.hint] : []))
  return { lead, branch, tail, hints }
}

// ── 候选分数表 ──

export interface ScoreRowView {
  key: string
  rank: number
  chunkId: string
  chapterText: string
  bm25NormText: string
  vectorMapText: string
  labelHit: boolean
  /** 标签命中列的 tooltip 文本：命中标签逐行拼接，无标签为空串 */
  hitLabelsTitle: string
  finalScoreText: string
  /** 最终分列的 tooltip 文本：finalScore 算式代入过程（finalScoreFormula），逐行拼接 */
  finalScoreTitle: string
  bm25RawText: string
  cosineRawText: string
  sources: SourceTag[]
  injectedText: string
  citedText: string
  inTopN: boolean
  cited: boolean
  citedTag: SourceTag | null
}

export function buildScoreRow(candidate: RetrievalCandidate, topN: number): ScoreRowView {
  return {
    key: candidate.chunkId,
    rank: candidate.rank,
    chunkId: candidate.chunkId,
    chapterText: `第 ${candidate.chapter} 回 ${candidate.title}`,
    hitLabelsTitle: (candidate.hitLabels ?? []).join('\n'),
    bm25NormText: formatScore(candidate.bm25Norm),
    vectorMapText: formatScore(vectorMap(candidate.cosine)),
    labelHit: candidate.labelHit,
    finalScoreText: formatScore(candidate.finalScore),
    finalScoreTitle: finalScoreFormula(candidate),
    bm25RawText: formatScore(candidate.bm25),
    cosineRawText: formatScore(candidate.cosine),
    sources: candidate.sources.map(sourceMeta),
    injectedText: boolText(candidate.injected),
    citedText: boolText(candidate.cited),
    inTopN: candidate.rank <= topN,
    cited: candidate.cited === true,
    citedTag: citedTag(candidate.cited),
  }
}

export function buildScoreRows(candidates: RetrievalCandidate[], topN: number): ScoreRowView[] {
  return candidates.map((candidate) => buildScoreRow(candidate, topN))
}

// 行高亮：进 top-N（绿）与被引用（青）可叠加，组件 row-class-name 直接消费
export function scoreRowClass(row: Pick<ScoreRowView, 'inTopN' | 'cited'>): string {
  const classes: string[] = []
  if (row.inTopN) classes.push('diag-row-in-topn')
  if (row.cited) classes.push('diag-row-cited')
  return classes.join(' ')
}

// ── 第 N+1 名 ──

export interface NextRankView {
  rank: number
  chunkId: string
  chapterText: string
  bm25NormText: string
  vectorMapText: string
  labelHit: boolean
  finalScoreText: string
  /** 最终分处的 tooltip 文本：finalScore 算式代入过程（finalScoreFormula），逐行拼接 */
  finalScoreTitle: string
  bm25RawText: string
  cosineRawText: string
  sources: SourceTag[]
  gapToTopNText: string
}

export function buildNextRankView(nextRank: NonNullable<RetrievalDiagnostics['nextRank']>): NextRankView {
  return {
    rank: nextRank.rank,
    chunkId: nextRank.chunkId,
    chapterText: `第 ${nextRank.chapter} 回 ${nextRank.title}`,
    bm25NormText: formatScore(nextRank.bm25Norm),
    vectorMapText: formatScore(vectorMap(nextRank.cosine)),
    labelHit: nextRank.labelHit,
    finalScoreText: formatScore(nextRank.finalScore),
    finalScoreTitle: finalScoreFormula(nextRank),
    bm25RawText: formatScore(nextRank.bm25),
    cosineRawText: formatScore(nextRank.cosine),
    sources: nextRank.sources.map(sourceMeta),
    gapToTopNText: formatScore(nextRank.gapToTopN),
  }
}

// ── query 处理链 / 环境与降级 ──

export interface QueryChainView {
  raw: string
  normalized: string
  tokens: string[]
}

export function buildQueryChain(query: RetrievalDiagnostics['query']): QueryChainView {
  return { raw: query.raw, normalized: query.normalized, tokens: query.tokens }
}

export interface EnvView {
  vectorSchemeText: string
  degradedBm25Only: boolean
  corpusChunks: number
  aliasCount: number
  vectorDimText: string
}

export function buildEnvView(env: RetrievalDiagnostics['env']): EnvView {
  return {
    vectorSchemeText: env.vectorScheme ?? '—',
    degradedBm25Only: env.degradedBm25Only,
    corpusChunks: env.corpusChunks,
    aliasCount: env.aliasCount,
    vectorDimText: env.vectorDim === null ? '—' : String(env.vectorDim),
  }
}

// ── 截断标记 / 自洽检查 ──

export function truncatedText(diagnostics: RetrievalDiagnostics): string | null {
  if (!diagnostics.truncated) return null
  return diagnostics.truncatedCount > 0
    ? `诊断已截断（64KB），候选显示不全，已丢弃 ${diagnostics.truncatedCount} 条候选`
    : '诊断已截断（64KB），候选显示不全'
}

export interface SelfConsistencyView {
  citationMismatch: boolean
  citationMismatchText: string
  citedOutsideTopN: boolean
}

export function buildSelfConsistency(
  funnel: RetrievalDiagnostics['funnel'],
  candidates: RetrievalCandidate[],
  citationCount: number | null,
): SelfConsistencyView {
  const cited = funnel.cited
  const citationMismatch = citationCount !== null && cited !== null && cited !== citationCount
  const citationMismatchText =
    citationCount === null
      ? ''
      : `引用与召回不自洽：citations ${citationCount} 条 vs funnel.cited ${cited ?? '—'} 条`
  const citedOutsideTopN = candidates.some(
    (candidate) => candidate.cited === true && candidate.rank > funnel.topN,
  )
  return { citationMismatch, citationMismatchText, citedOutsideTopN }
}

// ── 汇总视图：SFC 直接消费 ──

export interface DiagnosticsView {
  truncatedText: string | null
  funnel: FunnelView
  scoringNote: string
  scoreRows: ScoreRowView[]
  nextRank: NextRankView | null
  query: QueryChainView
  env: EnvView
  deathIntent: {
    detected: boolean
    pinned: boolean
    chunkIds: string[]
  }
  selfConsistency: SelfConsistencyView
}

export function buildDiagnosticsView(
  diagnostics: RetrievalDiagnostics | null,
  citationCount: number | null,
): DiagnosticsView | null {
  if (diagnostics === null) return null
  return {
    truncatedText: truncatedText(diagnostics),
    funnel: buildFunnel(diagnostics.funnel),
    scoringNote: SCORING_FORMULA_NOTE,
    scoreRows: buildScoreRows(diagnostics.candidates, diagnostics.funnel.topN),
    nextRank: diagnostics.nextRank === null ? null : buildNextRankView(diagnostics.nextRank),
    query: buildQueryChain(diagnostics.query),
    env: buildEnvView(diagnostics.env),
    deathIntent: {
      detected: diagnostics.deathIntent.detected,
      pinned: diagnostics.deathIntent.pinned,
      chunkIds: diagnostics.deathIntent.chunkIds,
    },
    selfConsistency: buildSelfConsistency(diagnostics.funnel, diagnostics.candidates, citationCount),
  }
}
