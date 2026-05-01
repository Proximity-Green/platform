<script lang="ts">
  import type { Snippet } from 'svelte'
  type Props = { title: string; lede?: string; ledeSlot?: Snippet; children?: any }
  let { title, lede, ledeSlot, children }: Props = $props()
</script>

<section class="page-head">
  <div class="page-head-text">
    <h1>{title}</h1>
    {#if ledeSlot}
      <p class="lede">{@render ledeSlot()}</p>
    {:else if lede}
      <p class="lede">{lede}</p>
    {/if}
  </div>
  {#if children}
    <div class="page-actions">{@render children()}</div>
  {/if}
</section>

<style>
  .page-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-5);
    margin-bottom: var(--space-6);
  }
  .page-head-text { flex: 1; }
  h1 {
    font-size: var(--text-2xl);
    margin-bottom: var(--space-1);
  }
  .lede {
    color: var(--text-muted);
    font-size: var(--text-md);
    max-width: 620px;
  }
  .lede :global(a) {
    color: var(--accent, #2d6a35);
    text-decoration: none;
    border-bottom: 1px solid currentColor;
  }
  .lede :global(a:hover) { opacity: 0.8; }
  .page-actions {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    flex-wrap: wrap;
  }

  @media (max-width: 640px) {
    .page-head {
      flex-direction: column;
      align-items: stretch;
      gap: var(--space-3);
      margin-bottom: var(--space-4);
    }
    h1 { font-size: var(--text-xl); word-break: break-word; }
    .lede { font-size: var(--text-sm); }
    .page-actions { justify-content: flex-start; }
  }
</style>
