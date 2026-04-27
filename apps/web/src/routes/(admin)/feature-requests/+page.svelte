<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation'
  import { page } from '$app/stores'
  import { PageHead, Badge, Button, DataTable, Drawer, Modal, Field, FieldGrid, Select } from '$lib/components/ui'
  import type { Column } from '$lib/components/ui/DataTable.svelte'
  import type { FeatureRequest, FeatureRequestKind, FeatureRequestStatus, Tag } from '$lib/services/feature-requests.service'

  let { data } = $props()
  const allTags = $derived(data.allTags as Tag[])

  let newOpen = $state(false)
  let newKind = $state<FeatureRequestKind>('feature_request')
  let newTitle = $state('')
  let newSummary = $state('')
  let creating = $state(false)
  let createError = $state<string | null>(null)

  let refining = $state(false)
  let refineError = $state<string | null>(null)
  let refinement = $state<null | {
    title_suggestion: string | null
    summary_suggestion: string | null
    considerations: string[]
  }>(null)

  let selectedTagIds = $state<Set<string>>(new Set())
  let newTagDrafts = $state<Array<{ name: string; checked: boolean }>>([])
  let tagInput = $state('')

  function toggleTagId(id: string, checked: boolean) {
    const next = new Set(selectedTagIds)
    if (checked) next.add(id)
    else next.delete(id)
    selectedTagIds = next
  }

  function addTagFromInput() {
    const name = tagInput.trim()
    if (!name) return
    const match = allTags.find((t) => t.name.toLowerCase() === name.toLowerCase())
    if (match) {
      toggleTagId(match.id, true)
    } else {
      const existing = newTagDrafts.find((d) => d.name.toLowerCase() === name.toLowerCase())
      if (existing) {
        newTagDrafts = newTagDrafts.map((d) => (d === existing ? { ...d, checked: true } : d))
      } else {
        newTagDrafts = [...newTagDrafts, { name, checked: true }]
      }
    }
    tagInput = ''
  }

  function toggleNewTagDraft(name: string, checked: boolean) {
    newTagDrafts = newTagDrafts.map((d) => (d.name === name ? { ...d, checked } : d))
  }

  function openNew(kind: FeatureRequestKind = 'feature_request') {
    newKind = kind
    newTitle = ''
    newSummary = ''
    selectedTagIds = new Set()
    newTagDrafts = []
    tagInput = ''
    createError = null
    refineError = null
    refinement = null
    newOpen = true
  }

  $effect(() => {
    const newParam = $page.url.searchParams.get('new')
    if (newParam === 'feature_request' || newParam === 'note') {
      openNew(newParam)
      const clean = new URL($page.url)
      clean.searchParams.delete('new')
      history.replaceState(history.state, '', clean.pathname + clean.search)
    }
  })

  async function refine() {
    if (refining) return
    if (!newTitle.trim() && !newSummary.trim()) {
      refineError = 'Add a title or summary first so the AI has something to work with.'
      return
    }
    refining = true
    refineError = null
    try {
      const res = await fetch('/api/admin/feature-requests/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle, summary: newSummary, kind: newKind })
      })
      const body = await res.json()
      if (!res.ok || body.error) {
        refineError = body.error ?? `HTTP ${res.status}`
        return
      }
      refinement = {
        title_suggestion: body.title_suggestion ?? null,
        summary_suggestion: body.summary_suggestion ?? null,
        considerations: Array.isArray(body.considerations) ? body.considerations : []
      }
    } catch (e) {
      refineError = e instanceof Error ? e.message : String(e)
    } finally {
      refining = false
    }
  }

  async function submitNew(e: Event) {
    e.preventDefault()
    const title = newTitle.trim()
    if (!title || creating) return
    creating = true
    createError = null
    try {
      const tag_ids = Array.from(selectedTagIds)
      const new_tag_names = newTagDrafts.filter((d) => d.checked).map((d) => d.name)
      const res = await fetch('/api/admin/feature-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          kind: newKind,
          summary: newSummary.trim() || null,
          transcript: [],
          tag_ids,
          new_tag_names
        })
      })
      const body = await res.json()
      if (!res.ok || body.error) {
        createError = body.error ?? `HTTP ${res.status}`
        return
      }
      newOpen = false
      await goto(body.href)
    } catch (e) {
      createError = e instanceof Error ? e.message : String(e)
    } finally {
      creating = false
    }
  }

  function applyTitle() {
    if (refinement?.title_suggestion) {
      newTitle = refinement.title_suggestion
      refinement = { ...refinement, title_suggestion: null }
    }
  }

  function applySummary() {
    if (refinement?.summary_suggestion) {
      newSummary = refinement.summary_suggestion
      refinement = { ...refinement, summary_suggestion: null }
    }
  }

  const STATUS_TONE: Record<FeatureRequestStatus, 'default' | 'info' | 'warning' | 'success'> = {
    new: 'default',
    triaged: 'info',
    planned: 'info',
    in_progress: 'warning',
    done: 'success'
  }

  const STATUS_LABEL: Record<FeatureRequestStatus, string> = {
    new: 'New',
    triaged: 'Triaged',
    planned: 'Planned',
    in_progress: 'In progress',
    done: 'Done'
  }

  const KIND_TONE: Record<FeatureRequestKind, 'info' | 'default'> = {
    feature_request: 'info',
    note: 'default'
  }
  const KIND_LABEL: Record<FeatureRequestKind, string> = {
    feature_request: 'Request',
    note: 'Note'
  }

  // Column widths sum to 100. Kind needs to comfortably hold the "Request"
  // badge — at 9% it was clipping and the title bled left into the kind cell.
  const columns: Column<FeatureRequest>[] = [
    { key: 'vote_count', label: 'Votes', sortable: true, width: '8%', align: 'right' },
    { key: 'kind', label: 'Kind', sortable: true, width: '10%' },
    { key: 'title', label: 'Title', sortable: true, width: '22%' },
    { key: 'summary', label: 'Summary', width: '18%', muted: true, ellipsis: true, get: (r) => r.summary ?? '' },
    { key: 'raised_by', label: 'Raised by', sortable: true, width: '12%', get: (r) => r.author_email ?? '—' },
    { key: 'status', label: 'Status', sortable: true, width: '8%' },
    { key: 'tags', label: 'Tags', width: '12%', get: (r) => r.tags.map((t) => t.name).join(', ') },
    { key: 'created_at', label: 'Created', sortable: true, width: '10%' }
  ]

  function fmtDate(iso: string): string {
    return new Date(iso).toLocaleString('en-ZA', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  let activeFilter = $state<'all' | FeatureRequestKind>(data.initialFilter as 'all' | FeatureRequestKind)

  const kindFilteredRequests = $derived(
    activeFilter === 'all'
      ? (data.requests as FeatureRequest[])
      : (data.requests as FeatureRequest[]).filter((r) => r.kind === activeFilter)
  )

  // ── Bulk selection ────────────────────────────────────────────────
  let selectedIds = $state<Set<string>>(new Set())
  let visibleFrs = $state<FeatureRequest[]>([])

  function toggleSelect(id: string, on: boolean) {
    const next = new Set(selectedIds)
    if (on) next.add(id)
    else next.delete(id)
    selectedIds = next
  }
  function selectAll() {
    selectedIds = new Set(kindFilteredRequests.map((r) => r.id))
  }
  function selectVisible() {
    selectedIds = new Set(visibleFrs.map((r) => r.id))
  }
  function clearSelection() {
    selectedIds = new Set()
  }
  const selectedArr = $derived([...selectedIds])

  // ── Bulk streaming state ──────────────────────────────────────────
  type PhaseStatus = 'pending' | 'active' | 'done' | 'skipped' | 'error'
  type Phase = { key: string; label: string; status: PhaseStatus; detail?: string }
  let bulkPhases = $state<Phase[]>([])
  let bulkResult = $state<{ bulk_action_id: string | null; applied: number; ms: number; role?: string } | null>(null)
  let bulkError = $state<string | null>(null)
  let bulkBusy = $state(false)
  let lastBulkActionId = $state<string | null>(null)
  let lastBulkSummary = $state<string | null>(null)
  let undoBusy = $state(false)

  let showStatusDialog = $state(false)
  let showTagsDialog = $state(false)
  let showDeleteDialog = $state(false)
  let bulkDeleteConfirm = $state('')
  let bulkStatus = $state<FeatureRequestStatus>('triaged')
  let bulkTagIds = $state<Set<string>>(new Set())
  let bulkNewTagDrafts = $state<Array<{ name: string; checked: boolean }>>([])
  let bulkTagInput = $state('')

  function initPhases(applyingLabel: string) {
    bulkPhases = [
      { key: 'resolving', label: 'Looking up records', status: 'active' },
      { key: 'guarding', label: 'Checking safety guards', status: 'pending' },
      { key: 'applying', label: applyingLabel, status: 'pending' },
      { key: 'done', label: 'Done', status: 'pending' }
    ]
  }
  function setPhase(key: string, status: PhaseStatus, detail?: string) {
    bulkPhases = bulkPhases.map((p) => (p.key === key ? { ...p, status, detail } : p))
  }
  function advancePast(key: string) {
    let seen = false
    bulkPhases = bulkPhases.map((p) => {
      if (p.key === key) { seen = true; return p }
      if (!seen && (p.status === 'active' || p.status === 'pending')) return { ...p, status: 'done' }
      return p
    })
  }

  async function runBulkStream(url: string, body: Record<string, unknown>, applyingLabel: string) {
    bulkBusy = true
    bulkError = null
    bulkResult = null
    initPhases(applyingLabel)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '')
        throw new Error(text || `HTTP ${res.status}`)
      }
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        let nl
        while ((nl = buf.indexOf('\n')) !== -1) {
          const line = buf.slice(0, nl).trim()
          buf = buf.slice(nl + 1)
          if (!line) continue
          let evt: any
          try { evt = JSON.parse(line) } catch { continue }
          handlePhase(evt)
        }
      }
    } catch (e: any) {
      bulkError = e?.message ?? String(e)
      setPhase('applying', 'error', bulkError ?? undefined)
    } finally {
      bulkBusy = false
    }
  }

  function handlePhase(evt: any) {
    switch (evt.phase) {
      case 'resolving':
        setPhase('resolving', 'active', `${evt.selected} selected`)
        break
      case 'resolved':
        setPhase('resolving', 'done', `${evt.linked} found`)
        setPhase('guarding', 'active')
        break
      case 'guarding':
        setPhase('guarding', evt.actionable === 0 ? 'skipped' : 'done', `${evt.actionable} actionable`)
        setPhase('applying', evt.actionable === 0 ? 'skipped' : 'active')
        break
      case 'applying':
        setPhase('applying', 'active', `→ ${evt.role} · ${evt.targets} record${evt.targets === 1 ? '' : 's'}`)
        break
      case 'done':
        advancePast('done')
        setPhase('done', 'done', `${evt.applied} applied in ${evt.ms}ms`)
        bulkResult = evt
        lastBulkActionId = evt.bulk_action_id ?? null
        lastBulkSummary = evt.applied > 0
          ? `Applied ${evt.role} to ${evt.applied} record${evt.applied === 1 ? '' : 's'} · ${evt.ms}ms`
          : (evt.message ?? 'Nothing applied')
        invalidateAll()
        break
      case 'error':
        bulkError = evt.error ?? 'Unknown error'
        setPhase('applying', 'error', bulkError ?? undefined)
        break
    }
  }

  function runBulkSetStatus() {
    if (!bulkStatus || selectedArr.length === 0) return
    return runBulkStream(
      '/api/admin/feature-requests/bulk-set-status',
      { status: bulkStatus, fr_ids: selectedArr },
      `Setting status to "${bulkStatus.replace('_', ' ')}"`
    )
  }

  function runBulkSoftDelete() {
    if (selectedArr.length === 0) return
    if (bulkDeleteConfirm !== 'DELETE') return
    return runBulkStream(
      '/api/admin/bulk-soft-delete',
      { table: 'feature_requests', ids: selectedArr, confirm: 'DELETE' },
      `Deleting ${selectedArr.length} record${selectedArr.length === 1 ? '' : 's'}`
    )
  }

  function runBulkAddTags() {
    if (selectedArr.length === 0) return
    const tag_ids = [...bulkTagIds]
    const new_tag_names = bulkNewTagDrafts.filter((d) => d.checked).map((d) => d.name)
    if (!tag_ids.length && !new_tag_names.length) return
    return runBulkStream(
      '/api/admin/feature-requests/bulk-add-tags',
      { tag_ids, new_tag_names, fr_ids: selectedArr },
      `Adding ${tag_ids.length + new_tag_names.length} tag${tag_ids.length + new_tag_names.length === 1 ? '' : 's'}`
    )
  }

  function toggleBulkTag(id: string, on: boolean) {
    const next = new Set(bulkTagIds)
    if (on) next.add(id)
    else next.delete(id)
    bulkTagIds = next
  }

  function addBulkTagFromInput() {
    const name = bulkTagInput.trim()
    if (!name) return
    const match = allTags.find((t) => t.name.toLowerCase() === name.toLowerCase())
    if (match) {
      toggleBulkTag(match.id, true)
    } else {
      const existing = bulkNewTagDrafts.find((d) => d.name.toLowerCase() === name.toLowerCase())
      if (existing) {
        bulkNewTagDrafts = bulkNewTagDrafts.map((d) => (d === existing ? { ...d, checked: true } : d))
      } else {
        bulkNewTagDrafts = [...bulkNewTagDrafts, { name, checked: true }]
      }
    }
    bulkTagInput = ''
  }

  function toggleBulkNewTagDraft(name: string, checked: boolean) {
    bulkNewTagDrafts = bulkNewTagDrafts.map((d) => (d.name === name ? { ...d, checked } : d))
  }

  function closeBulkDialog() {
    showStatusDialog = false
    showTagsDialog = false
    showDeleteDialog = false
    bulkPhases = []
    bulkResult = null
    bulkError = null
    bulkTagIds = new Set()
    bulkNewTagDrafts = []
    bulkTagInput = ''
    bulkDeleteConfirm = ''
    if (!bulkBusy) clearSelection()
  }

  async function undoLastBulk() {
    if (!lastBulkActionId) return
    undoBusy = true
    bulkError = null
    try {
      const res = await fetch('/api/admin/bulk-undo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bulk_action_id: lastBulkActionId })
      })
      if (!res.ok) {
        const t = await res.text().catch(() => '')
        throw new Error(t || `HTTP ${res.status}`)
      }
      const payload = await res.json().catch(() => ({}))
      lastBulkActionId = null
      showStatusDialog = false
      showTagsDialog = false
      bulkPhases = []
      bulkResult = null
      clearSelection()
      await invalidateAll()
      lastBulkSummary = `Undone — previous state restored${payload?.restored ? ` (${payload.restored} rows)` : ''}.`
    } catch (e: any) {
      lastBulkSummary = `Undo failed: ${e?.message ?? String(e)}`
    } finally {
      undoBusy = false
    }
  }

  const STATUS_OPTIONS_BULK = [
    { value: 'new', label: 'New' },
    { value: 'triaged', label: 'Triaged' },
    { value: 'planned', label: 'Planned' },
    { value: 'in_progress', label: 'In progress' },
    { value: 'done', label: 'Done' }
  ]

