<script lang="ts">
  import { goto } from '$app/navigation'

  type Hit = {
    kind: 'organisation' | 'person' | 'location' | 'item' | 'invoice' | 'subscription' | 'feature_request' | 'note'
    id: string
    title: string
    subtitle: string | null
    href: string
  }

  let q = $state('')
  let hits = $state<Hit[]>([])
  let loading = $state(false)
  let open = $state(false)
  let activeIdx = $state(-1)
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  const kindIcon: Record<Hit['kind'], string> = {
    organisation:    'Org',
    person:          'Person',
    location:        'Location',
    item:            'Item',
    invoice:         'Invoice',
    subscription:    'Sub',
    feature_request: 'Request',
    note:            'Note'
  }

  async function runSearch(query: string) {
    if (query.trim().length < 2) { hits = []; return }
    loading = true
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
      const data = await res.json()
      hits = data.hits as Hit[]
      activeIdx = hits.length > 0 ? 0 : -1
    } catch {
      hits = []
    } finally {
      loading = false
    }
  }

  function onInput(e: Event) {
    const val = (e.target as HTMLInputElement).value
    q = val
    open = true
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => runSearch(val), 180)
  }

  function onFocus() { open = true }

  function onKey(e: KeyboardEvent) {
    if (!open) return
    if (e.key === 'Escape') { open = false; return }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      activeIdx = Math.min(activeIdx + 1, hits.length - 1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      activeIdx = Math.max(activeIdx - 1, 0)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIdx >= 0 && hits[activeIdx]) pick(hits[activeIdx])
    }
  }

  function pick(h: Hit) {
    open = false
    q = ''
    hits = []
    goto(h.href)
  }

  function onDocClick(e: MouseEvent) {
    const target = e.target as HTMLElement
    if (!target.closest('.global-search')) open = false
  }
  $effect(() => {
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  })
</script>

<div class="global-search" class:is-open={open && (hits.length > 0 || loading)}>
  <div class="gs-input-wrap">
    <svg class="gs-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7"/>
      <path d="m21 21-4.3-4.3"/>
    </svg>
    <input
      type="search"
      class="gs-input"
      placeholder="Search…"
      value={q}
      oninput={onInput}
      onfocus={onFocus}
      onkeydown={onKey}
      aria-label="Global search"
    />
    {#if loading}<span class="gs-spinner" aria-hidden="true"></span>{/if}
  </div>

  {#if open && (hits.length > 0 || loading)}
    <div class="gs-panel" role="listbox">
      {#if loading && hits.length === 0}
        <div class="gs-empty">Searching…</div>
      {:else if hits.length === 0}
        <div class="gs-empty">No results</div>
      {:else}
        {#each hits as hit, i (hit.kind + hit.id)}
          <a
            href={hit.href}
            class="gs-hit"
            class:is-active={i === activeIdx}
            onclick={(e) => { e.preventDefault(); pick(hit) }}
            onmouseenter={() => activeIdx = i}
            role="option"
            aria-selected={i === activeIdx}
          >
            <span class="gs-kind">{kindIcon[hit.kind]}</span>
            <span class="gs-main">
              <span class="gs-title">{hit.title}</span>
              {#if hit.subtitle}<span class="gs-subtitle">{hit.subtitle}</span>{/if}
            </span>
          </a>
        {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  .global-search {
    position: relative;
    width: 280px;
  }
  .gs-input-wrap {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    height: 34px;
    background: rgba(255, 255, 255, 0.16);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.95);
    transition: background 160ms ease, border-color 160ms ease;
  }
  .gs-input-wrap:focus-within {
    background: #ffffff;
    border-color: #ffffff;
    color: #474a54;
  }
  .gs-icon {
    width: 15px;
    height: 15px;
    flex-shrink: 0;
    opacity: 0.9;
  }
  .gs-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: inherit;
    font-family: inherit;
    font-size: 0.9rem;
    min-width: 0;
    padding: 0;
    height: 100%;
  }
  .gs-input::placeholder { color: currentColor; opacity: 0.7; }
  .gs-input-wrap:focus-within .gs-input::placeholder { opacity: 0.5; }

  .gs-spinner {
    width: 12px;
    height: 12px;
    border: 1.5px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    animation: gs-spin 0.6s linear infinite;
    flex-shrink: 0;
  }
  @keyframes gs-spin { to { transform: rotate(360deg); } }

  .gs-panel {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    left: 0;
    background: #ffffff;
    border: 1px solid #e4e4e4;
    border-radius: 8px;
    box-shadow: 0 14px 36px rgba(0, 0, 0, 0.18);
    padding: 6px;
    z-index: 600;
    max-height: 440px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .gs-empty {
    padding: 12px 10px;
    color: #808285;
    font-size: 0.85rem;
    text-align: center;
  }

  .gs-hit {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    background: transparent;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    text-align: left;
    font: inherit;
    color: #474a54;
    width: 100%;
  }
  .gs-hit.is-active { background: #ccf3e0; }
  .gs-hit:hover { background: #f3f4f6; }
  .gs-hit.is-active:hover { background: #ccf3e0; }

  .gs-kind {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #59a370;
    background: #e9f5ee;
    padding: 2px 6px;
    border-radius: 4px;
    flex-shrink: 0;
    min-width: 64px;
    text-align: center;
  }

  .gs-main {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
    flex: 1;
  }
  .gs-title {
    font-size: 0.9rem;
    color: #2b3431;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .gs-subtitle {
    font-size: 0.75rem;
    color: #9a9c9f;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  @media (max-width: 720px) {
    .global-search { width: 160px; }
  }
</style>
