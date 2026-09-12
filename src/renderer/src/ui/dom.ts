/**
 * PixiJS has no native text entry, so the few text fields we need (player
 * name, LAN address, lobby id) are real <input> elements floated over the
 * canvas and styled to match the palette.
 */
export interface DomInput {
  el: HTMLInputElement
  setPosition(x: number, y: number, w: number): void
  destroy(): void
}

export function createInput(opts: { value?: string; placeholder?: string; onChange?: (v: string) => void; onEnter?: () => void }): DomInput {
  const el = document.createElement('input')
  el.type = 'text'
  el.value = opts.value ?? ''
  el.placeholder = opts.placeholder ?? ''
  el.maxLength = 40
  Object.assign(el.style, {
    position: 'absolute',
    left: '0px',
    top: '0px',
    width: '200px',
    height: '34px',
    boxSizing: 'border-box',
    padding: '0 12px',
    border: '1.5px solid #d8c4a6',
    borderRadius: '10px',
    background: '#fff8ec',
    color: '#3b2a20',
    font: "15px 'Segoe UI', 'Helvetica Neue', 'PingFang SC', sans-serif",
    outline: 'none',
    zIndex: '10'
  } as Partial<CSSStyleDeclaration>)
  el.addEventListener('focus', () => (el.style.borderColor = '#c6512d'))
  el.addEventListener('blur', () => (el.style.borderColor = '#d8c4a6'))
  el.addEventListener('input', () => opts.onChange?.(el.value))
  el.addEventListener('keydown', (e) => {
    e.stopPropagation()
    if (e.key === 'Enter') opts.onEnter?.()
  })
  document.body.appendChild(el)
  return {
    el,
    setPosition(x, y, w) {
      el.style.left = `${x}px`
      el.style.top = `${y}px`
      el.style.width = `${w}px`
    },
    destroy() {
      el.remove()
    }
  }
}
