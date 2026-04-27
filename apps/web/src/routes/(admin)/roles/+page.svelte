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
    Select,
    SubmitButton, ErrorBanner
  } from '$lib/components/ui'
  import type { Column } from '$lib/components/ui/DataTable.svelte'

  type Role = {
    id: string
    name: string
    description: string | null
  }
  type Permission = {
    id: string
    role_id: string
    resource: string
    action: string
  }

  let { data, form } = $props()
  let showNewRole = $state(false)
  let expandedId = $state<string | null>(null)
  let editing = $state<Role | null>(null)
  let saving = $state(false)

  $effect(() => {
    if (form?.success) { showNewRole = false; editing = null }
  })

  let perms = $state({ role: null as string | null, permissions: [] as any, loaded: false })
  permStore.subscribe(v => { perms = v })
  function can(resource: string, action: string = 'read') { return canDo(perms, resource, action) }

  const systemRoles = ['super_admin', 'admin', 'finance', 'member']
  const resources = ['audit_log', 'invoices', 'locations', 'organisations', 'persons', 'roles', 'settings', 'subscriptions', 'system_logs', 'users', 'wallets']
  const actionKinds = ['create', 'delete', 'manage', 'read', 'update']

  function permsFor(roleId: string): Permission[] {
    return (data.permissions as Permission[]).filter(p => p.role_id === roleId)
  }

  const columns: Column<Role>[] = [
    { key: 'name', label: 'Role', sortable: true, width: '20%', get: r => r.name.replace(/_/g, ' ') },
    { key: 'description', label: 'Description', width: '36%', muted: true, render: r => r.description || '—' },
    { key: 'users', label: 'Users', sortable: true, width: '10%', align: 'right', get: r => data.roleCounts[r.id] ?? 0 },
    { key: 'permissions', label: 'Permissions', sortable: true, width: '14%', align: 'right', get: r => permsFor(r.id).length }
  ]
</script>

<PageHead
  title="Roles"
  lede="Roles bundle permissions. Assign a role to a user to grant access."
