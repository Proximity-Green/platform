<script lang="ts">
  import Button from './Button.svelte'

  type Props = {
    page: number
    pageSize: number
    total: number
    sizes?: readonly number[]
    onPage: (p: number) => void
    onPageSize: (n: number) => void
  }
  let {
    page,
    pageSize,
    total,
    sizes = [10, 50, 100, 200, 1000],
    onPage,
    onPageSize
  }: Props = $props()

  const totalPages = $derived(Math.max(1, Math.ceil(total / pageSize)))
  const currentPage = $derived(Math.min(page, totalPages))
  const from = $derived(total === 0 ? 0 : (currentPage - 1) * pageSize + 1)
  const to = $derived(Math.min(currentPage * pageSize, total))
</script>

<div class="pager">
  <div class="page-size">
    <span class="pag-label">Rows</span>
    {#each sizes as n}
      <button class="chip" class:is-on={pageSize === n} onclick={() => onPageSize(n)}>{n}</button>
    {/each}
  </div>
  <div class="page-info">{from}–{to} of {total}</div>
  <div class="page-nav">
    <Button variant="ghost" size="sm" disabled={currentPage <= 1} onclick={() => onPage(currentPage - 1)}>‹ Prev</Button>
    <span class="pag-current">{currentPage} / {totalPages}</span>
    <Button variant="ghost" size="sm" disabled={currentPage >= totalPages} onclick={() => onPage(currentPage + 1)}>Next ›</Button>
  </div>
</div>

<style>
  .pager {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-top: var(--space-3);
    padding-top: var(--space-3);
    border-top: 1px solid var(--border);
    flex-wrap: wrap;
  }
  .page-size { display: flex; align-items: center; gap: 4px; }
  .pag-label {
    font-size: var(--text-xs);
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    font-weight: var(--weight-semibold);
    margin-right: 4px;
  }
  .chip {
    height: 28px;
    padding: 0 0.7rem;
    border: 1px solid transparent;
    border-radius: var(--radius-pill);
    background: transparent;
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
  .chip:hover { background: var(--surface-hover); color: var(--text); }
  .chip.is-on {
    background: var(--accent-soft);
    color: var(--accent-hover, var(--accent));
    border-color: var(--accent);
    font-weight: var(--weight-semibold);
  }
  .chip.is-on:hover { background: var(--accent-soft); }
  .page-info {
    margin-left: auto;
    font-size: var(--text-xs);
    color: var(--text-muted);
    font-family: var(--font-mono);
  }
  .page-nav { display: flex; align-items: center; gap: var(--space-2); }
  .pag-current {
    font-size: var(--text-xs);
    color: var(--text-muted);
    font-family: var(--font-mono);
    min-width: 48px;
    text-align: center;
  }
</style>
