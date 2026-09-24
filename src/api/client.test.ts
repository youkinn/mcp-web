import { strict as assert } from 'node:assert'
import { afterEach, describe, it, mock } from 'node:test'
import {
  apiClient,
  clearCache,
  deleteCacheEntry,
  fetchCacheEntries,
  fetchCacheOverview,
  fetchCacheStatus,
  fetchGrayzone,
  fetchLogDetail,
  fetchLogList,
  fetchMisjudge,
  fetchSangoChapter,
  fetchSimilarityDistribution,
  markMisjudge,
  sendChatMessage,
  sendSangoRandom,
  unmarkMisjudge,
  updateCacheMaxEntries,
  updateCacheStatus,
} from './client.ts'

// ── feat-A008 前端链路埋点测试（node:test，跑法：npm test）──

interface PostCall {
  url: string
  payload?: unknown
  config?: { headers?: Record<string, string> } | undefined
}

const okChatData = { code: 200, data: { answer: '答案', citations: [] }, message: 'ok' }

// apiClient.post 替身：按 URL 分发（/sango/random、/chat、/v1/logs/*/frontend-end），记录调用并返回可注入结果
function installFakePost(options: {
  sangoRandomError?: boolean
  reportError?: boolean
  responseHeaders?: Record<string, string>
}): { calls: PostCall[] } {
  const calls: PostCall[] = []
  mock.method(apiClient, 'post', (url: string, payload?: unknown, config?: { headers?: Record<string, string> }) => {
    calls.push({ url, payload, config })
    if (url.includes('/sango/random')) {
      if (options.sangoRandomError) return Promise.reject(new Error('sango 服务不可用'))
      return Promise.resolve({ data: okChatData, headers: options.responseHeaders ?? {} })
    }
    if (url.includes('/frontend-end')) {
      if (options.reportError) return Promise.reject(new Error('补报服务不可用'))
      return Promise.resolve({ data: { code: 200, data: null, message: 'ok' }, headers: {} })
    }
    return Promise.resolve({ data: okChatData, headers: {} })
  })
  return { calls }
}

function isUuidV4(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)
}

afterEach(() => {
  mock.restoreAll()
})

describe('sendSangoRandom 链路埋点（feat-A008）', () => {
  it('携带 X-Trace-Id（UUID v4）与 X-Client-Sent-At（t0 毫秒时间戳）', async () => {
    const before = Date.now()
    const { calls } = installFakePost({})
    const result = await sendSangoRandom('曹刘之战，谁胜？', 'session-1')
    assert.equal(result.answer, '答案')
    const main = calls.find((c) => c.url === '/sango/random')
    assert.ok(main, '应发起 /sango/random 请求')
    const traceId = main?.config?.headers?.['X-Trace-Id']
    assert.ok(traceId, '应携带 X-Trace-Id')
    assert.ok(isUuidV4(traceId ?? ''), 'X-Trace-Id 应为 UUID v4')
    const sentAt = Number(main?.config?.headers?.['X-Client-Sent-At'])
    assert.ok(Number.isFinite(sentAt), '应携带 X-Client-Sent-At')
    assert.ok(sentAt >= before && sentAt <= Date.now(), 'X-Client-Sent-At 应落在调用时刻附近')
  })

  it('每次独立请求生成新的 X-Trace-Id，不跨请求复用', async () => {
    const { calls } = installFakePost({})
    await sendSangoRandom('第一题')
    await sendSangoRandom('第二题')
    const ids = calls
      .filter((c) => c.url === '/sango/random')
      .map((c) => c.config?.headers?.['X-Trace-Id'])
    assert.equal(ids.length, 2)
    assert.ok(ids[0] && ids[1] && ids[0] !== ids[1], '两次独立请求的 traceId 不应相同')
  })

  it('以响应头 X-Trace-Id 为准补报 t6（服务端兜底生成场景）', async () => {
    const serverTraceId = 'server-side-trace-id'
    const { calls } = installFakePost({ responseHeaders: { 'x-trace-id': serverTraceId } })
    await sendSangoRandom('问题')
    const report = calls.find((c) => c.url.includes('/frontend-end'))
    assert.ok(report, '应发起 t6 补报')
    assert.ok(report?.url.includes(serverTraceId), '补报应使用响应头 X-Trace-Id')
    const receivedAt = (report?.payload as { clientReceivedAt?: number } | undefined)?.clientReceivedAt
    assert.ok(typeof receivedAt === 'number' && Number.isFinite(receivedAt), '补报 body 应携带 clientReceivedAt 毫秒时间戳')
  })

  it('无响应头 X-Trace-Id 时回退使用请求 traceId 补报 t6', async () => {
    const { calls } = installFakePost({})
    await sendSangoRandom('问题')
    const main = calls.find((c) => c.url === '/sango/random')
    const report = calls.find((c) => c.url.includes('/frontend-end'))
    assert.ok(report, '应发起 t6 补报')
    const requestTraceId = main?.config?.headers?.['X-Trace-Id']
    assert.ok(requestTraceId && report?.url.includes(requestTraceId), '补报应回退使用请求 traceId')
  })

  it('t6 补报失败为 fire-and-forget，不影响主流程返回', async () => {
    const { calls } = installFakePost({ reportError: true })
    const result = await sendSangoRandom('问题')
    assert.equal(result.answer, '答案')
    assert.ok(calls.some((c) => c.url.includes('/frontend-end')), '补报失败也应发起（静默吞错）')
  })
})

