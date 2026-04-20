<script lang="ts">
  import { permStore, canDo } from '$lib/stores/permissions'
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
    Copyable,
    SubmitButton
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
  }

  let { data, form } = $props()
  let showCreate = $state(false)
  let editing = $state<Person | null>(null)
  let saving = $state(false)

  $effect(() => {
    if (form?.success) { editing = null; showCreate = false }
  })

  let perms = $state({ role: null as string | null, permissions: [] as any, loaded: false })
  permStore.subscribe(v => { perms = v })
  function can(resource: string, action: string = 'read') { return canDo(perms, resource, action) }

  const columns: Column<Person>[] = [
    { key: 'name', label: 'Name', sortable: true, width: '20%', get: p => `${p.first_name} ${p.last_name}` },
    { key: 'email', label: 'Email', sortable: true, width: '24%', ellipsis: true, muted: true },
    { key: 'phone', label: 'Phone', width: '13%', mono: true, muted: true, hideBelow: 'md' },
    { key: 'job_title', label: 'Job Title', sortable: true, width: '15%', muted: true, hideBelow: 'md' },
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
  isActiveRow={(p) => p.id === editing?.id}
  onActivate={(p) => editing = p}
>
  {#snippet row(person, ctx)}
    <td class="name-cell">
      <Copyable value={`${person.first_name} ${person.last_name}`}>
        <span class="name">{person.first_name} {person.last_name}</span>
        {#if person.user_id}<span class="user-dot" title="Has user account"></span>{/if}
      </Copyable>
    </td>
    <td class="muted">
      <Copyable value={person.email} ellipsis />
    </td>
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
  {#snippet actions(person)}
    {#if !person.user_id && can('users', 'manage')}
      <div class="action-primary">
        <SubmitButton
          action="?/inviteUser"
          label="Invite"
          pendingLabel="Inviting…"
          variant="secondary"
          fields={{ email: person.email, person_id: person.id }}
        />
      </div>
    {/if}
    {#if can('persons', 'update')}
      <Button variant="ghost" size="sm" onclick={() => editing = person}>Edit</Button>
    {/if}
    {#if can('persons', 'delete')}
      <SubmitButton
        action="?/delete"
        label="Delete"
        pendingLabel="Deleting…"
        variant="danger"
        size="sm"
        fields={{ id: person.id }}
        confirm={{
          title: 'Delete member?',
          message: `Permanently delete ${person.first_name} ${person.last_name}? This cannot be undone.`,
          variant: 'danger'
        }}
      />
    {/if}
  {/snippet}
</DataTable>

<Drawer open={!!editing} title="Edit Member" formId="edit-form" onClose={() => editing = null}>
  {#if editing}
    <form
      method="POST"
      action="?/update"
      id="edit-form"
      autocomplete="off"
      use:enhance={() => {
        saving = true
        return async ({ update }) => {
          await update({ reset: false })
          saving = false
        }
      }}
    >
      <input type="hidden" name="id" value={editing.id} />
      <input type="hidden" name="email" value={editing.email} />
      <FieldGrid cols={2}>
        <Field name="first_name" label="First Name" value={editing.first_name} required />
        <Field name="last_name" label="Last Name" value={editing.last_name} required />
        <Field name="email_display" label="Email (read-only)" type="email" value={editing.email} readonly />
        <Field name="phone" label="Phone" value={editing.phone ?? ''} />
        <Field name="job_title" label="Job Title" value={editing.job_title ?? ''} full />
      </FieldGrid>
    </form>
  {/if}
  {#snippet footer()}
    <Button variant="ghost" size="sm" onclick={() => editing = null} disabled={saving}>Cancel</Button>
    <Button type="submit" form="edit-form" size="sm" loading={saving}>{saving ? 'Saving…' : 'Save'}</Button>
  {/snippet}
</Drawer>

<style>
  .create-wrap {
    margin-bottom: var(--space-6);
  }
  .name-cell {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
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

  @media (max-width: 640px) { .hide-sm { display: none; } }
  @media (max-width: 900px) { .hide-md { display: none; } }
</style>
