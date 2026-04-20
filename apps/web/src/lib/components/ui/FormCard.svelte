<script lang="ts">
  import Card from './Card.svelte'
  import { enhance } from '$app/forms'
  import { cmdEnterSubmit } from '$lib/utils/shortcuts'

  type Props = {
    action: string
    method?: 'GET' | 'POST'
    id?: string
    onSubmit?: () => void
    onResult?: () => void
    actions?: any
    children?: any
  }
  let { action, method = 'POST', id, onSubmit, onResult, actions, children }: Props = $props()
</script>

<Card padding="md">
  <form
    {method}
    {action}
    {id}
    autocomplete="off"
    class="form"
    use:cmdEnterSubmit
    use:enhance={() => {
      onSubmit?.()
      return async ({ update }) => {
        await update({ reset: false })
        onResult?.()
      }
    }}
  >
    {@render children?.()}
    {#if actions}
      <div class="form-actions">
        {@render actions()}
      </div>
    {/if}
  </form>
</Card>

<style>
  .form { padding: 0; }
  .form-actions {
    display: flex;
    gap: var(--space-2);
    padding-top: var(--space-1);
  }
</style>