>
  {#if can('roles', 'manage')}
    <Button size="sm" onclick={() => showNewRole = !showNewRole}>
      {showNewRole ? 'Cancel' : '+ New Role'}
    </Button>
  {/if}
</PageHead>

<Toast success={form?.success} message={form?.success ? form?.message : undefined} />
{#if form?.error || (form as any)?.actionable}
  <ErrorBanner error={(form as any)?.actionable ?? form?.error} showRaw />
{/if}

{#if showNewRole && can('roles', 'manage')}
  <div class="create-wrap">
    <FormCard
      action="?/createRole"
      onSubmit={() => { saving = true }}
      onResult={() => { saving = false }}
    >
      <FieldGrid cols={2}>
        <Field name="name" label="Name" required placeholder="e.g. location_manager" />
        <Field name="description" label="Description" placeholder="What this role can do" />
      </FieldGrid>
      {#snippet actions()}
        <Button type="submit" size="sm" loading={saving}>{saving ? 'Saving…' : 'Create Role'}</Button>
      {/snippet}
    </FormCard>
  </div>
{/if}

<DataTable
  data={data.roles as Role[]}
  {columns}
  table="roles"
  searchFields={['name', 'description']}
  searchPlaceholder="Search roles…"
  csvFilename="roles"
  empty="No roles yet."
  isExpandedRow={(r) => r.id === expandedId}
  isActiveRow={(r) => r.id === expandedId}
  onActivate={(r) => expandedId = expandedId === r.id ? null : r.id}
  onRowClick={(r) => expandedId = expandedId === r.id ? null : r.id}
>
  {#snippet actions(role)}
    {@const userCount = data.roleCounts[role.id] ?? 0}
    {#if can('roles', 'manage')}
      <Button variant="ghost" size="sm" onclick={() => editing = role}>Edit</Button>
    {/if}
    {#if can('roles', 'manage') && userCount === 0 && !systemRoles.includes(role.name)}
      <SubmitButton
        action="?/deleteRole"
        label="Delete"
        pendingLabel="Deleting…"
        variant="danger"
        size="sm"
        fields={{ id: role.id }}
        confirm={{
          title: 'Delete role?',
          message: `Permanently delete ${role.name}?`,
          variant: 'danger'
        }}
      />
    {/if}
  {/snippet}

  {#snippet expanded(role)}
    {@const rolePerms = permsFor(role.id)}
    {@const roleUsers = data.usersByRole?.[role.id] ?? []}
    <div class="exp">
      <div class="exp-section">
        <h4 class="exp-title">Permissions</h4>
        {#if rolePerms.length}
          <div class="perm-list">
            {#each rolePerms as perm}
              <div class="perm-item">
                <span class="perm-action">{perm.action}</span>
                <span class="perm-resource">{perm.resource}</span>
                {#if can('roles', 'manage')}
                  <SubmitButton
                    action="?/removePermission"
                    label="×"
                    pendingLabel="…"
                    variant="ghost"
                    size="sm"
                    fields={{ id: perm.id }}
                  />
                {/if}
              </div>
            {/each}
          </div>
        {:else}
          <p class="no-perms">No permissions defined</p>
        {/if}

        {#if can('roles', 'manage')}
          <form
            method="POST"
            action="?/addPermission"
            class="perm-form"
            use:enhance={() => async ({ update, formElement }) => {
              await update({ reset: false })
              formElement.reset()
            }}
          >
            <input type="hidden" name="role_id" value={role.id} />
            <Select name="resource" options={resources} placeholder="Resource…" required size="sm" width="180px" />
            <Select name="action" options={actionKinds} placeholder="Action…" required size="sm" width="140px" />
            <Button type="submit" size="sm" variant="secondary">+ Add Permission</Button>
          </form>
        {/if}
      </div>

      <div class="exp-section">
        <h4 class="exp-title">Users ({roleUsers.length})</h4>
        {#if roleUsers.length === 0}
          <p class="no-perms">No users assigned to this role.</p>
        {:else if roleUsers.length > 100}
          <p class="no-perms">
            {roleUsers.length} users — too many to list.
            <a href="/users?q={role.name}">View in Users</a>
          </p>
        {:else}
          <div class="user-list">
            {#each roleUsers as u}
              <div class="user-chip">
                <a class="user-chip-link" href="/users?q={encodeURIComponent(u.email)}">
                  {#if u.name}<span class="user-name">{u.name}</span>{/if}
                  <span class="user-email">{u.email}</span>
                </a>
                {#if can('roles', 'manage')}
                  <SubmitButton
                    action="?/detachUser"
                    label="×"
                    pendingLabel="…"
                    variant="ghost"
                    size="sm"
                    fields={{ user_id: u.id, role_id: role.id }}
                    confirm={{
                      title: 'Remove user from role?',
                      message: `Detach ${u.email} from ${role.name}?`
                    }}
                  />
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {/snippet}
</DataTable>

<Drawer open={!!editing} title="Edit Role" formId="edit-role-form" onClose={() => editing = null}>
  {#if editing}
    {@const isSystem = systemRoles.includes(editing.name)}
    <form
      method="POST"
      action="?/updateRole"
      id="edit-role-form"
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
      <FieldGrid cols={1}>
        <Field
          name="name"
          label="Name"
          value={editing.name}
          required
          readonly={isSystem}
        />
        <Field
          name="description"
          label="Description"
          value={editing.description ?? ''}
        />
      </FieldGrid>
      {#if isSystem}
        <p class="hint">System role names can't be changed — they're referenced by code.</p>
      {/if}
    </form>
  {/if}
  {#snippet footer()}
    <Button variant="ghost" size="sm" onclick={() => editing = null} disabled={saving}>Cancel</Button>
    <Button type="submit" form="edit-role-form" size="sm" loading={saving}>{saving ? 'Saving…' : 'Save'}</Button>
  {/snippet}
</Drawer>

<style>
  .create-wrap { margin-bottom: var(--space-6); }
  .hint {
    margin-top: var(--space-3);
    font-size: var(--text-xs);
    color: var(--text-muted);
  }

  .exp {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }
  .exp-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .exp-title {
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    letter-spacing: var(--label-letter-spacing, 0.1em);
    text-transform: uppercase;
    color: var(--label-color);
    margin: 0;
  }
  .perm-list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .perm-item {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 4px 12px;
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: var(--radius-pill);
    font-size: var(--text-xs);
    min-width: 180px;
  }
  .user-chip { position: relative; }
  .perm-item :global(form),
  .user-chip :global(form) {
    position: absolute;
    right: 4px;
    top: 50%;
    transform: translateY(-50%);
  }
  .perm-item :global(form button),
  .user-chip :global(form button) {
    opacity: 0;
    transition: opacity var(--motion-fast) var(--ease-out);
  }
  .perm-item:hover :global(form button),
  .user-chip:hover :global(form button),
  .perm-item:focus-within :global(form button),
  .user-chip:focus-within :global(form button) {
    opacity: 1;
  }
  .perm-action {
    color: var(--text);
    font-family: var(--font-mono);
    padding: 1px 6px;
    border-radius: var(--radius-sm);
    background: var(--surface-sunk, var(--surface-hover));
  }
  .perm-resource {
    color: var(--accent);
    font-weight: var(--weight-semibold);
  }
  .no-perms {
    font-size: var(--text-sm);
    color: var(--text-muted);
    margin: 0;
  }

  .perm-form {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    flex-wrap: wrap;
  }

  .user-list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .user-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: 4px 4px 4px 12px;
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    font-size: var(--text-xs);
    color: var(--text);
    transition: border-color var(--motion-fast) var(--ease-out);
  }
  .user-chip:hover {
    border-color: var(--accent);
    background: var(--surface-hover);
  }
  .user-chip-link {
    display: inline-flex;
    flex-direction: column;
    gap: 2px;
    color: inherit;
    text-decoration: none;
  }
  .user-name {
    font-weight: var(--weight-medium);
    color: var(--text);
  }
  .user-email {
    color: var(--text-muted);
    font-family: var(--font-mono);
  }
</style>
