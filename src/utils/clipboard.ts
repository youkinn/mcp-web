// ── 剪贴板复制（feat-A010）──
// navigator.clipboard 只在 https / localhost 可用；不可用（含权限拒绝）时降级
// document.execCommand('copy') + 临时 textarea，保证 http 部署也能复制。

export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // 权限拒绝 / 协议限制等 → 走降级路径
    }
  }
  return legacyCopyText(text)
}

export function legacyCopyText(text: string): boolean {
  if (typeof document === 'undefined') return false
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  textarea.style.pointerEvents = 'none'
  document.body.appendChild(textarea)
  textarea.select()
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    document.body.removeChild(textarea)
  }
}