describe('sendChatMessage domain 传递（feat-A011 天气下线）', () => {
  it('传 fengyunsanguo 时请求体携带 domain=fengyunsanguo', async () => {
    const { calls } = installFakePost({})
    await sendChatMessage('曹操字什么？', 'fengyunsanguo')
    const main = calls.find((c) => c.url === '/chat')
    assert.ok(main, '应发起 /chat 请求')
    const payload = main?.payload as Record<string, string>
    assert.equal(payload.domain, 'fengyunsanguo')
    assert.equal(payload.message, '曹操字什么？')
  })

  it('不传 domain 时请求体不含 domain 字段', async () => {
    const { calls } = installFakePost({})
    await sendChatMessage('直接问问题')
    const main = calls.find((c) => c.url === '/chat')
    assert.ok(main, '应发起 /chat 请求')
    assert.ok(!('domain' in (main?.payload as Record<string, string>)), '默认请求不应携带 domain')
  })
})

describe('fetchLogDetail cachedTokens 透传（feat-A011 验收 6）', () => {
  it('cachedTokens 为 null / 数字时原样透传（旧记录 null、未命中 0）', async () => {
    const detail = {
      log: {
        traceId: 't1',
        logType: 'chat',
        userInput: 'q',
        domain: 'sango-novel',
        status: 'success',
        responseCode: 200,
        errorMessage: '',
        clientSentAt: null,
        serverReceivedAt: 1,
        handleStartedAt: null,
        serverRespondedAt: null,
        clientReceivedAt: null,
        answer: null,
        citations: null,
        createdAt: 1,
      },
      llmCalls: [
        {
          seq: 1,
          stage: 'classify',
          model: 'm',
          requestAt: 1,
          responseAt: 2,
          requestSummary: '',
          responseSummary: '',
          toolCalls: '',
          promptTokens: 10,
          completionTokens: 5,
          cachedTokens: null,
          finishReason: 'stop',
          status: 'success',
          errorMessage: '',
        },
        {
          seq: 2,
          stage: 'generation',
          model: 'm',
          requestAt: 2,
          responseAt: 3,
          requestSummary: '',
          responseSummary: '',
          toolCalls: '',
          promptTokens: 10,
          completionTokens: 5,
          cachedTokens: 0,
          finishReason: 'stop',
          status: 'success',
          errorMessage: '',
        },
      ],
      toolCalls: [],
    }
    mock.method(apiClient, 'get', async (url: string) => {
      assert.ok(url.startsWith('/v1/logs/'), '应请求明细接口')
      return Promise.resolve({ data: { code: 200, data: detail, message: '' }, headers: {} })
    })
    const result = await fetchLogDetail('t1')
    assert.equal(result.llmCalls[0].cachedTokens, null)
    assert.equal(result.llmCalls[1].cachedTokens, 0)
  })
})

// ── feat-A010：日志 domain 过滤 + 原文按回缓存 ──

