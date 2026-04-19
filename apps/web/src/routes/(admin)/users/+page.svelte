<script lang="ts">
  import { supabase } from '$lib/supabase'
  import { onMount } from 'svelte'

  let { data, form } = $props()
  let currentUserId = $state<string | null>(null)

  onMount(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    currentUserId = session?.user?.id ?? null
  })

  function getUserRole(userId: string) {
    const ur = data.userRoles.find((r: any) => r.user_id === userId)
    return ur?.roles?.name ?? null
  }

  function getUserRoleId(userId: string) {
    const ur = data.userRoles.find((r: any) => r.user_id === userId)
    return ur?.role_id ?? null
  }

  function getRolePermissions(userId: string) {
    const roleId = getUserRoleId(userId)
    if (!roleId) return []
    return data.permissions.filter((p: any) => p.role_id === roleId)
  }

  async function impersonate(targetUserId: string) {
    const reason = prompt('Reason for impersonation (for audit log):')
    if (reason === null) return

    const res = await fetch('/api/impersonate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'start',
        adminUserId: currentUserId,
        targetUserId,
        reason
      })
    })
    const result = await res.json()
    if (result.error) {
      alert(result.error)
    } else {
      window.location.href = '/people'
    }
  }
</script>

<div class="container">
  <header>
    <h1>Users</h1>
    <p class="hint">To add a new user, first create a Person in the <a href="/people">People</a> page, then invite them from there.</p>
  </header>

  {#if form?.error}
    <div class="error">{form.error}</div>
  {/if}

  {#if form?.success}
    <div class="success">{form.message}</div>
  {/if}

  <table>
    <thead>
      <tr>
        <th>User</th>
        <th>Auth Method</th>
        <th>Role</th>
        <th>Status</th>
        <th>Joined</th>
        <th>Last Sign In</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      {#each data.users as user}
        {@const isBanned = user.banned_until && new Date(user.banned_until) > new Date()}
        {@const providers = user.app_metadata?.providers ?? []}
        {@const primaryProvider = user.app_metadata?.provider ?? 'email'}
        {@const currentRole = getUserRole(user.id)}
        <tr class:banned={isBanned}>
          <td>
            <div class="user-email">{user.email}</div>
            {#if user.user_metadata?.full_name}
              <div class="user-name">{user.user_metadata.full_name}</div>
            {/if}
          </td>
          <td>
            <div class="providers">
              {#each providers as p}
                <span class="provider" class:google={p === 'google'} class:email={p === 'email'}>{p}</span>
              {/each}
              {#if providers.length === 0}
                <span class="provider email">{primaryProvider}</span>
              {/if}
            </div>
          </td>
          <td>
            <form method="POST" action="?/setRole" class="role-form">
              <input type="hidden" name="user_id" value={user.id} />
              <select name="role_id" onchange={(e) => e.currentTarget.form?.requestSubmit()}>
                <option value="">No role</option>
                {#each data.roles as role}
                  <option value={role.id} selected={currentRole === role.name}>{role.name.replace('_', ' ')}</option>
                {/each}
              </select>
            </form>
            {#if currentRole === 'super_admin'}
              <div class="perm-badges"><span class="perm-all">all access</span></div>
            {:else}
              {@const perms = getRolePermissions(user.id)}
              {#if perms.length > 0}
                <div class="perm-badges">
                  {#each perms as p}
                    <span class="perm-badge">{p.resource}:{p.action}</span>
                  {/each}
                </div>
              {:else if currentRole}
                <div class="perm-badges"><span class="perm-none">no permissions</span></div>
              {/if}
            {/if}
          </td>
          <td>
            {#if isBanned}
              <span class="status revoked">Revoked</span>
            {:else if user.email_confirmed_at}
              <span class="status active">Active</span>
            {:else if user.invited_at}
              <span class="status pending">Invited</span>
            {:else}
              <span class="status pending">Pending</span>
            {/if}
          </td>
          <td class="date">
            {new Date(user.created_at).toLocaleDateString()}
            {#if user.invited_at}
              <div class="auth-detail">Invited</div>
            {:else}
              <div class="auth-detail">Self-registered</div>
            {/if}
          </td>
          <td class="date">
            {#if user.last_sign_in_at}
              <div>{new Date(user.last_sign_in_at).toLocaleDateString()}</div>
              <div class="auth-detail">{new Date(user.last_sign_in_at).toLocaleTimeString()}</div>
              {@const lastAmr = user.amr?.[user.amr.length - 1]}
              {#if lastAmr}
                <div class="auth-detail">via {lastAmr.method === 'oauth' ? 'Google' : lastAmr.method === 'password' ? 'Email/Password' : lastAmr.method}</div>
              {/if}
            {:else}
              <span class="never">Never</span>
            {/if}
          </td>
          <td class="actions">
            {#if !user.email_confirmed_at}
              <form method="POST" action="?/resend" style="display:inline">
                <input type="hidden" name="email" value={user.email} />
                <button type="submit" class="resend">Resend</button>
              </form>
            {:else if primaryProvider === 'email' && !isBanned}
              <form method="POST" action="?/resetPassword" style="display:inline">
                <input type="hidden" name="email" value={user.email} />
                <button type="submit" class="resend">Reset PW</button>
              </form>
            {/if}
            {#if isBanned}
              <form method="POST" action="?/restore" style="display:inline">
                <input type="hidden" name="user_id" value={user.id} />
                <button type="submit" class="restore">Restore</button>
              </form>
            {:else}
              <form method="POST" action="?/revoke" style="display:inline">
                <input type="hidden" name="user_id" value={user.id} />
                <button type="submit" class="revoke-btn"
                  onclick={(e) => { if (!confirm('Revoke access for ' + user.email + '?')) e.preventDefault() }}>
                  Revoke
                </button>
              </form>
            {/if}
            {#if user.id !== currentUserId && user.email_confirmed_at && !isBanned}
              <button class="impersonate" onclick={() => impersonate(user.id)}>Impersonate</button>
            {/if}
            <form method="POST" action="?/delete" style="display:inline">
              <input type="hidden" name="user_id" value={user.id} />
              <button type="submit" class="delete"
                onclick={(e) => { if (!confirm('Permanently delete ' + user.email + '? This cannot be undone.')) e.preventDefault() }}>
                Delete
              </button>
            </form>
          </td>
        </tr>
      {:else}
        <tr><td colspan="7" class="empty">No users yet.</td></tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .container { max-width: 1200px; margin: 0 auto; padding: 2rem; font-family: system-ui, sans-serif; }
  header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
  h1 { font-size: 1.5rem; font-weight: 600; color: #0a1f0f; }
  .error { background: #fdecea; color: #c0392b; padding: 0.75rem 1rem; border-radius: 6px; margin-bottom: 1rem; }
  .success { background: #e8f5ea; color: #2d6a35; padding: 0.75rem 1rem; border-radius: 6px; margin-bottom: 1rem; }
  .form-card { background: #f7f4ee; border: 1px solid #c8deca; border-radius: 8px; padding: 1.5rem; margin-bottom: 1.5rem; display: flex; gap: 1rem; align-items: flex-end; }
  label { display: flex; flex-direction: column; font-size: 0.85rem; font-weight: 500; color: #5a7060; flex: 1; }
  input { margin-top: 0.25rem; padding: 0.5rem; border: 1px solid #c8deca; border-radius: 4px; font-size: 0.9rem; }
  button { padding: 0.5rem 1rem; background: #2d6a35; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.85rem; }
  button:hover { background: #1e4d25; }
  .revoke-btn { background: #c8832a; }
  .revoke-btn:hover { background: #a06b1f; }
  .resend { background: #6d3fc8; }
  .resend:hover { background: #5a2db0; }
  .restore { background: #3a5fc8; }
  .restore:hover { background: #2d4a9e; }
  .impersonate { background: #2c3e50; }
  .impersonate:hover { background: #1a252f; }
  .delete { background: #c0392b; }
  .delete:hover { background: #96281b; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; padding: 0.75rem; border-bottom: 2px solid #c8deca; font-size: 0.8rem; color: #5a7060; text-transform: uppercase; letter-spacing: 0.5px; }
  td { padding: 0.75rem; border-bottom: 1px solid #e8f5ea; font-size: 0.9rem; vertical-align: top; }
  tr.banned { opacity: 0.5; }
  .user-email { font-weight: 500; }
  .user-name { font-size: 0.8rem; color: #5a7060; }
  .providers { display: flex; gap: 4px; flex-wrap: wrap; }
  .provider { padding: 2px 8px; border-radius: 3px; font-size: 0.75rem; text-transform: uppercase; font-weight: 600; }
  .provider.google { background: #e8f0fd; color: #3a5fc8; }
  .provider.email { background: #f0ebfd; color: #6d3fc8; }
  .auth-detail { font-size: 0.75rem; color: #5a7060; margin-top: 2px; }
  .role-form { display: inline; }
  .role-form select { padding: 4px 8px; border: 1px solid #c8deca; border-radius: 4px; font-size: 0.8rem; background: white; cursor: pointer; }
  .status { padding: 2px 8px; border-radius: 3px; font-size: 0.75rem; font-weight: 600; }
  .status.active { background: #e8f5ea; color: #2d6a35; }
  .status.pending { background: #fdf3e3; color: #c8832a; }
  .status.revoked { background: #fdecea; color: #c0392b; }
  .date { font-size: 0.85rem; color: #5a7060; }
  .never { color: #c8832a; font-size: 0.8rem; }
  .actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .perm-badges { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 4px; }
  .perm-badge { font-size: 0.65rem; background: #e8f5ea; color: #2d6a35; padding: 1px 5px; border-radius: 3px; font-family: monospace; }
  .perm-all { font-size: 0.65rem; background: #fdecea; color: #c0392b; padding: 1px 5px; border-radius: 3px; font-weight: 600; }
  .perm-none { font-size: 0.65rem; background: #fdf3e3; color: #c8832a; padding: 1px 5px; border-radius: 3px; }
  .hint { font-size: 0.85rem; color: #5a7060; margin: 0; }
  .hint a { color: #2d6a35; }
  .empty { text-align: center; color: #5a7060; padding: 2rem; }
</style>
