import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import type { SangoChapterData } from '../api/client'
import {
  buildCitationReaderTarget,
  centeredScrollTop,
  chapterChunkId,
  chapterFromChunkId,
  chunkPositionLabel,
  findChunkByText,
  isValidChapter,
  SANGO_CHAPTER_MAX,
  SANGO_CHAPTER_MIN,
  shortChunkId,
  targetScrollTop,
} from './sangoChapter.ts'

// ── 原文阅读器纯逻辑单测（feat-A010，node:test，跑法：npm test）──

const chapterData: SangoChapterData = {
  chapter: 73,
  title: '玄德进位汉中王　云长攻拔襄阳郡',
  prev: { chapter: 72, title: '诸葛亮智取汉中　曹阿瞒兵退斜谷' },
  next: { chapter: 74, title: '庞令明抬榇决死战　关云长放水淹七军' },
  chunks: [
    { chunk_id: 'sanguo-yanyi:0073:p0001:c01', parent_id: 'sanguo-yanyi:0073:p0001', seq_in_parent: 1, type: 'prose', role: 'body', text: '却说曹操退兵至斜谷', char_count: 10 },
    { chunk_id: 'sanguo-yanyi:0073:p0002:c01', parent_id: 'sanguo-yanyi:0073:p0002', seq_in_parent: 1, type: 'prose', role: 'body', text: '云长领兵攻打襄阳郡', char_count: 10 },
  ],
}

describe('验收 8：片段短号显示回内位置（段·块）', () => {
  it('完整 chunk_id → 段·块短号，与候选分数表一一对应', () => {
    assert.equal(shortChunkId('sanguo-yanyi:0073:p0021:c01'), 'p0021·c01')
    assert.equal(shortChunkId('sanguo-yanyi:0001:p0001:c02'), 'p0001·c02')
  })

  it('非标准 chunk_id（无冒号）原样返回，不丢信息', () => {
    assert.equal(shortChunkId('c0042'), 'c0042')
  })

  it('带回号片段号：去掉源前缀，回号 / 段号 / 块序完整保留', () => {
    assert.equal(chapterChunkId('sanguo-yanyi:0077:p0018:c01'), '0077:p0018:c01')
    assert.equal(chapterChunkId('sanguo-yanyi:0001:p0001:c02'), '0001:p0001:c02')
    assert.equal(chapterChunkId('c0042'), 'c0042')
  })
})

describe('片段位置短标：段号取自 parent_id，块序取 seq_in_parent', () => {
  it('标准父段 ID → 段N·块M', () => {
    assert.equal(chunkPositionLabel('sanguo-yanyi:0073:p0003', 2), '段3·块2')
  })

  it('父段 ID 格式不符 → 只给块序，不抛错', () => {
    assert.equal(chunkPositionLabel('legacy-id', 1), '块1')
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

describe('bug-00016：定位偏移口径（目标行已渲染才测量，未命中回正文顶部）', () => {
  it('目标行已在当前回渲染：给容器内居中偏移', () => {
    assert.equal(targetScrollTop(800, { offsetTop: 2000, offsetHeight: 40 }), 1620)
  })

  it('未传 chunkId / 目标行不在当前回（null）：回正文顶部 0，不报错', () => {
    assert.equal(targetScrollTop(800, null), 0)
  })

  it('目标即正文第一行：0（不产生负偏移）', () => {
    assert.equal(targetScrollTop(800, { offsetTop: 0, offsetHeight: 40 }), 0)
  })
})

describe('验收 6：citation.text 与整回原文精确匹配（includes）定位', () => {
  it('命中：返回包含引用文本的 chunk', () => {
    const hit = findChunkByText(chapterData.chunks, '云长领兵攻打襄阳郡')
    assert.ok(hit)
    assert.equal(hit?.chunk_id, 'sanguo-yanyi:0073:p0002:c01')
  })

  it('同回两 chunk 文本完全相同（重叠 0）落到第一处', () => {
    const duplicated = [
      { ...chapterData.chunks[0] },
      { chunk_id: 'sanguo-yanyi:0073:p0009:c01', parent_id: 'sanguo-yanyi:0073:p0009', seq_in_parent: 1, type: 'prose', role: 'body', text: '却说曹操退兵至斜谷', char_count: 10 },
    ]
    const hit = findChunkByText(duplicated, '却说曹操退兵至斜谷')
    assert.equal(hit?.chunk_id, 'sanguo-yanyi:0073:p0001:c01')
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
      chunkId: 'sanguo-yanyi:0073:p0002:c01',
    })
  })

  it('匹配不到时只传 chapter / chapterTitle，不传 chunkId', () => {
    const target = buildCitationReaderTarget(73, chapterData.title, '查无此段', chapterData)
    assert.equal(target.chunkId, undefined)
    assert.equal(target.chapter, 73)
    assert.equal(target.chapterTitle, chapterData.title)
  })
})

describe('feat-A015：候选 chunkId 回号解析（chapterFromChunkId）', () => {
  it('sango-yanyi:0085:c0011 → 85（回号 4 位零补）', () => {
    assert.equal(chapterFromChunkId('sango-yanyi:0085:c0011'), 85)
  })

  it('回号不足 4 位（0001 → 1）与无零补格式均可解析', () => {
    assert.equal(chapterFromChunkId('sango-yanyi:0001:c0009'), 1)
    assert.equal(chapterFromChunkId('sango-yanyi:73:c1'), 73)
  })

  it('格式不符返回 NaN，页面提示无法解析而非抛错', () => {
    assert.ok(Number.isNaN(chapterFromChunkId('not-a-chunk-id')))
    assert.ok(Number.isNaN(chapterFromChunkId('sango-yanyi:c0011')))
    assert.ok(Number.isNaN(chapterFromChunkId('sango-yanyi:abc:c0011')))
    assert.ok(Number.isNaN(chapterFromChunkId('sango-yanyi:0000:c0011')))
  })
})
