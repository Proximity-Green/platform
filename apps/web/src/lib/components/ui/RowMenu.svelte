<script lang="ts">
  import type { Snippet } from 'svelte'
  type Props = {
    children: Snippet
    ariaLabel?: string
    /** Where the popover anchors. 'right' (default) anchors to row-end, useful
        for a kebab in the right-most table column. 'left' anchors to row-start. */
    align?: 'left' | 'right'
  }
  let { children, ariaLabel = 'Row actions', align = 'right' }: Props = $props()

  let open = $state(false)
  let wrapEl: HTMLDivElement

  function toggle(e: MouseEvent) {
    e.stopPropagation()
    open = !open
  }

  // Close on outside click or Escape. Listener installed only while open so
  // we don't burn cycles on every page mouse move.
  $effect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (wrapEl && !wrapEl.contains(e.target as Node)) open = false
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') open = false }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  })

  // Used by the host to close the menu after an action fires (forms etc.).
  export function close() { open = false }
</script>

<div class="row-menu" bind:this={wrapEl} role="presentation">
  <button
    type="button"
    class="row-menu-btn"
    onclick={toggle}
    aria-haspopup="menu"
    aria-expanded={open}
    aria-label={ariaLabel}
  >⋮</button>
  {#if open}
    <div class="row-menu-pop" class:left={align === 'left'} role="menu" onclick={() => (open = false)}>
      {@render children()}
    </div>
  {/if}
</div>

<style>
  .row-menu { position: relative; display: inline-block; }
  .row-menu-btn {
    background: transparent;
    border: none;
    cursor: pointer;
    width: 28px; height: 28px;
    border-radius: 6px;
    color: var(--text-muted, #5a7060);
    font-size: 18px;
    line-height: 1;
    padding: 0;
  }
  .row-menu-btn:hover {
    background: var(--surface-sunk, #f0eee6);
    color: var(--fg, #0a1f0f);
  }
  .row-menu-pop {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 4px;
    min-width: 160px;
    background: var(--surface, #fff);
    border: 1px solid var(--surface-sunk, #e8e3d8);
    border-radius: 8px;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
    padding: 4px;
    z-index: 30;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .row-menu-pop.left { right: auto; left: 0; }
  /* Style nested buttons / anchors generically so the host doesn't have to. */
  .row-menu-pop :global(button),
  .row-menu-pop :global(a) {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 6px 10px;
    border-radius: 4px;
    border: none;
    background: transparent;
    text-align: left;
    color: inherit;
    font-size: 13px;
    cursor: pointer;
    text-decoration: none;
    line-height: 1.3;
  }
  .row-menu-pop :global(button:hover),
  .row-menu-pop :global(a:hover) {
    background: var(--surface-sunk, #f0eee6);
  }
  .row-menu-pop :global(button.danger),
  .row-menu-pop :global(a.danger) {
    color: var(--danger, #c0392b);
  }
</style>
