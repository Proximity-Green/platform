<script lang="ts">
  import { supabase } from '$lib/supabase'
  import { onMount } from 'svelte'
  import { permStore, canDo } from '$lib/stores/permissions'
  import {
    Button,
    PageHead,
    Toast,
    DataTable,
    Copyable,
    SubmitButton,
    Prompt
  } from '$lib/components/ui'
  import type { Column, Filter } from '$lib/components/ui/DataTable.svelte'

  type User = {
    id: string
    email: string
    created_at: string
    email_confirmed_at: string | null
    invited_at: string | null
    last_sign_in_at: string | null
    banned_until: string | null
    app_metadata?: { provider?: string; providers?: string[] }
    user_metadata?: { full_name?: string }
    amr?: { method: string }[]
  }

  let { data, form } = $props()
  let currentUserId = $state<string | null>(null)

  onMount(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    currentUserId = session?.user?.id ?? null
  })

  let perms = $state({ role: null as string | null, permissions: [] as any, loaded: false })
  permStore.subscribe(v => { perms = v })
  function can(resource: string, action: string = 'read') { return canDo(perms, resource, action) }

  function getUserRole(userId: string) {
    const ur = data.userRoles.find((r: any) => r.user_id === userId)
    return ur?.roles?.name ?? null
  }
  function isBanned(u: User) {
    return !!(u.banned_until && new Date(u.banned_until) > new Date())
  }
  function statusOf(u: User): 'active' | 'pending' | 'revoked' {
    if (isBanned(u)) return 'revoked'
    if (u.email_confirmed_at) return 'active'
    return 'pending'
  }

  let impersonateTarget = $state<User | null>(null)

  async function doImpersonate(reason: string) {
    const target = impersonateTarget
    impersonateTarget = null
    if (!target) return
    const res = await fetch('/api/impersonate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start', adminUserId: currentUserId, targetUserId: target.id, reason })
    })
    const result = await res.json()
    if (result.error) alert(result.error)
    else window.location.href = '/people'
  }

  const columns: Column<User>[] = [
    { key: 'email', label: 'User', sortable: true, width: '20%', get: u => u.email },
    { key: 'provider', label: 'Auth', width: '8%' },
    { key: 'role', label: 'Role', width: '15%', get: u => getUserRole(u.id) ?? '' },
    { key: 'status', label: 'Status', sortable: true, width: '7%', get: u => statusOf(u), hideBelow: 'sm' },
    { key: 'source', label: 'Source', sortable: true, width: '9%', get: u => u.invited_at ? 'Invited' : 'Self-registered', hideBelow: 'md' },
    { key: 'created_at', label: 'Joined', sortable: true, width: '8%', date: true, hideBelow: 'md' },
    { key: 'last_sign_in_at', label: 'Last sign-in', sortable: true, width: '8%', date: true, hideBelow: 'md' }
  ]

  const filters: Filter<User>[] = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active', test: u => statusOf(u) === 'active' },
    { key: 'pending', label: 'Pending', test: u => statusOf(u) === 'pending' },
    { key: 'revoked', label: 'Revoked', test: u => statusOf(u) === 'revoked' },
    { key: 'invited', label: 'Invited', test: u => !!u.invited_at },
    { key: 'self', label: 'Self-registered', test: u => !u.invited_at },
    { key: 'no_role', label: 'No role', test: u => !getUserRole(u.id) }
  ]
</script>

<PageHead
  title="Users"
  lede="Auth accounts with sign-in access. To add a new user, invite them from the Members page."
/>

<Toast error={form?.error} success={form?.success} message={form?.message} />

<DataTable
  data={data.users as User[]}
  {columns}
  {filters}
  table="users"
  searchFields={['email', 'user_metadata.full_name']}
  searchPlaceholder="Search email or name…"
  csvFilename="users"
  empty="No users yet."
  timesToggle
