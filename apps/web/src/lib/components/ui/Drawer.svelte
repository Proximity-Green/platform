<script lang="ts">
  type Props = {
    open: boolean
    title?: string
    width?: string
    /** If set, Cmd/Ctrl+Enter submits the form with this id */
    formId?: string
    /** Key used to persist user-chosen width in localStorage */
    storageKey?: string
    onClose: () => void
    children?: any
    footer?: any
  }
  let {
    open,
    title,
    width = '480px',
    formId,
    storageKey = 'drawer-width',
    onClose,
    children,
    footer
  }: Props = $props()

  let drawerEl: HTMLElement | undefined = $state()
  let fullscreen = $state(false)
  let userWidth = $state<string | null>(null)
  let resizing = $state(false)

  const MIN_PX = 360
  const MAX_VW = 95

  $effect(() => { if (!open) fullscreen = false })

  $effect(() => {
    if (typeof window === 'undefined') return
    const saved = localStorage.getItem(storageKey)
    if (saved) userWidth = saved
  })

  function startResize(e: MouseEvent) {
    if (fullscreen) return
    e.preventDefault()
    resizing = true
    const onMove = (ev: MouseEvent) => {
      const fromRight = window.innerWidth - ev.clientX
      const clamped = Math.max(MIN_PX, Math.min(window.innerWidth * (MAX_VW / 100), fromRight))
      userWidth = `${Math.round(clamped)}px`
    }
    const onUp = () => {
      resizing = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      if (userWidth) localStorage.setItem(storageKey, userWidth)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  function resetWidth() {
    userWidth = null
    try { localStorage.removeItem(storageKey) } catch {}
  }

  function portal(node: HTMLElement) {
    document.body.appendChild(node)
    return {
      destroy() { node.parentNode?.removeChild(node) }
    }
  }

  const FOCUSABLE = 'input:not([type=hidden]):not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly]), select:not([disabled]), button:not([disabled]):not(.icon-btn), [tabindex]:not([tabindex="-1"])'

  function focusableEls(): HTMLElement[] {
    if (!drawerEl) return []
    return Array.from(drawerEl.querySelectorAll<HTMLElement>(FOCUSABLE))
  }

  function handleKey(e: KeyboardEvent) {
    if (e.key === 'Escape') { onClose(); return }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && formId) {
      const el = document.getElementById(formId) as HTMLFormElement | null
      if (el) { e.preventDefault(); el.requestSubmit() }
      return
    }
    if (e.key === 'Tab' && drawerEl) {
      const els = focusableEls()
      if (!els.length) return
      const first = els[0]
      const last = els[els.length - 1]
      const active = document.activeElement as HTMLElement | null
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus() }
      else if (active && !drawerEl.contains(active)) { e.preventDefault(); first.focus() }
    }
  }

  $effect(() => {
    if (open) {
      document.addEventListener('keydown', handleKey)
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      queueMicrotask(() => {
        const els = focusableEls()
        els[0]?.focus()
      })
      return () => {
        document.removeEventListener('keydown', handleKey)
        document.body.style.overflow = prev
      }
    }
  })

  const effectiveWidth = $derived(fullscreen ? '100vw' : (userWidth ?? width))
</script>

{#if open}
  <div class="drawer-root" use:portal>
    <div class="backdrop" onclick={onClose} role="presentation"></div>
    <aside
      bind:this={drawerEl}
      class="drawer"
      class:fullscreen
      class:resizing
      style="width: {effectiveWidth}"
      role="dialog"
      aria-modal="true"
      aria-label={title ?? 'Drawer'}
    >
      {#if !fullscreen}
        <div
          class="resize-handle"
          onmousedown={startResize}
          ondblclick={resetWidth}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize drawer (double-click to reset)"
          title="Drag to resize · double-click to reset"
        ></div>
      {/if}
    {#if title}
      <header class="drawer-head">
        <h2>{title}</h2>
        <div class="head-actions">
          <button class="icon-btn" onclick={() => fullscreen = !fullscreen} aria-label={fullscreen ? 'Exit full screen' : 'Full screen'} type="button" title={fullscreen ? 'Exit full screen (Esc)' : 'Full screen'}>
            {#if fullscreen}
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M8 2v4h4M6 12V8H2M8 6l5-5M1 13l5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            {:else}
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M2 5V2h3M12 5V2H9M2 9v3h3M12 9v3H9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            {/if}
          </button>
          <button class="icon-btn close" onclick={onClose} aria-label="Close" type="button">✕</button>
        </div>
      </header>
    {/if}
    <div class="drawer-body">
      {@render children?.()}
    </div>
    {#if footer}
      <footer class="drawer-foot">
        {@render footer()}
      </footer>
    {/if}
  </aside>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed; inset: 0;
    background: rgba(0, 0, 0, 0.25);
    backdrop-filter: blur(3px);
    -webkit-backdrop-filter: blur(3px);
    z-index: 10000;
    animation: fadeIn 180ms var(--ease-out);
  }
  .drawer {
    position: fixed;
    top: 0; right: 0; bottom: 0;
    background: var(--surface-raised);
    box-shadow: -10px 0 30px rgba(0, 0, 0, 0.12);
    z-index: 10001;
    display: flex;
    flex-direction: column;
    animation: slideIn 220ms var(--ease-out);
  }
  .drawer.resizing {
    animation: none;
    transition: none;
    user-select: none;
  }
  .resize-handle {
    position: absolute;
    top: 0;
    bottom: 0;
    left: -3px;
    width: 6px;
    cursor: ew-resize;
    z-index: 1;
    background: transparent;
    transition: background var(--motion-fast) var(--ease-out);
  }
  .resize-handle:hover,
  .drawer.resizing .resize-handle {
    background: var(--accent-soft);
  }
  .drawer-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--border);
  }
  .drawer-head h2 {
    font-size: var(--text-md);
    font-weight: var(--weight-semibold);
    color: var(--heading-color);
    margin: 0;
  }
  .head-actions { display: inline-flex; align-items: center; gap: 2px; }
  .icon-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-muted);
    font-size: var(--text-sm);
    padding: 4px 8px;
    border-radius: var(--radius-sm);
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .icon-btn:hover { background: var(--surface-hover); color: var(--text); }
  .drawer-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-4);
  }
  .drawer-foot {
    padding: var(--space-3) var(--space-4);
    border-top: 1px solid var(--border);
    display: flex;
    gap: var(--space-2);
    justify-content: flex-end;
  }
  @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
  @keyframes slideIn { from { transform: translateX(100%) } to { transform: translateX(0) } }
  @media (max-width: 520px) {
    .drawer { width: 100% !important; }
    .resize-handle { display: none; }
  }
</style>