function installFakeGet(): { calls: { url: string; params?: Record<string, unknown> }[] } {
  const calls: { url: string; params?: Record<string, unknown> }[] = []
  mock.method(apiClient, 'get', (url: string, config?: { params?: Record<string, unknown> }) => {
    calls.push({ url, params: config?.params })
    if (url.startsWith('/v1/logs')) {
      return Promise.resolve({
        data: { code: 200, data: { list: [], total: 0, pageNo: 1, pageSize: 20 }, message: '' },
        headers: {},
      })
    }
    const match = /^\/v1\/sango\/chapters\/(\d+)$/.exec(url)
    if (match) {
      const chapter = Number(match[1])
      return Promise.resolve({
        data: {
          code: 200,
          data: {
            chapter,
            title: `第 ${chapter} 回标题`,
            prev: chapter > 1 ? { chapter: chapter - 1, title: '上一回' } : null,
            next: chapter < 120 ? { chapter: chapter + 1, title: '下一回' } : null,
            chunks: [
              { chunkId: `sanguo-yanyi:${String(chapter).padStart(4, '0')}:c0001`, text: '原文', type: 'narration', segFrom: 1, segTo: 1 },
            ],
          },
          message: '',
        },
        headers: {},
      })
    }
    return Promise.reject(new Error(`unexpected url: ${url}`))
  })
  return { calls }
}

describe('fetchLogList domain 过滤（feat-A010 验收 1 / 2）', () => {
  it('选中项目时请求携带 domain 枚举值，与既有条件同层叠加', async () => {
    const { calls } = installFakeGet()
    await fetchLogList({ domain: 'sango-novel', logType: 'chat', pageNo: 1, pageSize: 20 })
    const call = calls.find((c) => c.url.startsWith('/v1/logs'))
    assert.equal(call?.params?.domain, 'sango-novel')
    assert.equal(call?.params?.logType, 'chat')
    assert.equal(call?.params?.pageNo, 1)
  })

  it('「全部」（空字符串 / 不传）不携带 domain 参数', async () => {
    const { calls } = installFakeGet()
    await fetchLogList({ domain: '' })
    const call = calls.find((c) => c.url.startsWith('/v1/logs'))
    assert.ok(call)
    assert.ok(!('domain' in (call.params ?? {})), '全部时不应携带 domain')
  })
})

describe('fetchSangoChapter 按回缓存（feat-A010 验收 13）', () => {
  it('同回重复打开不重复请求，不同回各自请求', async () => {
    const { calls } = installFakeGet()
    await fetchSangoChapter(73)
    await fetchSangoChapter(73)
    await fetchSangoChapter(74)
    const hits = calls.filter((c) => c.url.startsWith('/v1/sango/chapters/'))
    assert.deepEqual(
      hits.map((c) => c.url),
      ['/v1/sango/chapters/73', '/v1/sango/chapters/74'],
    )
  })

  it('请求失败不写入缓存，重试可成功', async () => {
    const calls: string[] = []
    let failed = false
    mock.method(apiClient, 'get', (url: string) => {
      calls.push(url)
      if (url === '/v1/sango/chapters/75' && !failed) {
        failed = true
        return Promise.reject(new Error('工具服务暂不可用，请稍后重试'))
      }
      const chapter = Number(url.split('/').pop())
      return Promise.resolve({
        data: {
          code: 200,
          data: {
            chapter,
            title: `第 ${chapter} 回标题`,
            prev: null,
            next: null,
            chunks: [],
          },
          message: '',
        },
        headers: {},
      })
    })
    await assert.rejects(() => fetchSangoChapter(75))
    const result = await fetchSangoChapter(75)
    assert.equal(result.chapter, 75)
    await fetchSangoChapter(75)
    const hits = calls.filter((url) => url === '/v1/sango/chapters/75')
    assert.equal(hits.length, 2, '失败一次 + 成功一次后缓存命中，不再请求')
  })
})

// ── 缓存控制台（feat-A013）──

const okEnvelope = (data: unknown) => ({ data: { code: 200, data, message: '' }, headers: {} })

