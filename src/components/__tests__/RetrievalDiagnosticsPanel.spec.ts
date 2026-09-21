import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import Antd from 'ant-design-vue'
import RetrievalDiagnosticsPanel from '../RetrievalDiagnosticsPanel.vue'
import type { RetrievalDiagnostics } from '../../api/client'

function mountPanel(diagnostics: RetrievalDiagnostics | null, citationCount?: number | null) {
  return mount(RetrievalDiagnosticsPanel, {
    props: { diagnostics, citationCount: citationCount ?? null },
    global: { plugins: [Antd] },
  })
}

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
      rank: 2,
      chunkId: 'sanguo-yanyi:0074:c0012',
      chapter: 74,
      title: '庞令明抬榇决死战　关云长放水淹七军',
      bm25: 3.1,
      cosine: 0.451,
      labelHit: false,
      finalScore: 0.51,
      sources: ['vector'],
      injected: false,
      cited: false,
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

describe('RetrievalDiagnosticsPanel 检索诊断面板', () => {
  it('diagnostics 有值时渲染漏斗 / 分数表 / query 链 / 环境 / nextRank / 死亡意图各分区', () => {
    const wrapper = mountPanel(fullDiagnostics, 3)
    const text = wrapper.text()

    expect(text).toContain('检索诊断')

    // 召回漏斗各阶段数字
    expect(text).toContain('语料 chunk')
    expect(text).toContain('2344')
    expect(text).toContain('词法命中')
    expect(text).toContain('42')
    expect(text).toContain('向量 top50')
    expect(text).toContain('50')
    expect(text).toContain('标签命中')
    expect(text).toContain('合并候选')
    expect(text).toContain('45')
    expect(text).toContain('topN')
    expect(text).toContain('10')
    expect(text).toContain('进注入视图')
    expect(text).toContain('被引用')

    // 候选分数表：排名 / chunkId / 回目 / BM25 / 余弦 / 标签命中 / 最终分 / 来源 / 注入 / 引用
    expect(text).toContain('sanguo-yanyi:0073:c0007')
    expect(text).toContain('玄德进位汉中王　云长攻拔襄阳郡')
    expect(text).toContain('12.34')
    expect(text).toContain('0.812')
    expect(text).toContain('0.92')
    expect(text).toContain('进 top-N')
    expect(text).toContain('词法')
    expect(text).toContain('向量')

    // query 处理链
    expect(text).toContain('原始 query')
    expect(text).toContain('关羽千里走单骑的经过')
    expect(text).toContain('alias 归一化')
    expect(text).toContain('关羽 千里走单骑 经过')
    expect(text).toContain('分词 tokens')

    // 环境与降级
    expect(text).toContain('向量 scheme')
    expect(text).toContain('bge-m3')
    expect(text).toContain('语料 chunk 数')
    expect(text).toContain('alias 条数')
    expect(text).toContain('87')
    expect(text).toContain('向量维度')
    expect(text).toContain('1024')

    // 第 N+1 名与 gapToTopN
    expect(text).toContain('第 N+1 名')
    expect(text).toContain('差 0.19 分未进 top-N')

    // 死亡意图置顶
    expect(text).toContain('已判定死亡意图并置顶')
    expect(text).toContain('sanguo-yanyi:0001:c0001')
  })

  it('diagnostics 为 null 时不渲染面板内容且不报错', () => {
    const wrapper = mountPanel(null)
    expect(wrapper.text()).toContain('该调用无检索诊断')
    expect(wrapper.text()).not.toContain('召回漏斗')
    expect(wrapper.text()).not.toContain('候选分数')
    expect(wrapper.text()).not.toContain('Query 处理链')
  })

  it('diagnostics.truncated 为 true 时显示截断标记与丢弃条数', () => {
    const wrapper = mountPanel({ ...fullDiagnostics, truncated: true, truncatedCount: 7 })
    expect(wrapper.text()).toContain('诊断已截断（64KB），候选显示不全')
    expect(wrapper.text()).toContain('已丢弃 7 条候选')
  })

  it('nextRank 为 null 时隐藏第 N+1 名分区', () => {
    const wrapper = mountPanel({ ...fullDiagnostics, nextRank: null })
    expect(wrapper.text()).not.toContain('第 N+1 名')
  })

  it('degradedBm25Only 为 true 时显示降级告警', () => {
    const wrapper = mountPanel({
      ...fullDiagnostics,
      env: { vectorScheme: null, degradedBm25Only: true, corpusChunks: 2344, aliasCount: 87, vectorDim: null },
      funnel: { ...fullDiagnostics.funnel, vectorTop50: 0 },
    })
    expect(wrapper.text()).toContain('已降级纯 BM25')
  })

  it('citations 与 funnel.cited 不一致时显示引用与召回不自洽告警', () => {
    const wrapper = mountPanel(fullDiagnostics, 5)
    expect(wrapper.text()).toContain('引用与召回不自洽')
  })

  it('被引用候选未进 top-N 时显示红色自洽提示', () => {
    const wrapper = mountPanel(fullDiagnostics)
    expect(wrapper.text()).toContain('存在被引用（cited=true）但未进 top-N 的候选')
  })

  it('funnel 的 injected / cited 为 null 时（sango 产出阶段）隐藏对应漏斗阶段', () => {
    const wrapper = mountPanel({
      ...fullDiagnostics,
      funnel: { ...fullDiagnostics.funnel, injected: null, cited: null },
    })
    const funnelText = wrapper.find('.funnel-flow').text()
    expect(funnelText).toContain('topN')
    expect(funnelText).not.toContain('进注入视图')
    expect(funnelText).not.toContain('被引用')
  })
})