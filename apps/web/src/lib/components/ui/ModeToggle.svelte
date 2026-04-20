<script lang="ts">
  import { mode, toggleMode } from '$lib/stores/theme'
</script>

<button class="toggle" onclick={toggleMode} title="Toggle day / night" aria-label="Toggle day / night">
  {#if $mode === 'dark'}
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
    <span>Day</span>
  {:else}
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
    <span>Night</span>
  {/if}
</button>

<style>
  .toggle {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-muted);
    border-radius: var(--radius-md);
    font-size: var(--text-xs);
    cursor: pointer;
    transition: background var(--motion-fast) var(--ease-out),
                color var(--motion-fast) var(--ease-out),
                border-color var(--motion-fast) var(--ease-out);
  }
  .toggle:hover {
    background: var(--surface-hover);
    color: var(--text);
    border-color: var(--border-strong);
  }
</style>