</script>

<PageHead title="Feature Requests & Notes" lede="Ideas, asks, and saved chats raised from the admin chat. Upvote feature requests; notes are kept as a reference.">
  <Button size="sm" onclick={() => openNew('feature_request')}>+ New request</Button>
  <Button size="sm" variant="ghost" onclick={() => openNew('note')}>+ New note</Button>
</PageHead>

<div class="filter-tabs">
  <button type="button" class="filter-tab" class:is-active={activeFilter === 'all'} onclick={() => (activeFilter = 'all')}>All</button>
  <button type="button" class="filter-tab" class:is-active={activeFilter === 'feature_request'} onclick={() => (activeFilter = 'feature_request')}>Feature requests</button>
  <button type="button" class="filter-tab" class:is-active={activeFilter === 'note'} onclick={() => (activeFilter = 'note')}>Notes</button>
</div>

{#if lastBulkSummary && !showStatusDialog && !showTagsDialog}
  <div class="bulk-flash" role="status">
    <span>{lastBulkSummary}</span>
    {#if lastBulkActionId}
      <Button size="sm" variant="ghost" onclick={undoLastBulk} disabled={undoBusy} loading={undoBusy}>Undo</Button>
    {/if}
    <button type="button" class="bulk-flash-close" onclick={() => (lastBulkSummary = null)} aria-label="Dismiss">×</button>
  </div>
{/if}

{#if selectedIds.size > 0}
  <div class="bulk-bar" role="region" aria-label="Bulk actions">
    <div class="bulk-count">
      <strong>{selectedIds.size}</strong> selected
      <span class="bulk-sep">·</span>
      <button type="button" class="bulk-link" onclick={clearSelection}>Clear</button>
      <button type="button" class="bulk-link" onclick={selectAll}>
        Select all ({kindFilteredRequests.length})
      </button>
      {#if visibleFrs.length > 0 && visibleFrs.length !== kindFilteredRequests.length}
        <button type="button" class="bulk-link" onclick={selectVisible}>
          Select filtered ({visibleFrs.length})
        </button>
      {/if}
    </div>
    <div class="bulk-actions">
      <Button size="sm" variant="secondary" onclick={() => (showStatusDialog = true)}>Set status…</Button>
      <Button size="sm" variant="secondary" onclick={() => (showTagsDialog = true)}>Add tags…</Button>
      <button type="button" class="bulk-delete-btn" onclick={() => (showDeleteDialog = true)}>Delete…</button>
    </div>
  </div>
{/if}

<DataTable
  data={kindFilteredRequests}
  {columns}
  table="feature-requests"
  searchFields={['title', 'summary']}
  searchPlaceholder="Search title or summary…"
  csvFilename="feature-requests"
  empty="Nothing here yet. Save a chat or raise a feature request from the admin chat."
  onActivate={(r) => goto(`/feature-requests/${r.id}`)}
  onFilteredChange={(rows) => (visibleFrs = rows as FeatureRequest[])}
>
  {#snippet row(r)}
    <td class="right">
      <input
        type="checkbox"
        class="row-check"
        checked={selectedIds.has(r.id)}
        onclick={(e) => e.stopPropagation()}
        onchange={(e) => toggleSelect(r.id, (e.currentTarget as HTMLInputElement).checked)}
        aria-label={`Select ${r.title}`}
      />
      <span class="vote-chip" class:voted={r.viewer_voted}>
        <span class="vote-arrow">▲</span>
        {r.vote_count}
      </span>
    </td>
    <td><Badge tone={KIND_TONE[r.kind]}>{KIND_LABEL[r.kind]}</Badge></td>
    <td><a class="title-link" href="/feature-requests/{r.id}">{r.title}</a></td>
    <td class="muted ellipsis" title={r.summary ?? ''}>{r.summary ?? '—'}</td>
    <td class="muted">{r.author_email ?? '—'}</td>
    <td><Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge></td>
    <td class="tags-cell">
      {#each r.tags as t}
        <Badge tone="default">{t.name}</Badge>
      {/each}
      {#if r.tags.length === 0}<span class="muted">—</span>{/if}
    </td>
    <td class="muted">{fmtDate(r.created_at)}</td>
  {/snippet}
</DataTable>

<Drawer
  open={newOpen}
  title={newKind === 'feature_request' ? 'New feature request' : 'New note'}
  formId="new-fr-form"
  onClose={() => (newOpen = false)}
>
  <form id="new-fr-form" onsubmit={submitNew}>
    <div class="kind-toggle">
      <label class="kind-opt" class:is-active={newKind === 'feature_request'}>
        <input type="radio" bind:group={newKind} value="feature_request" />
        <span class="kind-name">Feature request</span>
        <span class="kind-hint">Actionable ask — enters the lifecycle and can be upvoted.</span>
      </label>
      <label class="kind-opt" class:is-active={newKind === 'note'}>
        <input type="radio" bind:group={newKind} value="note" />
        <span class="kind-name">Note</span>
        <span class="kind-hint">Keep as reference. Promote to a request later if it takes shape.</span>
      </label>
    </div>

    <FieldGrid cols={1}>
      <Field label="Title">
        <input type="text" bind:value={newTitle} required maxlength="160" class="fr-input" placeholder="One line — who, what, why" />
      </Field>
      <Field label="Summary">
        <textarea bind:value={newSummary} rows="5" class="fr-textarea" placeholder="The problem, the ask, the context. Shortest useful version wins."></textarea>
      </Field>
      <Field label="Tags">
        <div class="tag-picker">
          <div class="tag-list">
            {#each allTags as t}
              <label class="tag-check">
                <input
                  type="checkbox"
                  checked={selectedTagIds.has(t.id)}
                  onchange={(e) => toggleTagId(t.id, (e.currentTarget as HTMLInputElement).checked)}
                />
                <span>{t.name}</span>
              </label>
            {/each}
            {#each newTagDrafts as d}
              <label class="tag-check is-new">
                <input
                  type="checkbox"
                  checked={d.checked}
                  onchange={(e) => toggleNewTagDraft(d.name, (e.currentTarget as HTMLInputElement).checked)}
                />
                <span>{d.name}</span>
              </label>
            {/each}
            {#if allTags.length === 0 && newTagDrafts.length === 0}
              <span class="tag-picker-empty">No tags yet — add one below.</span>
            {/if}
          </div>
          <div class="tag-picker-input">
            <input
              type="text"
              bind:value={tagInput}
              onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTagFromInput() } }}
              placeholder="New tag name"
              class="fr-input"
              autocomplete="off"
            />
            <Button type="button" size="sm" variant="ghost" onclick={addTagFromInput}>+ Add</Button>
          </div>
        </div>
      </Field>
    </FieldGrid>

    <div class="refine-row">
      <Button type="button" variant="ghost" size="sm" onclick={refine} loading={refining} disabled={refining}>
        {refining ? 'Refining…' : '✶ Refine with AI'}
      </Button>
      <a class="refine-alt" href="/admin">Rather chat it through? Open the platform chat →</a>
    </div>
    {#if refineError}
      <p class="refine-error">{refineError}</p>
    {/if}

    {#if refinement}
      <div class="refine-panel">
        <div class="refine-head">AI suggestions</div>

        {#if refinement.title_suggestion}
          <div class="suggest">
            <div class="suggest-label">Tighter title</div>
            <div class="suggest-body">{refinement.title_suggestion}</div>
            <div class="suggest-actions">
              <Button type="button" size="sm" variant="ghost" onclick={applyTitle}>Apply</Button>
            </div>
          </div>
        {/if}

        {#if refinement.summary_suggestion}
          <div class="suggest">
            <div class="suggest-label">Clearer summary</div>
            <div class="suggest-body">{refinement.summary_suggestion}</div>
            <div class="suggest-actions">
              <Button type="button" size="sm" variant="ghost" onclick={applySummary}>Apply</Button>
            </div>
          </div>
        {/if}

        {#if refinement.considerations.length > 0}
          <div class="suggest">
            <div class="suggest-label">Consider</div>
            <ul class="suggest-list">
              {#each refinement.considerations as c}
                <li>{c}</li>
              {/each}
            </ul>
          </div>
        {/if}

        {#if !refinement.title_suggestion && !refinement.summary_suggestion && refinement.considerations.length === 0}
          <p class="refine-empty">Looks good — nothing to suggest.</p>
        {/if}
      </div>
    {/if}

    {#if createError}
      <p class="refine-error">{createError}</p>
    {/if}
  </form>
  {#snippet footer()}
    <Button variant="ghost" size="sm" onclick={() => (newOpen = false)} disabled={creating}>Cancel</Button>
    <Button type="submit" form="new-fr-form" size="sm" loading={creating}>
      {creating ? 'Creating…' : 'Create'}
    </Button>
  {/snippet}
</Drawer>

<Modal
  open={showStatusDialog}
  title={`Set status on ${selectedIds.size} record${selectedIds.size === 1 ? '' : 's'}`}
  busy={bulkBusy}
  onClose={closeBulkDialog}
>
  <Field label="New status">
    <Select value={bulkStatus} options={STATUS_OPTIONS_BULK} onchange={(v) => (bulkStatus = v as FeatureRequestStatus)} />
  </Field>
  {#if bulkPhases.length > 0}
    <ul class="phase-list">
      {#each bulkPhases as p}
        <li class="phase phase--{p.status}">
          <span class="phase-dot"></span>
          <span class="phase-label">{p.label}</span>
          {#if p.detail}<span class="phase-detail">{p.detail}</span>{/if}
        </li>
      {/each}
    </ul>
  {/if}
  {#if bulkError}<p class="bulk-error">{bulkError}</p>{/if}

  {#snippet footer()}
    <Button variant="ghost" size="sm" onclick={closeBulkDialog} disabled={bulkBusy}>Close</Button>
    {#if lastBulkActionId && bulkResult}
      <Button size="sm" variant="secondary" onclick={undoLastBulk} loading={undoBusy} disabled={undoBusy || bulkBusy}>
        ↶ Undo
      </Button>
    {:else}
      <Button size="sm" onclick={runBulkSetStatus} loading={bulkBusy} disabled={bulkBusy || !bulkStatus}>
        Apply
      </Button>
    {/if}
  {/snippet}
</Modal>

<Modal
  open={showDeleteDialog}
  title={`Delete ${selectedIds.size} record${selectedIds.size === 1 ? '' : 's'}?`}
  busy={bulkBusy}
  onClose={closeBulkDialog}
>
  <p class="bulk-warn">
    This soft-deletes the selected feature request{selectedIds.size === 1 ? '' : 's'}. They'll be hidden from this list and the dashboard, but can be restored from the Change Log within 90 days.
  </p>
  <Field label="Type DELETE to confirm">
    <input
      type="text"
      bind:value={bulkDeleteConfirm}
      class="fr-input"
      autocomplete="off"
      placeholder="DELETE"
      disabled={bulkBusy}
    />
  </Field>
  {#if bulkPhases.length > 0}
    <ul class="phase-list">
      {#each bulkPhases as p}
        <li class="phase phase--{p.status}">
          <span class="phase-dot"></span>
          <span class="phase-label">{p.label}</span>
          {#if p.detail}<span class="phase-detail">{p.detail}</span>{/if}
        </li>
      {/each}
    </ul>
  {/if}
  {#if bulkError}<p class="bulk-error">{bulkError}</p>{/if}

  {#snippet footer()}
    <Button variant="ghost" size="sm" onclick={closeBulkDialog} disabled={bulkBusy}>Close</Button>
    {#if lastBulkActionId && bulkResult}
      <Button size="sm" variant="secondary" onclick={undoLastBulk} loading={undoBusy} disabled={undoBusy || bulkBusy}>
        ↶ Undo
      </Button>
    {:else}
      <Button size="sm" variant="danger" onclick={runBulkSoftDelete}
        loading={bulkBusy}
        disabled={bulkBusy || bulkDeleteConfirm !== 'DELETE'}>
        Delete {selectedIds.size}
      </Button>
    {/if}
  {/snippet}
</Modal>

<Modal
  open={showTagsDialog}
  title={`Add tags to ${selectedIds.size} record${selectedIds.size === 1 ? '' : 's'}`}
  busy={bulkBusy}
  onClose={closeBulkDialog}
>
  <div class="tag-list">
    {#each allTags as t}
      <label class="tag-check">
        <input
          type="checkbox"
          checked={bulkTagIds.has(t.id)}
          onchange={(e) => toggleBulkTag(t.id, (e.currentTarget as HTMLInputElement).checked)}
        />
        <span>{t.name}</span>
      </label>
    {/each}
    {#each bulkNewTagDrafts as d}
      <label class="tag-check is-new">
        <input
          type="checkbox"
          checked={d.checked}
          onchange={(e) => toggleBulkNewTagDraft(d.name, (e.currentTarget as HTMLInputElement).checked)}
        />
        <span>{d.name}</span>
      </label>
    {/each}
    {#if allTags.length === 0 && bulkNewTagDrafts.length === 0}
      <span class="tag-picker-empty">No tags yet — add one below.</span>
    {/if}
  </div>
  <div class="tag-picker-input">
    <input
      type="text"
      bind:value={bulkTagInput}
      onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addBulkTagFromInput() } }}
      placeholder="New tag name"
      class="fr-input"
      autocomplete="off"
    />
    <Button type="button" size="sm" variant="ghost" onclick={addBulkTagFromInput}>+ Add</Button>
  </div>
  <p class="bulk-hint">Only missing assignments are added — undo removes just what this action inserted.</p>
  {#if bulkPhases.length > 0}
    <ul class="phase-list">
      {#each bulkPhases as p}
        <li class="phase phase--{p.status}">
          <span class="phase-dot"></span>
          <span class="phase-label">{p.label}</span>
          {#if p.detail}<span class="phase-detail">{p.detail}</span>{/if}
        </li>
      {/each}
    </ul>
  {/if}
  {#if bulkError}<p class="bulk-error">{bulkError}</p>{/if}

  {#snippet footer()}
    <Button variant="ghost" size="sm" onclick={closeBulkDialog} disabled={bulkBusy}>Close</Button>
    {#if lastBulkActionId && bulkResult}
      <Button size="sm" variant="secondary" onclick={undoLastBulk} loading={undoBusy} disabled={undoBusy || bulkBusy}>
        ↶ Undo
      </Button>
    {:else}
      <Button size="sm" onclick={runBulkAddTags} loading={bulkBusy} disabled={bulkBusy || (bulkTagIds.size === 0 && !bulkNewTagDrafts.some((d) => d.checked))}>
        Apply
      </Button>
    {/if}
  {/snippet}
</Modal>

<style>
  .filter-tabs {
    display: inline-flex;
    gap: 4px;
    padding: 4px;
    background: var(--surface-sunk, var(--surface-hover));
    border-radius: var(--radius-md);
    margin-bottom: var(--space-3);
  }
  .filter-tab {
    padding: 5px 14px;
    border: none;
    background: transparent;
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
    font-family: inherit;
    color: var(--text-muted);
    text-decoration: none;
    cursor: pointer;
    transition: all 120ms;
  }
  .filter-tab:hover { color: var(--text); }
  .filter-tab.is-active {
    background: var(--surface);
    color: var(--accent);
    font-weight: var(--weight-semibold);
    box-shadow: 0 1px 2px rgba(0,0,0,0.06);
  }

  .right { text-align: right; }
  .muted { color: var(--text-muted); }
  .title-link {
    color: var(--text);
    font-weight: var(--weight-medium);
    text-decoration: none;
  }
  .title-link:hover { color: var(--accent); text-decoration: underline; }
  .vote-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    font-family: var(--font-mono);
  }
  .vote-chip.voted {
    background: color-mix(in srgb, var(--accent) 12%, var(--surface));
    border-color: var(--accent);
    color: var(--accent);
  }
  .vote-arrow { font-size: 9px; line-height: 1; }
  .tags-cell {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .kind-toggle {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }
  .kind-opt {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    cursor: pointer;
    background: var(--surface);
    transition: all 150ms;
  }
  .kind-opt input { display: none; }
  .kind-opt:hover { border-color: var(--text-muted); }
  .kind-opt.is-active {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 10%, var(--surface));
  }
  .kind-name {
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    color: var(--text);
  }
  .kind-hint { font-size: var(--text-xs); color: var(--text-muted); line-height: 1.4; }

  .fr-input,
  .fr-textarea {
    width: 100%;
    padding: var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-family: inherit;
    font-size: var(--text-sm);
    background: var(--surface);
    color: var(--text);
  }
  .fr-textarea { resize: vertical; min-height: 100px; }

  .refine-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    margin: var(--space-3) 0 var(--space-2);
  }
  .refine-alt { font-size: var(--text-xs); color: var(--text-muted); text-decoration: none; }
  .refine-alt:hover { color: var(--accent); text-decoration: underline; }
  .refine-error { font-size: var(--text-xs); color: var(--danger); margin: var(--space-1) 0; }

  .refine-panel {
    margin-top: var(--space-3);
    padding: var(--space-3);
    background: color-mix(in srgb, var(--accent) 6%, var(--surface));
    border: 1px solid color-mix(in srgb, var(--accent) 24%, var(--border));
    border-radius: var(--radius-md);
  }
  .refine-head {
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--accent);
    margin-bottom: var(--space-2);
  }
  .suggest {
    padding: var(--space-2);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    margin-bottom: var(--space-2);
  }
  .suggest:last-child { margin-bottom: 0; }
  .suggest-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
    font-weight: var(--weight-semibold);
    margin-bottom: 4px;
  }
  .suggest-body {
    font-size: var(--text-sm);
    color: var(--text);
    line-height: 1.5;
    margin-bottom: var(--space-2);
  }
  .suggest-actions { display: flex; justify-content: flex-end; }
  .suggest-list {
    margin: 0;
    padding-left: 1.25rem;
    font-size: var(--text-sm);
    color: var(--text);
    line-height: 1.5;
  }
  .suggest-list li { margin-bottom: 2px; }
  .refine-empty { font-size: var(--text-sm); color: var(--text-muted); margin: 0; }

  .tag-picker { display: flex; flex-direction: column; gap: var(--space-2); }
  .tag-list { display: flex; flex-wrap: wrap; gap: 6px; }
  .tag-picker-empty { font-size: var(--text-xs); color: var(--text-muted); padding: 2px 0; }
  .tag-picker-input { display: flex; gap: var(--space-2); align-items: center; }
  .tag-check {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 10px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface);
    font-size: var(--text-xs);
    cursor: pointer;
    color: var(--text-muted);
  }
  .tag-check:hover { color: var(--text); border-color: var(--text-muted); }
  .tag-check input { margin: 0; accent-color: var(--accent); }
  .tag-check:has(input:checked) {
    background: color-mix(in srgb, var(--accent) 10%, var(--surface));
    border-color: var(--accent);
    color: var(--accent);
    font-weight: var(--weight-semibold);
  }
  .bulk-bar {
    position: sticky;
    top: 0;
    z-index: 20;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    margin-bottom: var(--space-2);
    background: color-mix(in srgb, var(--accent) 10%, var(--surface));
    border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--border));
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
  }
  .bulk-count strong { color: var(--accent); }
  .bulk-sep { margin: 0 var(--space-1); color: var(--text-muted); }
  .bulk-link {
    background: none;
    border: none;
    color: var(--text);
    cursor: pointer;
    padding: 0 var(--space-1);
    font-size: var(--text-sm);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .bulk-link:hover { color: var(--accent); }
  .bulk-actions { display: inline-flex; gap: var(--space-2); align-items: center; }

  .bulk-delete-btn {
    padding: 5px 12px;
    border: 1px solid color-mix(in srgb, var(--danger) 40%, var(--border));
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--danger);
    font-size: var(--text-sm);
    font-family: inherit;
    cursor: pointer;
    transition: background 120ms;
  }
  .bulk-delete-btn:hover {
    background: color-mix(in srgb, var(--danger) 10%, transparent);
  }
  .bulk-warn {
    margin: 0 0 var(--space-3);
    color: var(--text);
    font-size: var(--text-sm);
    line-height: 1.5;
  }

  .bulk-flash {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    margin-bottom: var(--space-2);
    background: var(--warning-soft);
    border: 1px solid color-mix(in srgb, var(--warning) 40%, var(--border));
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
    color: color-mix(in srgb, var(--warning) 80%, var(--text));
  }
  .bulk-flash-close {
    margin-left: auto;
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 18px;
    line-height: 1;
    padding: 0 var(--space-1);
  }
  .bulk-flash-close:hover { color: var(--text); }

  .row-check { margin-right: var(--space-2); vertical-align: middle; accent-color: var(--accent); }

  .phase-list {
    list-style: none;
    margin: var(--space-3) 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .phase {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) 0;
    font-size: var(--text-sm);
    color: var(--text-muted);
  }
  .phase-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--border);
    flex-shrink: 0;
  }
  .phase--active .phase-dot { background: var(--accent); animation: pulse 1.2s ease-in-out infinite; }
  .phase--done .phase-dot { background: var(--accent); }
  .phase--skipped .phase-dot { background: var(--text-muted); opacity: 0.5; }
  .phase--error .phase-dot { background: var(--danger); }
  .phase--done .phase-label { color: var(--text); }
  .phase--active .phase-label { color: var(--text); font-weight: var(--weight-semibold); }
  .phase-detail { margin-left: auto; font-size: var(--text-xs); }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  .bulk-error { color: var(--danger); font-size: var(--text-sm); margin: var(--space-2) 0 0; }
  .bulk-hint { font-size: var(--text-xs); color: var(--text-muted); margin: var(--space-2) 0 0; }

  .tag-check.is-new,
  .tag-check.is-new:has(input:checked) {
    background: color-mix(in srgb, #f0d97a 16%, var(--surface));
    border-color: color-mix(in srgb, #b08900 30%, var(--border));
    color: #7d5e00;
    font-weight: var(--weight-semibold);
  }
</style>