>
  {#snippet row(user, ctx)}
    {@const banned = isBanned(user)}
    {@const providers = user.app_metadata?.providers ?? []}
    {@const primaryProvider = user.app_metadata?.provider ?? 'email'}
    {@const currentRole = getUserRole(user.id)}
    <td class:banned>
      <Copyable value={user.email}>
        <div class="user-email">{user.email}</div>
      </Copyable>
      {#if user.user_metadata?.full_name}
        <div class="user-name">{user.user_metadata.full_name}</div>
      {/if}
    </td>
    <td class:banned>
      <div class="providers">
        {#if providers.length}
          {#each providers as p}
            <span class="provider" class:google={p === 'google'} class:email={p === 'email'}>{p}</span>
          {/each}
        {:else}
          <span class="provider email">{primaryProvider}</span>
        {/if}
      </div>
    </td>
    <td class:banned>
      {#if can('users', 'manage')}
        <form method="POST" action="?/setRole" class="role-form">
          <input type="hidden" name="user_id" value={user.id} />
          <select name="role_id" onchange={(e) => e.currentTarget.form?.requestSubmit()}>
            <option value="">No role</option>
            {#each data.roles as role}
              <option value={role.id} selected={currentRole === role.name}>{role.name.replace('_', ' ')}</option>
            {/each}
          </select>
        </form>
      {:else}
        <span>{currentRole ?? '—'}</span>
      {/if}
    </td>
    <td class:banned class="hide-sm">
      <span class="status {statusOf(user)}">
        {banned ? 'Revoked' : user.email_confirmed_at ? 'Active' : 'Pending'}
      </span>
    </td>
    <td class:banned class="hide-md">
      <span class="source-badge" class:invited={!!user.invited_at}>
        {user.invited_at ? 'Invited' : 'Self-registered'}
      </span>
    </td>
    <td class:banned class="date hide-md">
      <div>{new Date(user.created_at).toLocaleDateString()}</div>
      {#if ctx.showTimes}
        <div class="date-time">{new Date(user.created_at).toLocaleTimeString()}</div>
      {/if}
    </td>
    <td class:banned class="date hide-md">
      {#if user.last_sign_in_at}
        <div>{new Date(user.last_sign_in_at).toLocaleDateString()}</div>
        {#if ctx.showTimes}
          <div class="date-time">{new Date(user.last_sign_in_at).toLocaleTimeString()}</div>
        {/if}
        {@const lastAmr = user.amr?.[user.amr.length - 1]}
        {#if lastAmr}
          <div class="auth-detail">
            via {lastAmr.method === 'oauth' ? 'Google' : lastAmr.method === 'password' ? 'Email/PW' : lastAmr.method}
          </div>
        {/if}
      {:else}
        <span class="never">Never</span>
      {/if}
    </td>
  {/snippet}

  {#snippet actions(user)}
    {@const banned = isBanned(user)}
    {@const primaryProvider = user.app_metadata?.provider ?? 'email'}
    {#if can('users', 'manage')}
      {#if !user.email_confirmed_at}
        <SubmitButton
          action="?/resend"
          label="Resend"
          pendingLabel="Sending…"
          variant="secondary"
          size="sm"
          fields={{ email: user.email }}
        />
      {:else if primaryProvider === 'email' && !banned}
        <SubmitButton
          action="?/resetPassword"
          label="Reset"
          pendingLabel="Sending…"
          variant="secondary"
          size="sm"
          fields={{ email: user.email }}
        />
      {/if}
      {#if user.id !== currentUserId && user.email_confirmed_at && !banned}
        <Button variant="secondary" size="sm" onclick={() => impersonateTarget = user}>Impersonate</Button>
      {/if}
      {#if banned}
        <SubmitButton
          action="?/restore"
          label="Restore"
          pendingLabel="Restoring…"
          variant="secondary"
          size="sm"
          fields={{ user_id: user.id }}
        />
      {:else}
        <SubmitButton
          action="?/revoke"
          label="Revoke"
          pendingLabel="Revoking…"
          variant="danger"
          size="sm"
          fields={{ user_id: user.id }}
          confirm={{
            title: 'Revoke access?',
            message: `Revoke sign-in access for ${user.email}? They can be restored later.`,
            variant: 'danger'
          }}
        />
      {/if}
      <SubmitButton
        action="?/delete"
        label="Delete"
        pendingLabel="Deleting…"
        variant="danger"
        size="sm"
        fields={{ user_id: user.id }}
        confirm={{
          title: 'Delete user?',
          message: `Permanently delete ${user.email}? This cannot be undone.`,
          variant: 'danger'
        }}
      />
    {/if}
  {/snippet}
</DataTable>

<Prompt
  open={!!impersonateTarget}
  title="Impersonate user"
  message={impersonateTarget ? `You will sign in as ${impersonateTarget.email}. This is logged in the audit trail.` : ''}
  placeholder="Reason (required)"
  confirmLabel="Impersonate"
  required
  onCancel={() => impersonateTarget = null}
  onConfirm={doImpersonate}
/>

<style>
  .user-email { font-weight: var(--weight-medium); color: var(--text); }
  .user-name { font-size: var(--text-xs); color: var(--text-muted); }
  .banned { opacity: 0.5; }

  .providers { display: flex; gap: 4px; flex-wrap: wrap; }
  .provider {
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
    text-transform: uppercase;
    font-weight: var(--weight-semibold);
    letter-spacing: 0.04em;
    background: var(--surface-sunk);
    color: var(--text-muted);
  }
  .provider.google { background: var(--accent-soft); color: var(--accent); }

  .role-form select {
    padding: 4px 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
    background: var(--surface-raised);
    color: var(--text);
    cursor: pointer;
  }
  .status {
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
  }
  .status.active  { background: var(--accent-soft);  color: var(--accent); }
  .status.pending { background: var(--warning-soft, var(--surface-sunk)); color: var(--warning, var(--text-muted)); }
  .status.revoked { background: var(--danger-soft);  color: var(--danger); }

  .source-badge {
    font-size: var(--text-xs);
    color: var(--text-muted);
  }
  .source-badge.invited { color: var(--accent); }

  .date { font-size: var(--text-sm); color: var(--text-muted); white-space: nowrap; }
  .date-time { font-family: var(--font-mono); font-size: var(--text-xs); color: var(--text-subtle); }
  .auth-detail { font-size: var(--text-xs); color: var(--text-subtle); margin-top: 2px; }
  .never { color: var(--warning, var(--text-muted)); font-size: var(--text-xs); }

  @media (max-width: 640px) { .hide-sm { display: none; } }
  @media (max-width: 900px) { .hide-md { display: none; } }
</style>
