<script lang="ts">
  import { enhance } from '$app/forms'
  import Button from './Button.svelte'
  import Confirm from './Confirm.svelte'

  type Props = {
    action: string
    label: string
    pendingLabel?: string
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
    size?: 'sm' | 'md'
    /** Hidden form field values — keys become name attributes */
    fields?: Record<string, string>
    /** If set, show a confirm modal before submitting */
    confirm?: {
      title?: string
      message: string
      confirmLabel?: string
      variant?: 'primary' | 'danger'
    }
    disabled?: boolean
    onDone?: () => void
  }
  let {
    action,
    label,
    pendingLabel,
    variant = 'primary',
    size = 'md',
    fields = {},
    confirm,
    disabled,
    onDone
  }: Props = $props()

  let pending = $state(false)
  let confirmOpen = $state(false)
  let formEl: HTMLFormElement

  function onClick(e: MouseEvent) {
    if (!confirm) return
    e.preventDefault()
    confirmOpen = true
  }

  function onConfirm() {
    confirmOpen = false
    formEl.requestSubmit()
  }

  function markBusy(on: boolean) {
    const actions = formEl?.closest('.actions')
    const wrap = formEl?.parentElement
    if (on) {
      actions?.classList.add('is-busy')
      formEl?.classList.add('is-active-submit')
      if (wrap && wrap !== actions) wrap.classList.add('is-active-submit')
    } else {
      actions?.classList.remove('is-busy')
      formEl?.classList.remove('is-active-submit')
      if (wrap && wrap !== actions) wrap.classList.remove('is-active-submit')
    }
  }
</script>

<form
  method="POST"
  {action}
  style="display:contents"
  bind:this={formEl}
  use:enhance={() => {
    pending = true
    markBusy(true)
    return async ({ update }) => {
      await update({ reset: false })
      pending = false
      markBusy(false)
      onDone?.()
    }
  }}
>
  {#each Object.entries(fields) as [name, value]}
    <input type="hidden" {name} {value} />
  {/each}
  <Button
    type="submit"
    {variant}
    {size}
    loading={pending}
    disabled={disabled || pending}
    onclick={confirm ? onClick : undefined}
  >
    {pending ? (pendingLabel ?? `${label}…`) : label}
  </Button>
</form>

{#if confirm}
  <Confirm
    open={confirmOpen}
    title={confirm.title ?? 'Are you sure?'}
    message={confirm.message}
    confirmLabel={confirm.confirmLabel ?? label}
    variant={confirm.variant ?? 'primary'}
    onCancel={() => confirmOpen = false}
    onConfirm={onConfirm}
  />
{/if}
