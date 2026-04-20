<script lang="ts">
  type Props = { cols?: number; children?: any }
  let { cols = 2, children }: Props = $props()
</script>

<div class="field-grid" style="--cols: {cols}">
  {@render children?.()}
</div>

<style>
  .field-grid {
    display: grid;
    grid-template-columns: repeat(var(--cols), 1fr);
    gap: var(--space-2) var(--space-3);
    margin-bottom: var(--space-3);
  }
  @media (max-width: 900px) {
    .field-grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 520px) {
    .field-grid { grid-template-columns: 1fr; }
  }
</style>
