<script lang="ts">
  import { tick } from 'svelte'

  type Option = { value: string; label: string; group?: string } | string

  type Props = {
    name?: string
    value?: string
    options: Option[]
    placeholder?: string
    required?: boolean
    disabled?: boolean
    size?: 'sm' | 'md'
    width?: string
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
    width,
    onchange
  }: Props = $props()

  function normalize(o: Option) {
    return typeof o === 'string' ? { value: o, label: o } : o
  }

  const normalized = $derived(options.map(normalize))
  const currentLabel = $derived(
    normalized.find(o => o.value === value)?.label ?? ''
  )

  let open = $state(false)
  let highlight = $state(-1)
  let query = $state('')
  let triggerEl: HTMLButtonElement | undefined = $state()
  let panelEl: HTMLDivElement | undefined = $state()
  let listEl: HTMLUListElement | undefined = $state()
  let searchEl: HTMLInputElement | undefined = $state()
  let dropUp = $state(false)

  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase()
    if (!q) return normalized
    return normalized.filter(o =>
      o.label.toLowerCase().includes(q) ||
      (o.group ?? '').toLowerCase().includes(q)
    )
  })

  // If any option has a group, render with headings. Otherwise flat.
  const grouped = $derived.by(() => {
    const anyGroup = filtered.some(o => o.group)
    if (!anyGroup) return null
    const order: string[] = []
    const byGroup = new Map<string, typeof filtered>()
    for (const o of filtered) {
      const g = o.group ?? ''
      if (!byGroup.has(g)) { byGroup.set(g, []); order.push(g) }
      byGroup.get(g)!.push(o)
    }
    return order.map(g => ({ group: g, items: byGroup.get(g)! }))
  })

  async function openPanel() {
    if (disabled) return
    query = ''
    const idx = normalized.findIndex(o => o.value === value)
    highlight = idx >= 0 ? idx : 0
    open = true
    await tick()
    positionPanel()
    scrollHighlightIntoView()
    searchEl?.focus()
  }
  function closePanel() { open = false }
  function togglePanel() { open ? closePanel() : openPanel() }

  function positionPanel() {
    if (!triggerEl) return
    const r = triggerEl.getBoundingClientRect()
    const spaceBelow = window.innerHeight - r.bottom
    const spaceAbove = r.top
    // Flip upward only if the panel can't fit below but has more room above
    dropUp = spaceBelow < 260 && spaceAbove > spaceBelow
  }

  function scrollHighlightIntoView() {
    if (!listEl) return
    const el = listEl.querySelector<HTMLElement>('.is-highlighted')
    el?.scrollIntoView({ block: 'nearest' })
  }

  function select(v: string) {
    value = v
    onchange?.(v)
    closePanel()
    triggerEl?.focus()
  }

  function onTriggerKey(e: KeyboardEvent) {
    if (disabled) return
    if (open) return
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      openPanel()
    }
  }

  function onSearchKey(e: KeyboardEvent) {
    if (e.key === 'Escape' || e.key === 'Tab') {
      closePanel()
      triggerEl?.focus()
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const item = filtered[highlight] ?? filtered[0]
      if (item) select(item.value)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      highlight = Math.min(filtered.length - 1, highlight + 1)
      scrollHighlightIntoView()
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      highlight = Math.max(0, highlight - 1)
      scrollHighlightIntoView()
      return
    }
    if (e.key === 'Home') { e.preventDefault(); highlight = 0; scrollHighlightIntoView(); return }
    if (e.key === 'End')  { e.preventDefault(); highlight = filtered.length - 1; scrollHighlightIntoView(); return }
  }

  $effect(() => {
    // Reset highlight when the filtered list changes
    query
    highlight = 0
  })

  function onDocPointer(e: MouseEvent) {
    const target = e.target as HTMLElement
    if (!target.closest('[data-select-wrap]')) closePanel()
  }

  $effect(() => {
    if (!open) return
    document.addEventListener('mousedown', onDocPointer)
    window.addEventListener('resize', positionPanel)
    window.addEventListener('scroll', positionPanel, true)
    return () => {
      document.removeEventListener('mousedown', onDocPointer)
      window.removeEventListener('resize', positionPanel)
      window.removeEventListener('scroll', positionPanel, true)
    }
  })

  function label(opt: { value: string; label: string }): string { return opt.label }
</script>

<div
  class="select-wrap"
  class:sm={size === 'sm'}
  class:is-open={open}
  class:is-disabled={disabled}
  style={width ? `--sel-width: ${width}` : undefined}
  data-select-wrap
