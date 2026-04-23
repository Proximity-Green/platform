<script lang="ts">
  import type { Snippet } from 'svelte'

  type Props = {
    open: boolean
    title: string
    onClose: () => void
    /** Allow the user to drag the dialog by its header. Default true. */
    draggable?: boolean
    /** CSS length — dialog width. Default 560px. */
    width?: string
    /** CSS length — dialog min-height. Default 360px. */
    minHeight?: string
    /** While true, backdrop click + close button are suppressed. */
    busy?: boolean
    children?: Snippet
    footer?: Snippet
  }

  let {
    open,
    title,
    onClose,
    draggable = true,
    width = '560px',
    minHeight = '360px',
    busy = false,
    children,
    footer
  }: Props = $props()

  let offset = $state({ x: 0, y: 0 })
  let dragState: { baseX: number; baseY: number; startX: number; startY: number } | null = null

  function startDrag(e: MouseEvent) {
    if (!draggable) return
    if ((e.target as HTMLElement).closest('.modal-close')) return
    e.preventDefault()
    dragState = {
      baseX: offset.x,
      baseY: offset.y,
      startX: e.clientX,
      startY: e.clientY
    }
    window.addEventListener('mousemove', onDrag)
    window.addEventListener('mouseup', endDrag)
  }
  function onDrag(e: MouseEvent) {
    if (!dragState) return
    offset = {
      x: dragState.baseX + (e.clientX - dragState.startX),
      y: dragState.baseY + (e.clientY - dragState.startY)
    }
  }
  function endDrag() {
    dragState = null
    window.removeEventListener('mousemove', onDrag)
    window.removeEventListener('mouseup', endDrag)
  }

  // Reset the drag offset whenever the dialog opens so a fresh open always
  // starts centred even if it was dragged last time.
  let prevOpen = false
  $effect(() => {
    if (open && !prevOpen) offset = { x: 0, y: 0 }
    prevOpen = open
  })

  function handleBackdrop() {
    if (!busy) onClose()
  }
</script>

{#if open}
  <div class="modal-backdrop" role="presentation" onclick={handleBackdrop}></div>
  <div
    class="modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-title"
    style="width: min({width}, 90vw); min-height: {minHeight}; transform: translate(calc(-50% + {offset.x}px), calc(-50% + {offset.y}px))"
  >
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <header
      class="modal-head"
      class:is-drag={draggable}
      aria-label={draggable ? 'Dialog header — drag to move' : undefined}
      onmousedown={startDrag}
    >
      <h3 id="modal-title">{title}</h3>
      <button type="button" class="modal-close" onclick={onClose} disabled={busy} aria-label="Close">×</button>
    </header>
    <div class="modal-body">
      {@render children?.()}
    </div>
    {#if footer}
      <footer class="modal-foot">{@render footer()}</footer>
    {/if}
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.35);
    z-index: 100;
  }
  .modal {
    position: fixed;
    top: 50%;
    left: 50%;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
    z-index: 101;
    overflow: visible;
  }
  .modal-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--border);
  }
  .modal-head.is-drag { cursor: move; user-select: none; }
  .modal-head.is-drag:active { cursor: grabbing; }
  .modal-head h3 { margin: 0; font-size: var(--text-md); }
  .modal-close {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 20px;
    line-height: 1;
    padding: 0 var(--space-1);
  }
  .modal-close:hover { color: var(--text); }
  .modal-close:disabled { opacity: 0.4; cursor: not-allowed; }
  .modal-body {
    flex: 1;
    padding: var(--space-4);
    overflow: visible;
    min-height: 0;
  }
  .modal-foot {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border-top: 1px solid var(--border);
  }
</style>
