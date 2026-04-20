<script lang="ts">
  import { look, toggleLook } from '$lib/stores/theme'
</script>

<button class="toggle" onclick={toggleLook} title="Switch theme" aria-label="Switch theme">
  <span class="swatch" data-look={$look}></span>
  <span>{$look === 'graphite' ? 'Graphite' : 'Neon'}</span>
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
  .swatch {
    width: 10px;
    height: 10px;
    border-radius: var(--radius-pill);
  }
  .swatch[data-look='graphite'] { background: #3a5540; }
  .swatch[data-look='neon']     { background: #ff6363; }
</style>
