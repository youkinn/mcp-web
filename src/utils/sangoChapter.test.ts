import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import type { SangoChapterData } from '../api/client'
import {
  buildCitationReaderTarget,
  centeredScrollTop,
  findChunkByText,
  isValidChapter,
  SANGO_CHAPTER_MAX,
  SANGO_CHAPTER_MIN,
  shortChunkId,
} from './sangoChapter.ts'

// ── 原文阅读器纯逻辑单测（feat-A010，node:test，跑法：npm test）──

const chapterData: SangoChapterData = {
  chapter: 73,
  title: '玄德进位汉中王　云长攻拔襄阳郡',
  prev: { chapter: 72, title: '诸葛亮智取汉中　曹阿瞒兵退斜谷' },
  next: { chapter: 74, title: '庞令明抬榇决死战　关云长放水淹七军' },
  chunks: [
    { chunkId: 'sanguo-yanyi:0073:c0001', text: '却说曹操退兵至斜谷', type: 'narration', segFrom: 1, segTo: 1 },
    { chunkId: 'sanguo-yanyi:0073:c0002', text: '云长领兵攻打襄阳郡', type: 'narration', segFrom: 2, segTo: 3 },
  ],
}

describe('验收 8：片段短号只显示 chunkId 尾段（c0021）', () => {
  it('完整 chunkId → 尾段短号，与候选分数表一一对应', () => {
    assert.equal(shortChunkId('sanguo-yanyi:0073:c0021'), 'c0021')
    assert.equal(shortChunkId('sanguo-yanyi:0001:c0001'), 'c0001')
  })

  it('非标准 chunkId（无冒号）原样返回，不丢信息', () => {
    assert.equal(shortChunkId('c0042'), 'c0042')
  })
})

describe('验收 10：回号跳转范围校验 1~120', () => {
  it('1 与 120 为合法边界', () => {
    assert.equal(isValidChapter(SANGO_CHAPTER_MIN), true)
    assert.equal(isValidChapter(SANGO_CHAPTER_MAX), true)
  })

  it('越界（0 / 121 / 负数）与非法输入（小数 / 空 / undefined）不跳转', () => {
    assert.equal(isValidChapter(0), false)
    assert.equal(isValidChapter(121), false)
    assert.equal(isValidChapter(-1), false)
    assert.equal(isValidChapter(1.5), false)
    assert.equal(isValidChapter(null), false)
    assert.equal(isValidChapter(undefined), false)
  })
})

describe('验收 4：目标片段定位（容器内居中偏移，不滚弹框外层）', () => {
  it('目标在正文中部：偏移使目标行垂直居中', () => {
    // 行距容器顶 2000px、行高 40px、视口 800px → 2000 - 400 + 20
    assert.equal(centeredScrollTop(2000, 40, 800), 1620)
  })

  it('目标靠近顶部：归 0，不产生负 scrollTop', () => {
    assert.equal(centeredScrollTop(100, 40, 800), 0)
  })

  it('目标即正文第一行：偏移 0，正文停顶部', () => {
    assert.equal(centeredScrollTop(0, 40, 800), 0)
  })
})

describe('验收 6：citation.text 与整回原文精确匹配（includes）定位', () => {
  it('命中：返回包含引用文本的 chunk', () => {
    const hit = findChunkByText(chapterData.chunks, '云长领兵攻打襄阳郡')
    assert.ok(hit)
    assert.equal(hit?.chunkId, 'sanguo-yanyi:0073:c0002')
  })

  it('同回两 chunk 文本完全相同（重叠 0）落到第一处', () => {
    const duplicated = [
      { ...chapterData.chunks[0] },
      { chunkId: 'sanguo-yanyi:0073:c0009', text: '却说曹操退兵至斜谷', type: 'narration', segFrom: 9, segTo: 9 },
    ]
    const hit = findChunkByText(duplicated, '却说曹操退兵至斜谷')
    assert.equal(hit?.chunkId, 'sanguo-yanyi:0073:c0001')
  })

  it('匹配不到：返回 null，阅读器停正文顶部不报错（不传 chunkId）', () => {
    assert.equal(findChunkByText(chapterData.chunks, '不存在的原文片段'), null)
  })
})

describe('验收 6 / 11 / 12：聊天侧入口目标（buildCitationReaderTarget）', () => {
  it('命中时携带 chunkId 定位，且复用同一组件的三项入参契约', () => {
    const target = buildCitationReaderTarget(73, chapterData.title, '云长领兵攻打襄阳郡', chapterData)
    assert.deepEqual(target, {
      chapter: 73,
      chapterTitle: '玄德进位汉中王　云长攻拔襄阳郡',
      chunkId: 'sanguo-yanyi:0073:c0002',
    })
  })

  it('匹配不到时只传 chapter / chapterTitle，不传 chunkId', () => {
    const target = buildCitationReaderTarget(73, chapterData.title, '查无此段', chapterData)
    assert.equal(target.chunkId, undefined)
    assert.equal(target.chapter, 73)
    assert.equal(target.chapterTitle, chapterData.title)
  })
})
