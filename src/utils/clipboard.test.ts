import { strict as assert } from 'node:assert'
import { afterEach, describe, it } from 'node:test'
import { copyText, legacyCopyText } from './clipboard.ts'

// ── 剪贴板复制单测（feat-A010，node:test，跑法：npm test）──
// Node 环境无真实 clipboard / document，用 Object.defineProperty 挂临时桩并在用例后还原。

interface FakeTextarea {
  value: string
  style: Record<string, string>
  setAttribute: (name: string, value: string) => void
  select: () => void
}

interface FakeDocument {
  createElement: (tag: string) => FakeTextarea
  body: { appendChild: (el: FakeTextarea) => void; removeChild: () => void }
  execCommand: (command: string) => boolean
}

function setNavigatorClipboard(value: unknown): void {
  Object.defineProperty(globalThis.navigator, 'clipboard', { configurable: true, writable: true, value })
}

function restoreNavigatorClipboard(): void {
  delete (globalThis.navigator as unknown as Record<string, unknown>).clipboard
}

function setDocument(value: FakeDocument): void {
  Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value })
}

function restoreDocument(): void {
  delete (globalThis as unknown as Record<string, unknown>).document
}

function installFakeDocument(): { state: { copied: string[]; execCommandResult: boolean } } {
  const state = { copied: [] as string[], execCommandResult: true }
  const doc: FakeDocument = {
    createElement: (tag: string): FakeTextarea => {
      assert.equal(tag, 'textarea')
      return { value: '', style: {}, setAttribute() {}, select() {} }
    },
    body: {
      appendChild: (el: FakeTextarea) => {
        state.copied.push(el.value)
      },
      removeChild: () => {},
    },
    execCommand: (command: string): boolean => {
      assert.equal(command, 'copy')
      return state.execCommandResult
    },
  }
  setDocument(doc)
  return { state }
}

afterEach(() => {
  restoreNavigatorClipboard()
  restoreDocument()
})

describe('验收 3 / 5a：navigator.clipboard 可用时优先使用', () => {
  it('writeText 成功后返回 true，不落降级路径', async () => {
    const written: string[] = []
    setNavigatorClipboard({ writeText: async (text: string) => written.push(text) })
    const ok = await copyText('trace-id-1')
    assert.equal(ok, true)
    assert.deepEqual(written, ['trace-id-1'])
  })

  it('writeText 抛错（权限拒绝 / 协议限制）时降级 execCommand 兜底', async () => {
    const { state } = installFakeDocument()
    setNavigatorClipboard({ writeText: () => Promise.reject(new Error('NotAllowedError')) })
    const ok = await copyText('sanguo-yanyi:0073:c0021')
    assert.equal(ok, true)
    assert.deepEqual(state.copied, ['sanguo-yanyi:0073:c0021'])
  })
})

describe('验收 3 / 5a：clipboard 不可用（http 部署）时降级 execCommand + 临时 textarea', () => {
  it('navigator.clipboard 缺失时走 legacyCopyText，复制内容与目标完全一致', async () => {
    const { state } = installFakeDocument()
    const ok = await copyText('dc1b7b5b-2db8-4288-ba06-f4711e0b7a30')
    assert.equal(ok, true)
    assert.deepEqual(state.copied, ['dc1b7b5b-2db8-4288-ba06-f4711e0b7a30'])
  })

  it('execCommand 返回 false 时整体返回 false（调用方给失败反馈，不误报成功）', async () => {
    const { state } = installFakeDocument()
    state.execCommandResult = false
    assert.equal(await copyText('x'), false)
  })

  it('无 document 环境（node 单测直调）返回 false，不抛错', () => {
    assert.equal(legacyCopyText('x'), false)
  })
})
