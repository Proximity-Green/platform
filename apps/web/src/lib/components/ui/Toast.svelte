<script lang="ts">
  type Props = {
    error?: string | null
    warning?: string | null
    success?: boolean
    message?: string
    duration?: number
  }
  let { error, warning, success, message, duration = 2500 }: Props = $props()
  let visible = $state(false)
  $effect(() => {
    if (error || warning || success) {
      visible = true
      const t = setTimeout(() => { visible = false }, duration)
      return () => clearTimeout(t)
    }
  })
</script>

{#if visible && (error || warning || success)}
  <div class="toast-slot" role="status" aria-live="polite">
    {#if error}
      <div class="toast toast-error">{error}</div>
    {:else if warning}
      <div class="toast toast-warning">{warning}</div>
    {:else}
      <div class="toast toast-success">{message ?? 'Saved successfully'}</div>
    {/if}
  </div>
{/if}

<style>
  .toast-slot {
    position: fixed;
    top: var(--space-4);
    left: 50%;
    transform: translateX(-50%);
    z-index: 20000;
    pointer-events: none;
    display: flex;
    justify-content: center;
  }
  .toast {
    min-width: 220px;
    max-width: min(90vw, 480px);
    padding: var(--space-2) var(--space-4);
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    text-align: center;
    border: 1px solid transparent;
    box-shadow: var(--shadow-md, 0 4px 12px rgba(0,0,0,0.12));
    animation: toast-in var(--motion-fast, 150ms) var(--ease-out, ease-out);
    pointer-events: auto;
  }
  .toast-error   { background: var(--danger-soft);  color: var(--danger);  border-color: var(--danger); }
  .toast-warning { background: var(--warning-soft); color: var(--warning); border-color: var(--warning); }
  .toast-success { background: var(--success-soft); color: var(--success); border-color: var(--success); }

  @keyframes toast-in {
    from { opacity: 0; transform: translateY(-4px); }
    to   { opacity: 1; transform: translateY(0); }
  }
</style>
