<script lang="ts">
  type Props = {
    padding?: 'md' | 'lg'
    children?: any
  }
  let { padding = 'lg', children }: Props = $props()
</script>

<div class="card" data-padding={padding}>
  {@render children?.()}
</div>

<style>
  .card {
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-sm);
  }
  .card[data-padding='md'] { padding: var(--space-4); }
  .card[data-padding='lg'] { padding: var(--space-5); }
</style>
