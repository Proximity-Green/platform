<script lang="ts">
  import { showTimes, toggleShowTimes } from '$lib/stores/ui'
</script>

<button
  class="toggle"
  class:is-on={$showTimes}
  onclick={toggleShowTimes}
  title={$showTimes ? 'Hide times' : 'Show times'}
  type="button"
>
  <span class="dot"></span>
  {$showTimes ? 'Times on' : 'Times off'}
</button>

<style>
  .toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 0.7rem;
    border-radius: var(--radius-pill);
    border: 1px solid var(--border);
    background: var(--surface-raised);
    color: var(--text-muted);
    font-family: var(--font-body);
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    cursor: pointer;
    transition:
      background var(--motion-fast) var(--ease-out),
      color var(--motion-fast) var(--ease-out),
      border-color var(--motion-fast) var(--ease-out);
  }
  .toggle:hover { background: var(--surface-hover); color: var(--text); }
  .toggle.is-on { background: var(--accent-soft); color: var(--accent-hover, var(--accent)); border-color: transparent; }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: var(--border-strong);
  }
  .toggle.is-on .dot { background: var(--accent); }
</style>
