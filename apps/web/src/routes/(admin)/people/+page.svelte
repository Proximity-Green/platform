<script lang="ts">
  import { permStore, canDo } from '$lib/stores/permissions'
  import { goto, invalidateAll } from '$app/navigation'
  import { enhance } from '$app/forms'
  import {
    Button,
    PageHead,
    Toast,
    DataTable,
    Drawer,
    FormCard,
    FieldGrid,
    Field,
    Select,
    Copyable
  } from '$lib/components/ui'
  import type { Column, Filter } from '$lib/components/ui/DataTable.svelte'

  type Person = {
    id: string
    first_name: string
    last_name: string
    email: string
    phone: string | null
    job_title: string | null
    user_id: string | null
    created_at: string
    role_name?: string | null
  }

  let { data, form } = $props()
  let showCreate = $state(false)
  let saving = $state(false)

  // ── Bulk selection ──────────────────────────────────────────────
  let selectedIds = $state<Set<string>>(new Set())
  let filteredPersons = $state<Person[]>([])
  let showRoleDialog = $state(false)
  let showFirstNameDialog = $state(false)
  let showEmailDrawer = $state(false)
  let bulkRoleId = $state('')
  let bulkFirstName = $state('')
  let mailSubject = $state('')
  let mailBody = $state('Hi {{first_name}},\n\n')
  let bulkBusy = $state(false)

  // ── Streaming progress for bulk-set-role ─────────────────────────
  type PhaseStatus = 'pending' | 'active' | 'done' | 'skipped' | 'error'
  type Phase = { key: string; label: string; status: PhaseStatus; detail?: string }
  let bulkPhases = $state<Phase[]>([])
  let bulkResult = $state<{ bulk_action_id: string | null; applied: number; ms: number; role?: string; skipped?: any } | null>(null)
  let bulkError = $state<string | null>(null)
  let lastBulkActionId = $state<string | null>(null)
  let lastBulkSummary = $state<string | null>(null)
  let undoBusy = $state(false)

  function initPhases(applyingLabel = 'Applying role') {
    bulkPhases = [
      { key: 'resolving', label: 'Looking up records', status: 'active' },
      { key: 'guarding',  label: 'Checking safety guards', status: 'pending' },
      { key: 'applying',  label: applyingLabel, status: 'pending' },
      { key: 'done',      label: 'Done', status: 'pending' }
    ]
  }
  function setPhase(key: string, status: PhaseStatus, detail?: string) {
    bulkPhases = bulkPhases.map(p => p.key === key ? { ...p, status, detail } : p)
  }
  function advancePast(key: string) {
    let seen = false
    bulkPhases = bulkPhases.map(p => {
      if (p.key === key) { seen = true; return p }
      if (!seen && p.status === 'active') return { ...p, status: 'done' }
      if (!seen && p.status === 'pending') return { ...p, status: 'done' }
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

  function runBulkSetRole() {
    if (!bulkRoleId || selectedArr.length === 0) return
    return runBulkStream('/api/admin/bulk-set-role',
      { role_id: bulkRoleId, person_ids: selectedArr },
      'Applying role')
  }

  function runBulkSetFirstName() {
    const name = bulkFirstName.trim()
    if (!name || selectedArr.length === 0) return
    return runBulkStream('/api/admin/bulk-set-first-name',
      { first_name: name, person_ids: selectedArr },
      `Setting first_name to "${name}"`)
  }

  function handlePhase(evt: any) {
    switch (evt.phase) {
      case 'resolving':
        setPhase('resolving', 'active', `${evt.selected} selected`)
        break
      case 'resolved':
        setPhase('resolving', 'done', `${evt.linked} linked${evt.skipped_no_user ? `, ${evt.skipped_no_user} skipped (no user)` : ''}`)
        setPhase('guarding', 'active')
        break
      case 'guarding':
        setPhase('guarding', evt.actionable === 0 ? 'skipped' : 'done',
          evt.protected > 0 ? `${evt.actionable} actionable, ${evt.protected} protected` : `${evt.actionable} actionable`)
        setPhase('applying', evt.actionable === 0 ? 'skipped' : 'active',
          evt.actionable === 0 ? 'nothing to apply' : undefined)
        break
      case 'applying':
        setPhase('applying', 'active', `→ ${evt.role} · ${evt.targets} user${evt.targets === 1 ? '' : 's'}`)
        break
      case 'done': {
        advancePast('done')
        setPhase('done', 'done', `${evt.applied} applied in ${evt.ms}ms`)
        bulkResult = evt
        lastBulkActionId = evt.bulk_action_id ?? null
        const parts = [
          evt.applied > 0 ? `Applied "${evt.role}" to ${evt.applied} user${evt.applied === 1 ? '' : 's'}` : (evt.message ?? 'Nothing applied'),
          evt.skipped?.no_user ? `${evt.skipped.no_user} skipped (no user)` : null,
          evt.skipped?.protected ? `${evt.skipped.protected} protected` : null,
          `${evt.ms}ms`
        ].filter(Boolean) as string[]
        lastBulkSummary = parts.join(' · ')
        invalidateAll()
        break
      }
      case 'error':
        bulkError = evt.error ?? 'Unknown error'
        setPhase('applying', 'error', bulkError ?? undefined)
        break
    }
  }

  function closeBulkDialog() {
    showRoleDialog = false
    showFirstNameDialog = false
    // Keep result/undo chip visible on the page after closing.
    bulkPhases = []
    bulkResult = null
    bulkError = null
    if (!bulkBusy) clearSelection()
  }

  async function undoLastBulk() {
    if (!lastBulkActionId) return
    undoBusy = true
    bulkError = null
    console.log('[undo] POST /api/admin/bulk-undo', lastBulkActionId)
    try {
      const res = await fetch('/api/admin/bulk-undo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bulk_action_id: lastBulkActionId })
      })
      console.log('[undo] status', res.status)
      if (!res.ok) {
        const t = await res.text().catch(() => '')
        throw new Error(t || `HTTP ${res.status}`)
      }
      const payload = await res.json().catch(() => ({}))
      console.log('[undo] ok', payload)
      lastBulkActionId = null
      // Close modal so the refreshed list is visible behind.
      showRoleDialog = false
      showFirstNameDialog = false
      bulkPhases = []
      bulkResult = null
      bulkError = null
      clearSelection()
      await invalidateAll()
      lastBulkSummary = `Undone — previous state restored${payload?.restored ? ` (${payload.restored} rows)` : ''}.`
    } catch (e: any) {
      const msg = e?.message ?? String(e)
      console.warn('[undo] failed', msg)
      bulkError = `Undo failed: ${msg}`
      lastBulkSummary = `Undo failed: ${msg}`
    } finally {
      undoBusy = false
    }
  }

  function toggleSelect(id: string, on: boolean) {
    const next = new Set(selectedIds)
    if (on) next.add(id); else next.delete(id)
    selectedIds = next
  }
  function selectAll() {
    selectedIds = new Set((data.persons as Person[]).map(p => p.id))
  }
  function selectFound() {
    selectedIds = new Set(filteredPersons.map(p => p.id))
  }
  function clearSelection() {
    selectedIds = new Set()
  }
  const selectedArr = $derived([...selectedIds])
  const selectedPersons = $derived(
    (data.persons as Person[]).filter(p => selectedIds.has(p.id))
  )
  const selectedInvitable = $derived(selectedPersons.filter(p => !p.user_id))

  $effect(() => {
    if (form?.success) {
      showCreate = false
      showRoleDialog = false
      showEmailDrawer = false
      clearSelection()
    }
  })

  let perms = $state({ role: null as string | null, permissions: [] as any, loaded: false })
  permStore.subscribe(v => { perms = v })
  function can(resource: string, action: string = 'read') { return canDo(perms, resource, action) }

  const columns: Column<Person>[] = [
    { key: 'name', label: 'Name', sortable: true, width: '24%', get: p => `${p.first_name} ${p.last_name}` },
    { key: 'email', label: 'Email', sortable: true, width: '24%', ellipsis: true, muted: true },
    { key: 'role_name', label: 'Role', sortable: true, width: '10%', muted: true, get: p => p.role_name ?? '' },
    { key: 'phone', label: 'Phone', width: '12%', mono: true, muted: true, hideBelow: 'md' },
    { key: 'job_title', label: 'Job Title', sortable: true, width: '14%', muted: true, hideBelow: 'md' },
    { key: 'created_at', label: 'Created', sortable: true, width: '12%', date: true, hideBelow: 'sm' }
  ]

  const filters: Filter<Person>[] = [
    { key: 'all', label: 'All' },
    { key: 'user', label: 'Has user', test: p => !!p.user_id },
    { key: 'no_user', label: 'No user', test: p => !p.user_id }
  ]

  const firstNames = ['Sarah', 'James', 'Thandi', 'Mohammed', 'Chen', 'Priya', 'David', 'Emma', 'Sipho', 'Maria', 'Liam', 'Aisha', 'Ravi', 'Nina', 'Oscar', 'Fatima', 'Johan', 'Leila', 'Tom', 'Zanele']
  const lastNames = ['Moyo', 'Van der Berg', 'Naidoo', 'Smith', 'Okonkwo', 'Patel', 'Khumalo', 'Johnson', 'Mbeki', 'Santos', 'Williams', 'Dlamini', 'Cohen', 'Ndlovu', 'Murphy', 'Govender', 'De Villiers', 'Abrahams', 'Botha', 'Singh']
  const titles = ['Community Manager', 'Software Developer', 'Graphic Designer', 'Marketing Manager', 'CEO', 'Freelance Writer', 'Data Analyst', 'HR Manager', 'Sales Director', 'Product Manager', 'UX Designer', 'Accountant', 'Operations Lead', 'Business Development', 'Project Manager']

  function fillRandom() {
    const first = firstNames[Math.floor(Math.random() * firstNames.length)]
    const last = lastNames[Math.floor(Math.random() * lastNames.length)]
    const formEl = document.querySelector('#create-form') as HTMLFormElement
    if (!formEl) return
    ;(formEl.querySelector('[name=first_name]') as HTMLInputElement).value = first
    ;(formEl.querySelector('[name=last_name]') as HTMLInputElement).value = last
    ;(formEl.querySelector('[name=email]') as HTMLInputElement).value = `${first.toLowerCase()}.${last.toLowerCase().replace(/\s/g, '')}.${Math.floor(Math.random() * 9999)}@example.com`
    ;(formEl.querySelector('[name=phone]') as HTMLInputElement).value = `+27${Math.floor(Math.random() * 900000000 + 100000000)}`
    ;(formEl.querySelector('[name=job_title]') as HTMLInputElement).value = titles[Math.floor(Math.random() * titles.length)]
  }
</script>

<PageHead title="Members" lede="Everyone connected to your workspaces — members, prospects, and contacts.">
  {#if can('persons', 'create')}
    <form method="POST" action="?/generateRandom" style="display:contents">
      <Button type="submit" variant="secondary" size="sm">+ 10 Random</Button>
    </form>
    <Button size="sm" onclick={() => { showCreate = !showCreate }}>
      {showCreate ? 'Cancel' : '+ Add Person'}
    </Button>
  {/if}
</PageHead>

<Toast error={form?.error} success={form?.success} message={form?.message} />

{#if showCreate && can('persons', 'create')}
  <div class="create-wrap">
    <FormCard
      action="?/create"
      id="create-form"
      onSubmit={() => { saving = true }}
      onResult={() => { saving = false }}
    >
      <FieldGrid cols={5}>
        <Field name="first_name" label="First Name" required />
        <Field name="last_name" label="Last Name" required />
        <Field name="email" label="Email" type="email" required />
        <Field name="phone" label="Phone" />
        <Field name="job_title" label="Job Title" />
      </FieldGrid>
      {#snippet actions()}
        <Button type="submit" size="sm" loading={saving}>{saving ? 'Saving…' : 'Create Person'}</Button>
        <Button variant="ghost" size="sm" onclick={fillRandom} disabled={saving}>Fill Random</Button>
      {/snippet}
    </FormCard>
  </div>
{/if}

{#if selectedIds.size > 0}
  <div class="bulk-bar" role="region" aria-label="Bulk actions">
    <div class="bulk-count">
      <strong>{selectedIds.size}</strong> selected
      <span class="bulk-sep">·</span>
      <button type="button" class="bulk-link" onclick={clearSelection}>Clear</button>
      <button type="button" class="bulk-link" onclick={selectAll}>
        Select all ({(data.persons as Person[]).length} records)
      </button>
      {#if filteredPersons.length > 0 && filteredPersons.length !== (data.persons as Person[]).length}
        <button type="button" class="bulk-link" onclick={selectFound}>
          Select filtered ({filteredPersons.length} records)
        </button>
      {/if}
    </div>
    <div class="bulk-actions">
      {#if can('users', 'manage')}
        <form method="POST" action="?/bulkInvite" use:enhance={() => { bulkBusy = true; return async ({ update }) => { await update(); bulkBusy = false } }}>
          {#each selectedArr as id}
            <input type="hidden" name="ids" value={id} />
          {/each}
          <Button type="submit" size="sm" variant="secondary" disabled={bulkBusy || selectedInvitable.length === 0} loading={bulkBusy}>
            Invite now {selectedInvitable.length > 0 ? `(${selectedInvitable.length})` : ''}
          </Button>
        </form>
      {/if}
      {#if can('users', 'manage')}
        <Button size="sm" variant="secondary" onclick={() => (showRoleDialog = true)}>Set role…</Button>
      {/if}
      {#if can('persons', 'update')}
        <Button size="sm" variant="secondary" onclick={() => (showFirstNameDialog = true)}>Set first name…</Button>
        <Button size="sm" onclick={() => (showEmailDrawer = true)}>Email (mail merge)…</Button>
      {/if}
    </div>
  </div>
{/if}

<DataTable
  data={data.persons as Person[]}
  {columns}
  {filters}
  table="people"
  title="Members"
  lede="Everyone connected to your workspaces — members, prospects, and contacts."
  searchFields={['first_name', 'last_name', 'email', 'job_title']}
  searchPlaceholder="Search name, email, job title…"
  csvFilename="members"
  empty="No people yet."
  timesToggle
  onActivate={(p) => goto(`/people/${p.id}?tab=properties`)}
  onFilteredChange={(rows) => (filteredPersons = rows as Person[])}
>
  {#snippet row(person, ctx)}
    <td class="name-cell">
      <input
        type="checkbox"
        class="row-check"
        checked={selectedIds.has(person.id)}
        onclick={(e) => e.stopPropagation()}
        onchange={(e) => toggleSelect(person.id, (e.currentTarget as HTMLInputElement).checked)}
        aria-label={`Select ${person.first_name} ${person.last_name}`}
      />
      <Copyable value={`${person.first_name} ${person.last_name}`}>
        <span class="name">{person.first_name} {person.last_name}</span>
        {#if person.user_id}<span class="user-dot" title="Has user account"></span>{/if}
      </Copyable>
    </td>
    <td class="muted">
      <Copyable value={person.email} ellipsis />
    </td>
    <td class="muted">{person.role_name ?? '—'}</td>
    <td class="muted mono hide-md">
      <Copyable value={person.phone} />
    </td>
    <td class="muted hide-md">{person.job_title ?? '—'}</td>
    <td class="date hide-sm">
      <div>{new Date(person.created_at).toLocaleDateString()}</div>
      {#if ctx.showTimes}
        <div class="date-time">{new Date(person.created_at).toLocaleTimeString()}</div>
      {/if}
    </td>
  {/snippet}
  {#snippet pageActions()}
    {#if can('persons', 'create')}
      <form method="POST" action="?/generateRandom" style="display:contents">
        <Button type="submit" variant="secondary" size="sm">+ 10 Random</Button>
      </form>
      <Button size="sm" onclick={() => { showCreate = !showCreate }}>
        {showCreate ? 'Cancel' : '+ Add Person'}
      </Button>
    {/if}
  {/snippet}
</DataTable>

{#if showRoleDialog}
  <div class="modal-backdrop" role="presentation" onclick={() => !bulkBusy && closeBulkDialog()}></div>
  <div class="modal" role="dialog" aria-modal="true">
    <h3>Set role for {selectedIds.size} member{selectedIds.size === 1 ? '' : 's'}</h3>
    <p class="muted small">Only members with a linked user account will be updated. Self and super_admin users are protected.</p>

    {#if bulkPhases.length === 0}
      <Field label="Role">
        <Select
          name="role_id"
          value={bulkRoleId}
          placeholder="Select a role…"
          onchange={(v) => (bulkRoleId = v)}
          options={(data.roles ?? []).map((r: any) => ({ value: r.id, label: r.name }))}
        />
      </Field>
      <div class="modal-actions">
        <Button variant="ghost" size="sm" onclick={closeBulkDialog} disabled={bulkBusy}>Cancel</Button>
        <Button size="sm" onclick={runBulkSetRole} disabled={!bulkRoleId || bulkBusy}>Apply</Button>
      </div>
    {:else}
      <ul class="phase-list" aria-live="polite">
        {#each bulkPhases as p (p.key)}
          <li class="phase phase-{p.status}">
            <span class="phase-icon" aria-hidden="true">
              {#if p.status === 'done'}✓{:else if p.status === 'active'}<span class="spin"></span>{:else if p.status === 'error'}!{:else if p.status === 'skipped'}–{:else}·{/if}
            </span>
            <span class="phase-label">{p.label}</span>
            {#if p.detail}<span class="phase-detail">{p.detail}</span>{/if}
          </li>
        {/each}
      </ul>

      {#if bulkResult && !bulkError}
        <div class="phase-summary ok">
          <strong>{bulkResult.applied}</strong> user{bulkResult.applied === 1 ? '' : 's'} updated · <span class="muted">{bulkResult.ms}ms</span>
          {#if bulkResult.bulk_action_id}
            <Button size="xs" variant="ghost" onclick={undoLastBulk} disabled={undoBusy} loading={undoBusy}>Undo</Button>
          {/if}
        </div>
      {/if}
      {#if bulkError}
        <div class="phase-summary err">{bulkError}</div>
      {/if}

      <div class="modal-actions">
        <Button size="sm" onclick={closeBulkDialog} disabled={bulkBusy}>{bulkBusy ? 'Applying…' : 'Close'}</Button>
      </div>
    {/if}
  </div>
{/if}

{#if showFirstNameDialog}
  <div class="modal-backdrop" role="presentation" onclick={() => !bulkBusy && closeBulkDialog()}></div>
  <div class="modal" role="dialog" aria-modal="true">
    <h3>Set first name on {selectedIds.size} member{selectedIds.size === 1 ? '' : 's'}</h3>
    <p class="muted small">Testing action — overwrites <code>first_name</code> on every selected person. Undoable from the changelog.</p>

    {#if bulkPhases.length === 0}
      <label class="plain-label">
        New first name
        <input
          type="text"
          class="plain-input"
          bind:value={bulkFirstName}
          placeholder="e.g. Testy"
          autofocus
        />
      </label>
      <div class="modal-actions">
        <Button variant="ghost" size="sm" onclick={closeBulkDialog} disabled={bulkBusy}>Cancel</Button>
        <Button size="sm" onclick={runBulkSetFirstName} disabled={!bulkFirstName.trim() || bulkBusy}>Apply</Button>
      </div>
    {:else}
      <ul class="phase-list" aria-live="polite">
        {#each bulkPhases as p (p.key)}
          <li class="phase phase-{p.status}">
            <span class="phase-icon" aria-hidden="true">
              {#if p.status === 'done'}✓{:else if p.status === 'active'}<span class="spin"></span>{:else if p.status === 'error'}!{:else if p.status === 'skipped'}–{:else}·{/if}
            </span>
            <span class="phase-label">{p.label}</span>
            {#if p.detail}<span class="phase-detail">{p.detail}</span>{/if}
          </li>
        {/each}
      </ul>

      {#if bulkResult && !bulkError}
        <div class="phase-summary ok">
          <strong>{bulkResult.applied}</strong> person{bulkResult.applied === 1 ? '' : 's'} updated · <span class="muted">{bulkResult.ms}ms</span>
          {#if bulkResult.bulk_action_id}
            <Button size="xs" variant="ghost" onclick={undoLastBulk} disabled={undoBusy} loading={undoBusy}>Undo</Button>
          {/if}
        </div>
      {/if}
      {#if bulkError}
        <div class="phase-summary err">{bulkError}</div>
      {/if}

      <div class="modal-actions">
        <Button size="sm" onclick={closeBulkDialog} disabled={bulkBusy}>{bulkBusy ? 'Applying…' : 'Close'}</Button>
      </div>
    {/if}
  </div>
{/if}

{#if lastBulkSummary && !showRoleDialog && !showFirstNameDialog}
  <div class="bulk-flash" role="status">
    <span>{lastBulkSummary}</span>
    {#if lastBulkActionId}
      <Button size="xs" variant="ghost" onclick={undoLastBulk} disabled={undoBusy} loading={undoBusy}>Undo</Button>
    {/if}
    <button type="button" class="bulk-flash-close" onclick={() => (lastBulkSummary = null)} aria-label="Dismiss">×</button>
  </div>
{/if}

<Drawer open={showEmailDrawer} title="Email selected members" width="620px" onClose={() => (showEmailDrawer = false)}>
  <p class="muted small">Sends a personalised email to <strong>{selectedIds.size}</strong> recipient{selectedIds.size === 1 ? '' : 's'}. Merge tokens available: <code>&#123;&#123;first_name&#125;&#125;</code>, <code>&#123;&#123;last_name&#125;&#125;</code>, <code>&#123;&#123;email&#125;&#125;</code>, <code>&#123;&#123;job_title&#125;&#125;</code>.</p>
  <form
    id="mail-merge-form"
    method="POST"
    action="?/bulkEmail"
    use:enhance={() => { bulkBusy = true; return async ({ update }) => { await update(); bulkBusy = false } }}
  >
    {#each selectedArr as id}
      <input type="hidden" name="ids" value={id} />
    {/each}
    <FieldGrid cols={1}>
      <Field name="subject" label="Subject" bind:value={mailSubject} required />
    </FieldGrid>
    <div class="mail-body-label">Body</div>
    <textarea
      class="mail-body"
      name="body"
      bind:value={mailBody}
      rows="10"
      placeholder="Hi {{first_name}},&#10;&#10;…"
      required
    ></textarea>
  </form>
  {#snippet footer()}
    <Button variant="ghost" size="sm" onclick={() => (showEmailDrawer = false)} disabled={bulkBusy}>Cancel</Button>
    <Button type="submit" form="mail-merge-form" size="sm" loading={bulkBusy} disabled={bulkBusy || !mailSubject.trim() || !mailBody.trim()}>
      Send to {selectedIds.size}
    </Button>
  {/snippet}
</Drawer>

<style>
  .create-wrap {
    margin-bottom: var(--space-6);
  }

  .bulk-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: 10px 14px;
    margin-bottom: var(--space-3);
    background: color-mix(in srgb, var(--accent) 10%, var(--surface));
    border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--border));
    border-radius: var(--radius-md);
    position: sticky;
    top: var(--topnav-height, 0);
    z-index: 20;
    box-shadow: 0 2px 10px rgba(0,0,0,0.04);
  }

  .plain-label {
    display: block;
    font-size: 13px;
    color: var(--muted);
    margin: 12px 0 8px;
  }
  .plain-input {
    display: block;
    width: 100%;
    margin-top: 6px;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    font-size: 14px;
    font-family: inherit;
  }
  .plain-input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent);
  }

  .phase-list {
    list-style: none;
    margin: 14px 0 10px;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .phase {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
    padding: 6px 10px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--surface-2) 60%, transparent);
    transition: background 160ms ease;
  }
  .phase-icon {
    display: inline-flex;
    width: 18px;
    height: 18px;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
    background: var(--surface-3);
    color: var(--muted);
    flex: 0 0 auto;
  }
  .phase-label {
    flex: 0 0 auto;
    color: var(--muted);
  }
  .phase-detail {
    color: var(--muted);
    font-size: 12px;
    margin-left: auto;
    font-variant-numeric: tabular-nums;
  }
  .phase-active {
    background: color-mix(in srgb, var(--accent) 10%, var(--surface));
  }
  .phase-active .phase-icon {
    background: var(--accent);
    color: white;
  }
  .phase-active .phase-label { color: var(--fg); font-weight: 600; }
  .phase-done .phase-icon {
    background: color-mix(in srgb, var(--accent) 85%, #000);
    color: white;
  }
  .phase-done .phase-label { color: var(--fg); }
  .phase-error .phase-icon { background: #c0392b; color: white; }
  .phase-error .phase-label { color: #c0392b; font-weight: 600; }
  .phase-skipped .phase-icon { background: var(--surface-3); color: var(--muted); }

  .spin {
    display: inline-block;
    width: 10px; height: 10px;
    border: 2px solid rgba(255,255,255,0.4);
    border-top-color: white;
    border-radius: 999px;
    animation: phase-spin 720ms linear infinite;
  }
  @keyframes phase-spin { to { transform: rotate(360deg); } }

  .phase-summary {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 8px;
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 13px;
  }
  .phase-summary.ok {
    background: color-mix(in srgb, var(--accent) 14%, var(--surface));
    border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
  }
  .phase-summary.err {
    background: color-mix(in srgb, #c0392b 10%, var(--surface));
    border: 1px solid color-mix(in srgb, #c0392b 40%, var(--border));
    color: #c0392b;
  }

  .bulk-flash {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 0 0 var(--space-3);
    padding: 10px 14px;
    background: color-mix(in srgb, var(--accent) 14%, var(--surface));
    border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
    border-radius: var(--radius-md);
    font-size: 13px;
  }
  .bulk-flash-close {
    margin-left: auto;
    background: transparent;
    border: none;
    font-size: 18px;
    line-height: 1;
    color: var(--muted);
    cursor: pointer;
    padding: 2px 6px;
  }
  .bulk-flash-close:hover { color: var(--fg); }
  .bulk-count {
    display: flex;
    align-items: center;
    gap: 14px;
    font-size: var(--text-sm);
    color: var(--text);
  }
  .bulk-count strong { font-weight: var(--weight-bold); color: var(--accent); }
  .bulk-link {
    background: none;
    border: none;
    color: var(--accent);
    font-size: var(--text-sm);
    cursor: pointer;
    padding: 0;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .bulk-actions {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    flex-wrap: wrap;
  }

  .name-cell {
    display: flex;
    align-items: center;
    gap: 10px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .row-check {
    width: 15px;
    height: 15px;
    cursor: pointer;
    accent-color: var(--accent);
    flex-shrink: 0;
  }

  .modal-backdrop {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.35);
    z-index: 100;
  }
  .modal {
    position: fixed;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    background: var(--surface-raised, #fff);
    padding: var(--space-5);
    border-radius: var(--radius-lg, 12px);
    box-shadow: 0 12px 40px rgba(0,0,0,0.18);
    z-index: 101;
    width: min(440px, 90vw);
  }
  .modal h3 { margin: 0 0 var(--space-2); }
  .modal .small { font-size: var(--text-sm); margin-bottom: var(--space-4); }
  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-4);
  }

  .mail-body-label {
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--label-color);
    margin: var(--space-3) 0 6px;
  }
  .mail-body {
    width: 100%;
    font-family: inherit;
    font-size: var(--text-sm);
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    resize: vertical;
    min-height: 180px;
  }
  .mail-body:focus {
    outline: none;
    border-color: var(--accent);
  }

  .muted { color: var(--text-muted); }
  .small { font-size: var(--text-sm); }
  .name {
    font-weight: var(--weight-medium);
    color: var(--text);
  }
  .user-dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    margin-left: 6px;
    border-radius: 999px;
    background: var(--accent);
    vertical-align: middle;
  }
  .date { font-size: var(--text-sm); color: var(--text-muted); white-space: nowrap; }
  .date-time { font-family: var(--font-mono); font-size: var(--text-xs); color: var(--text-subtle); }

  .action-primary { margin-right: auto; }

  .section-title {
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    letter-spacing: var(--tracking-wide, 0.08em);
    text-transform: uppercase;
    color: var(--label-color);
    margin: var(--space-4) 0 var(--space-2);
  }
  .section-title:first-of-type { margin-top: 0; }

  @media (max-width: 640px) { .hide-sm { display: none; } }
  @media (max-width: 900px) { .hide-md { display: none; } }
</style>
