<script lang="ts">
  import type { Snippet } from 'svelte'

  type Tone = 'warning' | 'danger' | 'info' | 'success'
  type Props = {
    tone?: Tone
    children: Snippet
    action?: Snippet
  }
  let { tone = 'warning', children, action }: Props = $props()
</script>

<div class="notice alert alert-{tone} notice-{tone}" role="status">
  <div class="notice-body">
    {@render children()}
  </div>
  {#if action}
    <div class="notice-action">{@render action()}</div>
  {/if}
</div>

<style>
  .notice {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-5);
    margin-bottom: var(--space-4);
    border: 1px solid transparent;
    border-radius: var(--radius-sm, 0);
    font-size: 1rem;
    line-height: 1.5;
  }
  .notice-body { flex: 1; min-width: 0; }
  .notice-action { flex-shrink: 0; }

  .notice-warning {
    color: #474a54;
    background: #e0b09f;
    border-color: #e0b09f;
  }
  .notice-danger {
    color: #474a54;
    background: #efd7ce;
    border-color: #efd7ce;
  }
  .notice-info {
    color: var(--info, #474a54);
    background: var(--info-soft, rgba(120, 151, 205, 0.14));
    border-color: var(--info-soft, rgba(120, 151, 205, 0.14));
  }
  .notice-success {
    color: var(--success, #474a54);
    background: var(--success-soft, rgba(89, 163, 112, 0.16));
    border-color: var(--success-soft, rgba(89, 163, 112, 0.16));
  }

  @media (max-width: 640px) {
    .notice {
      flex-direction: column;
      align-items: stretch;
      gap: var(--space-3);
      padding: var(--space-3) var(--space-4);
    }
    .notice-action { align-self: flex-start; }
  }
</style>
