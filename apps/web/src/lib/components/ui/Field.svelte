<script lang="ts">
  type Props = {
    name: string
    label: string
    type?: string
    value?: string
    required?: boolean
    placeholder?: string
    form?: string
    full?: boolean
    readonly?: boolean
    disabled?: boolean
    children?: any
  }
  let {
    name,
    label,
    type = 'text',
    value = '',
    required,
    placeholder,
    form,
    full,
    readonly,
    disabled,
    children
  }: Props = $props()
</script>

<label class:full>
  <span>{label}{#if required}<i class="req">*</i>{/if}</span>
  {#if children}
    {@render children()}
  {:else}
    <input
      {name}
      {type}
      {required}
      {placeholder}
      {value}
      {form}
      {readonly}
      {disabled}
      class:is-readonly={readonly || disabled}
      autocomplete="off"
      data-lpignore="true"
      data-form-type="other"
      data-1p-ignore
      data-bwignore
    />
  {/if}
</label>

<style>
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 11px;
    font-weight: var(--weight-semibold);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    color: var(--label-color);
  }
  label.full { grid-column: 1 / -1; }
  .req { color: var(--accent); margin-left: 2px; font-style: normal; }
  input {
    padding: 0.4rem 0.6rem;
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-size: var(--text-sm);
    font-weight: var(--weight-normal);
    text-transform: none;
    letter-spacing: normal;
    height: 32px;
  }
  input:focus {
    outline: none;
    border-color: var(--border-focus);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  input.is-readonly {
    background: var(--surface-sunk);
    color: var(--text-muted);
    cursor: not-allowed;
  }
  input.is-readonly:focus {
    border-color: var(--border);
    box-shadow: none;
  }
</style>
