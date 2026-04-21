<script lang="ts">
  type Props = {
    name?: string
    label: string
    type?: string
    value?: string | number
    required?: boolean
    placeholder?: string
    form?: string
    full?: boolean
    readonly?: boolean
    disabled?: boolean
    oninput?: (value: string) => void
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
    oninput: onInputProp,
    children
  }: Props = $props()

  const isNumber = type === 'number'

  function stripCommas(s: string): string {
    return s.replace(/,/g, '')
  }

  // Format a raw numeric string with thousand separators, preserving a trailing
  // decimal point and any fractional digits (including trailing zeros) exactly
  // as the user typed — so "1234." stays "1,234." and "1234.50" stays "1,234.50".
  function fmt(s: string): string {
    if (s === '' || s === '-') return s
    const hasDot = s.includes('.')
    const [intPart, fracPart] = s.split('.')
    const isNeg = intPart.startsWith('-')
    const digits = intPart.replace(/-/g, '')
    if (digits === '') return hasDot ? (isNeg ? '-' : '') + '.' + (fracPart ?? '') : s
    const n = Number(digits)
    if (!isFinite(n)) return s
    const formatted = (isNeg ? '-' : '') + n.toLocaleString('en-US')
    if (hasDot) return `${formatted}.${fracPart ?? ''}`
    return formatted
  }

  let rawValue = $state(value == null ? '' : stripCommas(String(value)))
  let display = $state(isNumber ? fmt(rawValue) : rawValue)

  function onInput(e: Event) {
    const el = e.currentTarget as HTMLInputElement
    const before = el.value
    const caret = el.selectionStart ?? before.length
    const commasBeforeCaret = (before.slice(0, caret).match(/,/g) ?? []).length
    const stripped = before.replace(/,/g, '').replace(/[^0-9.\-]/g, '')
    rawValue = stripped
    const next = fmt(stripped)
    display = next
    // Restore caret after Svelte re-renders the formatted value.
    queueMicrotask(() => {
      // Figure out where the caret should sit: count digits/dot/minus up to the
      // original caret (minus the commas that were there), then walk through
      // `next` until we've seen that many, placing the caret one past.
      const rawCaret = caret - commasBeforeCaret
      let seen = 0, pos = 0
      for (; pos < next.length && seen < rawCaret; pos++) {
        if (next[pos] !== ',') seen++
      }
      try { el.setSelectionRange(pos, pos) } catch {}
    })
  }
</script>

<label class:full>
  <span>{label}{#if required}<i class="req">*</i>{/if}</span>
  {#if children}
    {@render children()}
  {:else if isNumber}
    <input
      type="text"
      inputmode="decimal"
      {required}
      {placeholder}
      {form}
      {readonly}
      {disabled}
      value={display}
      oninput={onInput}
      class:is-readonly={readonly || disabled}
      autocomplete="off"
      data-lpignore="true"
      data-form-type="other"
      data-1p-ignore
      data-bwignore
    />
    <input type="hidden" {name} {form} value={rawValue} />
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
      oninput={onInputProp ? (e) => onInputProp((e.currentTarget as HTMLInputElement).value) : undefined}
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
