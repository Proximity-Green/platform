<script lang="ts">
  type Props = {
    open: boolean
    title?: string
    width?: string
    /** If set, Cmd/Ctrl+Enter submits the form with this id */
    formId?: string
    onClose: () => void
    children?: any
    footer?: any
  }
  let { open, title, width = '480px', formId, onClose, children, footer }: Props = $props()
  let drawerEl: HTMLElement | undefined = $state()

  const FOCUSABLE = 'input:not([type=hidden]):not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly]), select:not([disabled]), button:not([disabled]):not(.close), [tabindex]:not([tabindex="-1"])'

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
</script>

{#if open}
  <div class="backdrop" onclick={onClose} role="presentation"></div>
  <aside bind:this={drawerEl} class="drawer" style="width: {width}" role="dialog" aria-modal="true" aria-label={title ?? 'Drawer'}>
    {#if title}
      <header class="drawer-head">
        <h2>{title}</h2>
        <button class="close" onclick={onClose} aria-label="Close" type="button">✕</button>
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
{/if}

<style>
  .backdrop {
    position: fixed; inset: 0;
    background: rgba(0, 0, 0, 0.25);
    backdrop-filter: blur(3px);
    -webkit-backdrop-filter: blur(3px);
    z-index: 100;
    animation: fadeIn 180ms var(--ease-out);
  }
  .drawer {
    position: fixed;
    top: 0; right: 0; bottom: 0;
    background: var(--surface-raised);
    box-shadow: -10px 0 30px rgba(0, 0, 0, 0.12);
    z-index: 101;
    display: flex;
    flex-direction: column;
    animation: slideIn 220ms var(--ease-out);
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
  .close {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-muted);
    font-size: var(--text-md);
    padding: 4px 8px;
    border-radius: var(--radius-sm);
    line-height: 1;
  }
  .close:hover { background: var(--surface-hover); color: var(--text); }
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
  }
</style>