describe('缓存控制台接口（feat-A013）', () => {
  it('fetchCacheStatus GET /v1/cache/status 并解包', async () => {
    mock.method(apiClient, 'get', async (url: string) => {
      assert.equal(url, '/v1/cache/status')
      return okEnvelope({ enabled: true, hitLine: 0.92, maxEntries: 500, entryCount: 37 })
    })
    const result = await fetchCacheStatus()
    assert.equal(result.enabled, true)
    assert.equal(result.hitLine, 0.92)
    assert.equal(result.entryCount, 37)
  })

  it('updateCacheStatus PUT /v1/cache/status 携带 enabled 布尔值', async () => {
    mock.method(apiClient, 'put', async (url: string, body?: unknown) => {
      assert.equal(url, '/v1/cache/status')
      assert.deepEqual(body, { enabled: false })
      return okEnvelope({ enabled: false, hitLine: 0.92, maxEntries: 500, entryCount: 37 })
    })
    const result = await updateCacheStatus(false)
    assert.equal(result.enabled, false)
  })

  it('updateCacheMaxEntries PUT /v1/cache/max-entries 携带 maxEntries 并解包', async () => {
    mock.method(apiClient, 'put', async (url: string, body?: unknown) => {
      assert.equal(url, '/v1/cache/max-entries')
      assert.deepEqual(body, { maxEntries: 500 })
      return okEnvelope({ maxEntries: 500 })
    })
    const result = await updateCacheMaxEntries(500)
    assert.equal(result.maxEntries, 500)
  })

  it('clearCache POST /v1/cache/clear 返回清除前条目数', async () => {
    mock.method(apiClient, 'post', async (url: string) => {
      assert.equal(url, '/v1/cache/clear')
      return okEnvelope({ cleared: 37 })
    })
    const result = await clearCache()
    assert.equal(result.cleared, 37)
  })

  it('deleteCacheEntry DELETE /v1/cache/entries/:id', async () => {
    mock.method(apiClient, 'delete', async (url: string) => {
      assert.equal(url, '/v1/cache/entries/12')
      return okEnvelope({ deleted: true })
    })
    const result = await deleteCacheEntry(12)
    assert.equal(result.deleted, true)
  })

  it('fetchCacheEntries 携带分页与排序参数并解包', async () => {
    const calls: { url: string; params?: Record<string, unknown> }[] = []
    mock.method(apiClient, 'get', (url: string, config?: { params?: Record<string, unknown> }) => {
      calls.push({ url, params: config?.params })
      return okEnvelope({ list: [], total: 0, pageNo: 1, pageSize: 10 })
    })
    const result = await fetchCacheEntries({ pageNo: 2, pageSize: 10, sortBy: 'hitCount', order: 'asc' })
    assert.equal(result.total, 0)
    assert.equal(calls[0]?.url, '/v1/cache/entries')
    assert.equal(calls[0]?.params?.pageNo, 2)
    assert.equal(calls[0]?.params?.pageSize, 10)
    assert.equal(calls[0]?.params?.sortBy, 'hitCount')
    assert.equal(calls[0]?.params?.order, 'asc')
  })

  it('fetchCacheOverview GET /v1/cache/overview', async () => {
    mock.method(apiClient, 'get', async (url: string) => {
      assert.equal(url, '/v1/cache/overview')
      return okEnvelope({
        enabled: true,
        hitLine: 0.92,
        maxEntries: 500,
        entryCount: 37,
        answerBytesTotal: 68154,
        embeddingBytesTotal: 151552,
        approximateBytes: 239220,
        avgAnswerBytes: 1842,
      })
    })
    const result = await fetchCacheOverview()
    assert.equal(result.entryCount, 37)
    assert.equal(result.approximateBytes, 239220)
  })

  it('fetchSimilarityDistribution 携带 startAt / endAt', async () => {
    const calls: { url: string; params?: Record<string, unknown> }[] = []
    mock.method(apiClient, 'get', (url: string, config?: { params?: Record<string, unknown> }) => {
      calls.push({ url, params: config?.params })
      return okEnvelope({
        hitLine: 0.92,
        bucketWidth: 0.02,
        bucketCount: 50,
        buckets: [],
        totals: { lowSimilar: 41, grayZone: 9, highConfidence: 12, totalCount: 62 },
        startAt: 1779408000000,
        endAt: 1779494400000,
      })
    })
    const result = await fetchSimilarityDistribution(1779408000000, 1779494400000)
    assert.equal(result.totals.totalCount, 62)
    assert.equal(calls[0]?.url, '/v1/cache/stats/similarity-distribution')
    assert.equal(calls[0]?.params?.startAt, 1779408000000)
    assert.equal(calls[0]?.params?.endAt, 1779494400000)
  })

  it('fetchGrayzone marked=all 不携带 marked 参数，unmarked 时携带', async () => {
    const calls: { url: string; params?: Record<string, unknown> }[] = []
    mock.method(apiClient, 'get', (url: string, config?: { params?: Record<string, unknown> }) => {
      calls.push({ url, params: config?.params })
      return okEnvelope({ list: [], total: 0, pageNo: 1, pageSize: 20 })
    })
    await fetchGrayzone({ startAt: 1, endAt: 2, marked: 'all', pageNo: 1, pageSize: 20 })
    await fetchGrayzone({ startAt: 1, endAt: 2, marked: 'unmarked' })
    assert.equal(calls[0]?.url, '/v1/cache/grayzone')
    assert.ok(!('marked' in (calls[0]?.params ?? {})), 'all 不应携带 marked 参数')
    assert.equal(calls[1]?.params?.marked, 'unmarked')
    assert.equal(calls[0]?.params?.startAt, 1)
  })

  it('markMisjudge POST 标记接口：缺省 markedBy 用「控制台」', async () => {
    mock.method(apiClient, 'post', async (url: string, body?: unknown) => {
      assert.equal(url, '/v1/cache/records/88/mark')
      assert.deepEqual(body, { markedBy: '控制台' })
      return { data: { code: 200, data: null, message: '' }, headers: {} }
    })
    await markMisjudge(88)
  })

  it('markMisjudge 显式 markedBy 透传；unmarkMisjudge 取消标记接口', async () => {
    const urls: string[] = []
    const bodies: unknown[] = []
    mock.method(apiClient, 'post', (url: string, body?: unknown) => {
      urls.push(url)
      bodies.push(body)
      return Promise.resolve({ data: { code: 200, data: null, message: '' }, headers: {} })
    })
    await markMisjudge(88, '小叶')
    await unmarkMisjudge(88)
    assert.deepEqual(urls, ['/v1/cache/records/88/mark', '/v1/cache/records/88/unmark'])
    assert.deepEqual(bodies[0], { markedBy: '小叶' })
  })

  it('fetchMisjudge 解包并透传 rate=null', async () => {
    mock.method(apiClient, 'get', async (url: string, config?: { params?: Record<string, unknown> }) => {
      assert.equal(url, '/v1/cache/misjudge')
      assert.equal(config?.params?.startAt, 1)
      return okEnvelope({
        hitTotal: 0,
        markedMisjudge: 0,
        misjudgeRate: null,
        note: 'hitTotal=0 时 rate 为 null',
      })
    })
    const result = await fetchMisjudge(1, 2)
    assert.equal(result.hitTotal, 0)
    assert.equal(result.misjudgeRate, null)
  })

  it('fetchLogDetail 明细透传 data.cache（命中解释，§3.10）', async () => {
    const cache = {
      hit: true,
      hitLine: 0.92,
      similarity: 0.9821,
      tieHits: 1,
      userQuery: '严颜是怎么被义释的',
      nearestQuery: '义释严颜是怎么回事',
      reason: 'hit',
      marked: false,
      createdAt: 1779408000000,
      cacheLogId: 88,
    }
    mock.method(apiClient, 'get', async (url: string) => {
      assert.equal(url, '/v1/logs/t1')
      return okEnvelope({
        log: { traceId: 't1' },
        llmCalls: [],
        toolCalls: [],
        cache,
      })
    })
    const result = await fetchLogDetail('t1')
    assert.equal(result.cache?.hit, true)
    assert.equal(result.cache?.similarity, 0.9821)
    assert.equal(result.cache?.cacheLogId, 88)
  })

  it('fetchLogList 透传 cacheHit（1 命中 / 0 未命中 / null 旁路或历史行）', async () => {
    mock.method(apiClient, 'get', async (url: string) => {
      assert.ok(url.startsWith('/v1/logs'))
      return okEnvelope({
        list: [
          { traceId: 't1', cacheHit: 1 },
          { traceId: 't2', cacheHit: 0 },
          { traceId: 't3', cacheHit: null },
        ],
        total: 3,
        pageNo: 1,
        pageSize: 10,
      })
    })
    const result = await fetchLogList({})
    assert.equal(result.list[0]?.cacheHit, 1)
    assert.equal(result.list[1]?.cacheHit, 0)
    assert.equal(result.list[2]?.cacheHit, null)
  })
})
