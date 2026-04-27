<script lang="ts">
  import { page } from '$app/stores'
  import { goto } from '$app/navigation'
  import { enhance } from '$app/forms'
  import { permStore, canDo } from '$lib/stores/permissions'
  import {
    Button,
    PageHead,
    Toast,
    Field,
    FieldGrid,
    Select,
    Badge,
    SubmitButton,
    RecordLive,
    RecordHistory, ErrorBanner
  } from '$lib/components/ui'
  import { fmtMoneyWithCurrency } from '$lib/utils/money'

  type Person = {
    id: string
    first_name: string
    last_name: string
    email: string
    phone: string | null
    job_title: string | null
    user_id: string | null
    created_at: string
    id_number: string | null
    wsm_id: string | null
    organisation_id: string | null
    department: string | null
    status: 'active' | 'inactive' | 'offboarded'
    started_at: string | null
    onboarded_at: string | null
    offboarded_at: string | null
    external_accounting_customer_id: string | null
  }

  type Subscription = {
    id: string
    status: string
    base_rate: number | null
    currency: string | null
    quantity: number | null
    started_at: string | null
    ended_at: string | null
    item_id: string
    organisation_id: string
    items: { name: string } | null
    organisations: { name: string } | null
  }

  let { data, form } = $props()
  const person = $derived(data.person as Person)

  let saving = $state(false)
  let organisations = $state<{ id: string; name: string }[]>([])
  let subscriptions = $state<Subscription[]>([])

  $effect(() => {
    Promise.resolve(data.organisations).then(v => (organisations = v as any))
    Promise.resolve(data.subscriptions).then(v => (subscriptions = v as any))
  })

  let perms = $state({ role: null as string | null, permissions: [] as any, loaded: false })
  permStore.subscribe(v => { perms = v })
  function can(resource: string, action: string = 'read') { return canDo(perms, resource, action) }

  function toDateInput(v: string | null): string {
    if (!v) return ''
    const d = new Date(v)
    if (isNaN(d.getTime())) return ''
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  const TABS = [
    { key: 'properties',   label: 'Properties' },
    { key: 'profile',      label: 'Profile' },
    { key: 'privileges',   label: 'Privileges' },
    { key: 'printing',     label: 'Printing' },
    { key: 'wifi',         label: 'WiFi' },
    { key: 'wallets',      label: 'Wallets' },
    { key: 'credit_cards', label: 'Credit Cards' },
    { key: 'parking',      label: 'Parking' },
    { key: 'crm',          label: 'CRM' }
  ] as const

  const activeTab = $derived(($page.url.searchParams.get('tab') ?? 'properties'))

  function tabHref(key: string): string {
    const u = new URL($page.url)
    u.searchParams.set('tab', key)
    return u.pathname + u.search
  }

  $effect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        const f = document.getElementById('update-form') as HTMLFormElement | null
        if (f) { e.preventDefault(); f.requestSubmit() }
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      const ae = document.activeElement as HTMLElement | null
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT' || ae.isContentEditable)) return
      if (document.querySelector('[role="dialog"]')) return
      const idx = TABS.findIndex(t => t.key === activeTab)
      if (e.key === 'ArrowRight') {
        if (idx >= 0 && idx < TABS.length - 1) {
          e.preventDefault()
          goto(tabHref(TABS[idx + 1].key), { replaceState: true, noScroll: true, keepFocus: true })
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (idx > 0) goto(tabHref(TABS[idx - 1].key), { replaceState: true, noScroll: true, keepFocus: true })
        else goto('/people')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const orgOptions = $derived([
    { value: '', label: 'None' },
    ...organisations.map(o => ({ value: o.id, label: o.name }))
  ])

  const statusOptions = [
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
    { value: 'offboarded', label: 'Offboarded' }
  ]

  const statusTone = (s: string): 'success' | 'warning' | 'default' | 'danger' => {
    if (s === 'active') return 'success'
    if (s === 'inactive') return 'default'
    if (s === 'offboarded') return 'warning'
    return 'default'
  }

  const subStatusTone = (s: string): 'success' | 'warning' | 'default' | 'danger' | 'info' => {
    if (s === 'signed') return 'success'
    if (s === 'draft') return 'default'
    if (s === 'ended') return 'warning'
    return 'info'
  }
</script>

<RecordLive tableName="persons" recordId={person.id} viewerId={data.viewerId ?? null} label="member" />

<PageHead title={`Member: ${person.first_name} ${person.last_name}`} lede={person.email}>
  <Button variant="ghost" size="sm" href="/people">← Back</Button>
  {#if !person.user_id && can('users', 'manage')}
    <SubmitButton
      action="?/inviteUser"
      label="Invite as user"
      pendingLabel="Inviting…"
      variant="secondary"
      size="sm"
      fields={{ email: person.email }}
    />
  {/if}
  {#if can('persons', 'update')}
    <Button type="submit" form="update-form" size="sm" loading={saving}>{saving ? 'Saving…' : 'Save Changes'}</Button>
  {/if}
</PageHead>

<Toast success={form?.success} message={form?.success ? form?.message : undefined} />
{#if form?.error || (form as any)?.actionable}
  <ErrorBanner error={(form as any)?.actionable ?? form?.error} showRaw />
{/if}

<div class="summary">
  <Badge tone={statusTone(person.status)}>{person.status}</Badge>
  {#if person.user_id}
    <Badge tone="info">has user account</Badge>
  {/if}
  {#if person.wsm_id}
    <span class="summary-meta mono">WSM · {person.wsm_id}</span>
  {/if}
  <span class="summary-meta">Created {new Date(person.created_at).toLocaleDateString()}</span>
</div>

<nav class="tabs" aria-label="Member sections">
  {#each TABS as t}
    <a class="tab" class:is-active={activeTab === t.key} href={tabHref(t.key)}>{t.label}</a>
  {/each}
</nav>

<div class="tab-body">
  {#snippet placeholder(title: string, body: string)}
    <div class="placeholder">
      <div class="placeholder-icon">✶</div>
      <div>
        <div class="placeholder-title">{title} — coming soon</div>
        <p class="placeholder-body">{body}</p>
      </div>
    </div>
  {/snippet}

  <form
    method="POST"
    action="?/update"
    id="update-form"
    autocomplete="off"
    use:enhance={() => {
      saving = true
      return async ({ update }) => {
        await update({ reset: false })
        saving = false
      }
    }}
  >
    <!-- ── PROPERTIES ── -->
    <div class="pane" class:is-active={activeTab === 'properties'}>
      <h3 class="section-title">Identity</h3>
      <FieldGrid cols={2}>
        <Field name="first_name" label="First Name" value={person.first_name} required />
        <Field name="last_name"  label="Last Name"  value={person.last_name}  required />
        <Field name="email_display" label="Email (read-only)" type="email" value={person.email} readonly />
        <Field name="phone" label="Phone" value={person.phone ?? ''} />
        <Field name="id_number" label="ID Number" value={person.id_number ?? ''} />
        {#if person.wsm_id}
          <Field name="wsm_id_display" label="WSM ID (read-only)" value={person.wsm_id} readonly />
        {/if}
      </FieldGrid>

      <h3 class="section-title">Affiliation</h3>
      <FieldGrid cols={2}>
        <Field name="job_title" label="Job Title" value={person.job_title ?? ''} />
        <Field name="department" label="Department" value={person.department ?? ''} />
        <Field label="Organisation" full>
          <Select
            name="organisation_id"
            value={person.organisation_id ?? ''}
            placeholder="None"
            options={orgOptions}
          />
        </Field>
      </FieldGrid>

      {#if subscriptions.length > 0}
        <h3 class="section-title">Subscriptions ({subscriptions.length})</h3>
        <div class="subs-table">
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Organisation</th>
                <th>Status</th>
                <th class="num">Qty</th>
                <th class="num">Rate</th>
                <th>Started</th>
                <th>Ended</th>
              </tr>
            </thead>
            <tbody>
              {#each subscriptions as s}
                <tr>
                  <td>{s.items?.name ?? '—'}</td>
                  <td>
                    {#if s.organisation_id}
                      <a href={`/organisations/${s.organisation_id}?tab=subscription`} target="_blank" rel="noopener">{s.organisations?.name ?? '—'}</a>
                    {:else}
                      —
                    {/if}
                  </td>
                  <td><Badge tone={subStatusTone(s.status)}>{s.status}</Badge></td>
                  <td class="num mono">{s.quantity ?? 1}</td>
                  <td class="num mono">{fmtMoneyWithCurrency(s.base_rate, s.currency ?? '')}</td>
                  <td class="mono">{s.started_at ? new Date(s.started_at).toLocaleDateString() : '—'}</td>
                  <td class="mono">{s.ended_at ? new Date(s.ended_at).toLocaleDateString() : '—'}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>

    <!-- ── PROFILE ── -->
    <div class="pane" class:is-active={activeTab === 'profile'}>
      <h3 class="section-title">Lifecycle</h3>
      <FieldGrid cols={2}>
        <Field label="Status">
          <Select name="status" value={person.status ?? 'inactive'} options={statusOptions} />
        </Field>
        <Field name="started_at"    label="Started"    type="date" value={toDateInput(person.started_at)} />
        <Field name="onboarded_at"  label="Onboarded"  type="date" value={toDateInput(person.onboarded_at)} />
        <Field name="offboarded_at" label="Offboarded" type="date" value={toDateInput(person.offboarded_at)} />
      </FieldGrid>

      <h3 class="section-title">External reference</h3>
      <FieldGrid cols={1}>
        <Field
          name="external_accounting_customer_id"
          label="External Accounting Customer ID"
          value={person.external_accounting_customer_id ?? ''}
          placeholder="e.g. Xero contact id"
        />
      </FieldGrid>
    </div>

    <!-- ── PRIVILEGES ── -->
    <div class="pane" class:is-active={activeTab === 'privileges'}>
      <h3 class="section-title">Access & Roles</h3>
      {@render placeholder('Privileges', 'User account, role assignments, and access scopes will live here once the ACL model is wired up. For now this member ' + (person.user_id ? 'has a linked user account.' : 'does not have a user account yet.'))}
    </div>

    <!-- ── PRINTING ── -->
    <div class="pane" class:is-active={activeTab === 'printing'}>
      <h3 class="section-title">Print Quota & Usage</h3>
      {@render placeholder('Printing', 'Print credits, recent jobs, and quota resets will surface here once the print service is integrated.')}
    </div>

    <!-- ── WIFI ── -->
    <div class="pane" class:is-active={activeTab === 'wifi'}>
      <h3 class="section-title">Network Access</h3>
      {@render placeholder('WiFi', 'Network credentials, session history, and device registrations go here once UniFi / network integration is live.')}
    </div>

    <!-- ── WALLETS ── -->
    <div class="pane" class:is-active={activeTab === 'wallets'}>
      <h3 class="section-title">Member Wallets</h3>
      {@render placeholder('Wallets', 'Wallets for this member (separate from organisation wallets) and their recent transactions will surface here.')}
    </div>

    <!-- ── CREDIT CARDS ── -->
    <div class="pane" class:is-active={activeTab === 'credit_cards'}>
      <h3 class="section-title">Saved Payment Methods</h3>
      {@render placeholder('Credit Cards', 'Tokenised cards via the payment provider will be listed here, read-only. Adding cards happens through the member portal.')}
    </div>

    <!-- ── PARKING ── -->
    <div class="pane" class:is-active={activeTab === 'parking'}>
      <h3 class="section-title">Parking Access</h3>
      {@render placeholder('Parking', 'Linked number plates, bay allocations, and recent gate events will live here once Admyt / gate integration is connected.')}
    </div>

    <!-- ── CRM ── -->
    <div class="pane" class:is-active={activeTab === 'crm'}>
      <h3 class="section-title">Notes & Activity</h3>
      {@render placeholder('CRM', 'Touchpoints, notes from community managers, email threads, and churn-risk signals will be captured here.')}
    </div>
  </form>

  {#if can('persons', 'delete')}
    <div class="danger-zone">
      <h3 class="section-title">Danger zone</h3>
      <form method="POST" action="?/delete" use:enhance>
        <SubmitButton
          action="?/delete"
          label="Delete member"
          pendingLabel="Deleting…"
          variant="danger"
          size="sm"
          confirm={{
            title: 'Delete member?',
            message: `Permanently delete ${person.first_name} ${person.last_name}? This cannot be undone.`,
            variant: 'danger'
          }}
        />
      </form>
    </div>
  {/if}
</div>

<RecordHistory table="persons" id={person?.id} />

<style>
  .summary {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex-wrap: wrap;
    margin-bottom: var(--space-4);
    font-size: var(--text-sm);
  }
  .summary-meta { color: var(--text-muted); }
  .mono { font-family: var(--font-mono); }

  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    border-bottom: 1px solid var(--border);
    margin-bottom: var(--space-5);
  }
  .tab {
    padding: 10px 18px;
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--text-muted);
    text-decoration: none;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    white-space: nowrap;
  }
  .tab:hover { color: var(--text); }
  .tab.is-active {
    color: var(--accent);
    border-bottom-color: var(--accent);
  }

  @media (max-width: 640px) {
    .summary { flex-wrap: wrap; gap: 8px; }
    .tabs { margin-bottom: var(--space-4); }
    .tab { padding: 10px 12px; }
  }

  .pane { display: none; }
  .pane.is-active { display: block; }

  .section-title {
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    letter-spacing: var(--tracking-wide, 0.08em);
    text-transform: uppercase;
    color: var(--label-color);
    margin: var(--space-5) 0 var(--space-2);
  }
  .section-title:first-of-type { margin-top: 0; }

  .subs-table {
    overflow-x: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    margin-top: var(--space-2);
  }
  .subs-table table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
  }
  .subs-table th, .subs-table td {
    padding: 8px 12px;
    text-align: left;
    border-bottom: 1px solid var(--border);
  }
  .subs-table th {
    background: var(--surface-sunk);
    font-weight: var(--weight-semibold);
    color: var(--text-muted);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    font-size: var(--text-xs);
  }
  .subs-table tbody tr:last-child td { border-bottom: none; }
  .subs-table .num { text-align: right; }
  .subs-table a { color: var(--accent); text-decoration: none; }
  .subs-table a:hover { text-decoration: underline; }

  .danger-zone {
    margin-top: var(--space-6);
    padding-top: var(--space-4);
    border-top: 1px dashed var(--border);
  }

  .placeholder {
    display: flex;
    gap: var(--space-3);
    align-items: flex-start;
    padding: var(--space-4);
    background: var(--surface-sunk);
    border: 1px dashed var(--border);
    border-radius: var(--radius-md);
    color: var(--text-muted);
  }
  .placeholder-icon {
    font-size: 22px;
    color: var(--accent);
    opacity: 0.6;
    line-height: 1;
  }
  .placeholder-title {
    font-weight: var(--weight-semibold);
    color: var(--text);
    font-size: var(--text-sm);
    margin-bottom: 4px;
  }
  .placeholder-body {
    margin: 0;
    font-size: var(--text-sm);
    line-height: 1.5;
  }
</style>
