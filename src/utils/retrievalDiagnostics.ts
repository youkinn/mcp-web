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

export function formatScore(value: number | null): string {
  if (value === null || value === undefined) return '—'
  if (Number.isInteger(value)) return String(value)
  return String(parseFloat(value.toFixed(4)))
}

export function boolText(value: boolean | null): string {
  if (value === true) return '是'
  if (value === false) return '否'
  return '—'
}

// ── 召回漏斗 ──

export interface FunnelStage {
  key: string
  label: string
  value: number
  topn?: boolean
}

export interface FunnelView {
  lead: FunnelStage
  branch: FunnelStage[]
  tail: FunnelStage[]
}

export function buildFunnel(funnel: RetrievalDiagnostics['funnel']): FunnelView {
  const lead: FunnelStage = { key: 'corpus', label: '语料 chunk', value: funnel.corpusChunks }
  const branch: FunnelStage[] = [
    { key: 'lexical', label: '词法命中', value: funnel.lexicalHits },
    { key: 'vector', label: '向量 top50', value: funnel.vectorTop50 },
    { key: 'label', label: '标签命中', value: funnel.labelHits },
  ]
  const tail: FunnelStage[] = [
    { key: 'merged', label: '合并候选', value: funnel.mergedCandidates },
    { key: 'topn', label: 'topN', value: funnel.topN, topn: true },
  ]
  // sango 产出阶段 injected / cited 为 null，不进入漏斗展示
  if (funnel.injected !== null) tail.push({ key: 'injected', label: '进注入视图', value: funnel.injected })
  if (funnel.cited !== null) tail.push({ key: 'cited', label: '被引用', value: funnel.cited })
  return { lead, branch, tail }
}

// ── 候选分数表 ──

export interface ScoreRowView {
  key: string
  rank: number
  chunkId: string
  chapterText: string
  bm25Text: string
  cosineText: string
  labelHit: boolean
  finalScoreText: string
  sources: SourceTag[]
  injectedText: string
  citedText: string
  inTopN: boolean
}

export function buildScoreRow(candidate: RetrievalCandidate, topN: number): ScoreRowView {
  return {
    key: candidate.chunkId,
    rank: candidate.rank,
    chunkId: candidate.chunkId,
    chapterText: `第 ${candidate.chapter} 回 ${candidate.title}`,
    bm25Text: formatScore(candidate.bm25),
    cosineText: formatScore(candidate.cosine),
    labelHit: candidate.labelHit,
    finalScoreText: formatScore(candidate.finalScore),
    sources: candidate.sources.map(sourceMeta),
    injectedText: boolText(candidate.injected),
    citedText: boolText(candidate.cited),
    inTopN: candidate.rank <= topN,
  }
}

export function buildScoreRows(candidates: RetrievalCandidate[], topN: number): ScoreRowView[] {
  return candidates.map((candidate) => buildScoreRow(candidate, topN))
}

// ── 第 N+1 名 ──

export interface NextRankView {
  rank: number
  chunkId: string
  chapterText: string
  bm25Text: string
  cosineText: string
  finalScoreText: string
  sources: SourceTag[]
  gapToTopNText: string
}

export function buildNextRankView(nextRank: NonNullable<RetrievalDiagnostics['nextRank']>): NextRankView {
  return {
    rank: nextRank.rank,
    chunkId: nextRank.chunkId,
    chapterText: `第 ${nextRank.chapter} 回 ${nextRank.title}`,
    bm25Text: formatScore(nextRank.bm25),
    cosineText: formatScore(nextRank.cosine),
    finalScoreText: formatScore(nextRank.finalScore),
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