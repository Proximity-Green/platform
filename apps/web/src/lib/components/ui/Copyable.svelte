<script lang="ts">
  type Props = {
    value: string | null | undefined
    display?: string
    ellipsis?: boolean
    title?: string
    children?: any
  }
  let { value, display, ellipsis, title, children }: Props = $props()
  let copied = $state(false)

  async function copy(e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      copied = true
      setTimeout(() => { copied = false }, 1200)
    } catch {}
  }
</script>

<span class="copyable" class:ellipsis title={title ?? value ?? ''}>
  <span class="value">
    {#if children}{@render children()}{:else}{display ?? value ?? '—'}{/if}
  </span>
  {#if value}
    <button
      class="copy-btn"
      class:is-copied={copied}
      onclick={copy}
      title={copied ? 'Copied!' : 'Copy'}
      aria-label="Copy"
      type="button"
    >
      {#if copied}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      {:else}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      {/if}
    </button>
  {/if}
</span>

<style>
  .copyable {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 100%;
    min-width: 0;
  }
  .value { min-width: 0; }
  .copyable.ellipsis .value {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .copy-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    padding: 0;
    background: none;
    border: none;
    color: var(--text-subtle);
    cursor: pointer;
    border-radius: var(--radius-sm);
    opacity: 0;
    transition:
      opacity var(--motion-fast) var(--ease-out),
      color var(--motion-fast) var(--ease-out),
      background var(--motion-fast) var(--ease-out);
  }
  .copyable:hover .copy-btn { opacity: 1; }
  .copy-btn:hover { color: var(--accent); background: var(--surface-hover); }
  .copy-btn:focus-visible {
    opacity: 1;
    outline: none;
    box-shadow: 0 0 0 2px var(--accent-soft);
  }
  .copy-btn.is-copied { opacity: 1; color: var(--success, var(--accent)); }
</style>
