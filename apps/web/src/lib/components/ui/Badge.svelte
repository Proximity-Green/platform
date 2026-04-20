<script lang="ts">
  type Props = {
    tone?: 'default' | 'success' | 'warning' | 'info' | 'danger'
    children?: any
  }
  let { tone = 'default', children }: Props = $props()
</script>

<span class="badge" data-tone={tone}>
  {@render children?.()}
</span>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: 2px var(--space-2);
    border-radius: var(--radius-pill);
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    font-family: var(--font-mono);
    line-height: 1.5;
    white-space: nowrap;
  }
  .badge[data-tone='default'] { background: var(--badge-default-bg); color: var(--badge-default-color); }
  .badge[data-tone='success'] { background: var(--success-soft); color: var(--success); }
  .badge[data-tone='warning'] { background: var(--warning-soft); color: var(--warning); }
  .badge[data-tone='info']    { background: var(--info-soft);    color: var(--info); }
  .badge[data-tone='danger']  { background: var(--danger-soft);  color: var(--danger); }
</style>
