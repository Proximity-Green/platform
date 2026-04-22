<script lang="ts">
  import { look, setLook, type Look } from '$lib/stores/theme'

  const OPTIONS: { value: Look; label: string; swatch: string }[] = [
    { value: 'w17',      label: 'W17',      swatch: '#59a370' },
    { value: 'graphite', label: 'Graphite', swatch: '#3a5540' },
    { value: 'neon',     label: 'Night',    swatch: '#ff6363' }
  ]
</script>

<div class="theme-toggle" role="group" aria-label="Theme">
  {#each OPTIONS as opt (opt.value)}
    <button
      type="button"
      class="chip"
      class:is-active={$look === opt.value}
      onclick={() => setLook(opt.value)}
      aria-pressed={$look === opt.value}
      title={opt.label}
    >
      <span class="swatch" style="background: {opt.swatch}"></span>
      <span class="label">{opt.label}</span>
    </button>
  {/each}
</div>

<style>
  .theme-toggle {
    display: inline-flex;
    gap: 4px;
    padding: 3px;
    background: var(--surface-sunk);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    color: var(--text-muted);
    font-size: var(--text-xs);
    font: inherit;
    font-size: 11px;
    font-weight: var(--weight-medium);
    cursor: pointer;
    transition: background var(--motion-fast) var(--ease-out),
                color var(--motion-fast) var(--ease-out);
  }
  .chip:hover { color: var(--text); background: var(--surface-hover); }
  .chip.is-active {
    background: var(--surface-raised);
    color: var(--heading-color);
    border-color: var(--border-strong);
    box-shadow: var(--shadow-sm);
  }
  .swatch {
    width: 10px;
    height: 10px;
    border-radius: var(--radius-pill);
    flex-shrink: 0;
  }
  .label { line-height: 1; }
</style>