>
  <input type="hidden" {name} value={value ?? ''} />
  <button
    type="button"
    class="select-trigger"
    class:is-placeholder={!currentLabel}
    {disabled}
    onclick={togglePanel}
    onkeydown={onTriggerKey}
    bind:this={triggerEl}
    aria-haspopup="listbox"
    aria-expanded={open}
  >
    <span class="sel-label">{currentLabel || placeholder || ''}</span>
    <svg class="caret" class:flip={open} width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  </button>

  {#if open}
    <div
      class="select-panel"
      class:drop-up={dropUp}
      bind:this={panelEl}
    >
      <div class="search-row">
        <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7"/>
          <path d="m20 20-3.5-3.5"/>
        </svg>
        <input
          type="text"
          class="search-input"
          placeholder="Search…"
          bind:value={query}
          onkeydown={onSearchKey}
          bind:this={searchEl}
          autocomplete="off"
        />
      </div>
      <ul class="select-list" role="listbox" bind:this={listEl}>
        {#if placeholder !== undefined && !required && !query}
          <li
            class="select-option is-placeholder"
            class:is-selected={value === ''}
            onmousedown={(e) => { e.preventDefault(); select('') }}
            onmouseenter={() => highlight = -1}
            role="option"
            aria-selected={value === ''}
          >
            <span class="opt-check" aria-hidden="true"></span>
            <span class="opt-label muted">{placeholder}</span>
          </li>
        {/if}
        {#if grouped}
          {#each grouped as g (g.group)}
            {#if g.group}
              <li class="select-group" aria-hidden="true">{g.group}</li>
            {/if}
            {#each g.items as opt (opt.value)}
              {@const i = filtered.indexOf(opt)}
              <li
                class="select-option"
                class:is-highlighted={highlight === i}
                class:is-selected={value === opt.value}
                onmousedown={(e) => { e.preventDefault(); select(opt.value) }}
                onmouseenter={() => highlight = i}
                role="option"
                aria-selected={value === opt.value}
              >
                <span class="opt-check" aria-hidden="true">
                  {#if value === opt.value}
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M3 7.5 6 10.5 11 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  {/if}
                </span>
                <span class="opt-label">{label(opt)}</span>
              </li>
            {/each}
          {:else}
            <li class="select-empty">No matches</li>
          {/each}
        {:else}
          {#each filtered as opt, i (opt.value + ':' + i)}
            <li
              class="select-option"
              class:is-highlighted={highlight === i}
              class:is-selected={value === opt.value}
              onmousedown={(e) => { e.preventDefault(); select(opt.value) }}
              onmouseenter={() => highlight = i}
              role="option"
              aria-selected={value === opt.value}
            >
              <span class="opt-check" aria-hidden="true">
                {#if value === opt.value}
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M3 7.5 6 10.5 11 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                {/if}
              </span>
              <span class="opt-label">{label(opt)}</span>
            </li>
          {:else}
            <li class="select-empty">No matches</li>
          {/each}
        {/if}
      </ul>
    </div>
  {/if}
</div>

<style>
  .select-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
    min-width: var(--sel-width, 140px);
    width: 100%;
  }
  .select-trigger {
    appearance: none;
    -webkit-appearance: none;
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 0 0.75rem;
    height: 36px;
    width: 100%;
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: var(--radius-pill);
    color: var(--text);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    cursor: pointer;
    text-align: left;
    transition:
      border-color var(--motion-fast) var(--ease-out),
      box-shadow var(--motion-fast) var(--ease-out),
      background var(--motion-fast) var(--ease-out);
  }
  .sm .select-trigger {
    height: 30px;
    font-size: var(--text-xs);
    padding: 0 0.65rem;
  }
  .select-trigger:hover:not(:disabled) {
    background: var(--surface-hover);
    border-color: var(--accent);
  }
  .select-trigger:focus-visible {
    outline: none;
    border-color: var(--border-focus, var(--accent));
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  .is-open .select-trigger {
    border-color: var(--border-focus, var(--accent));
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  .is-disabled .select-trigger,
  .select-trigger:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .select-trigger.is-placeholder { color: var(--text-muted); }
  .sel-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .caret {
    color: var(--text-muted);
    transition: transform 140ms var(--ease-out);
    flex-shrink: 0;
  }
  .caret.flip { transform: rotate(180deg); }

  .select-panel {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    right: 0;
    min-width: 100%;
    margin: 0;
    padding: 4px;
    background: var(--surface-raised, #ffffff);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.06);
    z-index: 9000;
    animation: sel-in 120ms var(--ease-out, ease-out);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .select-panel.drop-up {
    top: auto;
    bottom: calc(100% + 6px);
    transform-origin: bottom center;
  }
  @keyframes sel-in {
    from { opacity: 0; transform: translateY(-4px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .search-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 4px;
  }
  .search-icon { color: var(--text-muted); flex-shrink: 0; }
  .search-input {
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    color: var(--text);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    padding: 2px 0;
    min-width: 0;
  }
  .search-input::placeholder { color: var(--text-muted); }

  .select-list {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 220px;
    overflow-y: auto;
  }
  .select-list::-webkit-scrollbar { width: 10px; }
  .select-list::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 8px;
    border: 2px solid var(--surface-raised, #ffffff);
  }
  .select-empty {
    padding: 10px 12px;
    color: var(--text-muted);
    font-size: var(--text-sm);
    text-align: center;
  }
  .select-group {
    padding: 8px 10px 4px;
    font-size: 10px;
    font-weight: var(--weight-semibold);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
  }

  .select-option {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 6px;
    font-size: var(--text-sm);
    color: var(--text);
    cursor: pointer;
    line-height: 1.2;
    user-select: none;
  }
  .sm .select-option {
    font-size: var(--text-xs);
    padding: 6px 8px;
  }
  .select-option.is-highlighted {
    background: var(--accent-soft);
    color: var(--accent);
  }
  .select-option.is-selected {
    font-weight: var(--weight-semibold);
    color: var(--accent);
  }
  .select-option.is-selected.is-highlighted {
    background: var(--accent);
    color: var(--accent-contrast, #ffffff);
  }
  .opt-check {
    width: 14px;
    height: 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .opt-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .muted { color: var(--text-muted); }
</style>
