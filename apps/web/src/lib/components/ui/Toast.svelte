<script lang="ts">
  type Props = {
    error?: string | null
    success?: boolean
    message?: string
    duration?: number
  }
  let { error, success, message, duration = 2500 }: Props = $props()
  let visible = $state(false)
  $effect(() => {
    if (error || success) {
      visible = true
      const t = setTimeout(() => { visible = false }, duration)
      return () => clearTimeout(t)
    }
  })
</script>

{#if visible && error}
  <div class="toast toast-error">{error}</div>
{/if}
{#if visible && success}
  <div class="toast toast-success">{message ?? 'Saved successfully'}</div>
{/if}

<style>
  .toast {
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-4);
    font-size: var(--text-sm);
    border: 1px solid transparent;
  }
  .toast-error   { background: var(--danger-soft);  color: var(--danger);  border-color: var(--danger); }
  .toast-success { background: var(--success-soft); color: var(--success); border-color: var(--success); }
</style>
