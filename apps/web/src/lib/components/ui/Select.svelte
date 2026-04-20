<script lang="ts">
  type Option = { value: string; label: string } | string

  type Props = {
    name?: string
    value?: string
    options: Option[]
    placeholder?: string
    required?: boolean
    disabled?: boolean
    size?: 'sm' | 'md'
    onchange?: (value: string) => void
  }
  let {
    name,
    value = $bindable(''),
    options,
    placeholder,
    required = false,
    disabled = false,
    size = 'md',
    onchange
  }: Props = $props()

  function normalize(o: Option) {
    return typeof o === 'string' ? { value: o, label: o } : o
  }
</script>

<div class="select-wrap" class:sm={size === 'sm'}>
  <select
    {name}
    {required}
    {disabled}
    bind:value
    onchange={(e) => onchange?.((e.currentTarget as HTMLSelectElement).value)}
  >
    {#if placeholder !== undefined}
      <option value="" disabled={required} selected={!value}>{placeholder}</option>
    {/if}
    {#each options as opt}
      {@const o = normalize(opt)}
      <option value={o.value}>{o.label}</option>
    {/each}
  </select>
  <svg class="caret" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
</div>

<style>
  .select-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
  }
  select {
    appearance: none;
    -webkit-appearance: none;
    -moz-appearance: none;
    padding: 0 2rem 0 0.8rem;
    height: 36px;
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: var(--radius-pill);
    color: var(--text);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    cursor: pointer;
    min-width: 140px;
    transition:
      border-color var(--motion-fast) var(--ease-out),
      box-shadow var(--motion-fast) var(--ease-out),
      background var(--motion-fast) var(--ease-out);
  }
  .sm select {
    height: 30px;
    font-size: var(--text-xs);
    padding: 0 1.75rem 0 0.7rem;
    min-width: 110px;
  }
  select:hover:not(:disabled) {
    background: var(--surface-hover);
    border-color: var(--accent);
  }
  select:focus {
    outline: none;
    border-color: var(--border-focus, var(--accent));
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  select:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .caret {
    position: absolute;
    right: 10px;
    pointer-events: none;
    color: var(--text-muted);
  }
  .sm .caret { right: 8px; }
</style>
