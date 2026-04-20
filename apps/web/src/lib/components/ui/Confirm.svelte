<script lang="ts">
  import Button from './Button.svelte'

  type Props = {
    open: boolean
    title?: string
    message: string
    confirmLabel?: string
    cancelLabel?: string
    variant?: 'primary' | 'danger'
    onConfirm: () => void
    onCancel: () => void
  }
  let {
    open,
    title = 'Are you sure?',
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    variant = 'primary',
    onConfirm,
    onCancel
  }: Props = $props()

  function handleKey(e: KeyboardEvent) {
    if (e.key === 'Escape') { onCancel(); return }
    if (e.key === 'Enter' || ((e.metaKey || e.ctrlKey) && e.key === 'Enter')) {
      e.preventDefault()
      onConfirm()
    }
  }

  $effect(() => {
    if (open) {
      document.addEventListener('keydown', handleKey)
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.removeEventListener('keydown', handleKey)
        document.body.style.overflow = prev
      }
    }
  })
</script>

{#if open}
  <div class="backdrop" onclick={onCancel} role="presentation"></div>
  <div class="modal" role="alertdialog" aria-modal="true" aria-label={title}>
    <h3>{title}</h3>
    <p>{message}</p>
    <div class="actions">
      <Button variant="ghost" size="sm" onclick={onCancel}>{cancelLabel}</Button>
      <Button variant={variant === 'danger' ? 'danger' : 'primary'} size="sm" onclick={onConfirm}>{confirmLabel}</Button>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed; inset: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 200;
    animation: fadeIn 150ms var(--ease-out);
  }
  .modal {
    position: fixed;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
    padding: var(--space-5);
    min-width: 320px;
    max-width: 480px;
    z-index: 201;
    animation: popIn 180ms var(--ease-out);
  }
  h3 {
    font-size: var(--text-md);
    font-weight: var(--weight-semibold);
    color: var(--heading-color);
    margin: 0 0 var(--space-2);
  }
  p {
    color: var(--text-muted);
    font-size: var(--text-sm);
    margin: 0 0 var(--space-4);
    line-height: var(--line-normal);
  }
  .actions {
    display: flex;
    gap: var(--space-2);
    justify-content: flex-end;
  }
  @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
  @keyframes popIn {
    from { opacity: 0; transform: translate(-50%, -48%) scale(0.96); }
    to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  }
</style>
