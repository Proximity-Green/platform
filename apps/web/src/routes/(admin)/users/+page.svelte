<script lang="ts">
  let { data, form } = $props()
  let showInvite = $state(false)
</script>

<div class="container">
  <header>
    <h1>Users</h1>
    <button onclick={() => showInvite = !showInvite}>
      {showInvite ? 'Cancel' : '+ Invite User'}
    </button>
  </header>

  {#if form?.error}
    <div class="error">{form.error}</div>
  {/if}

  {#if form?.success}
    <div class="success">{form.message}</div>
  {/if}

  {#if showInvite}
    <form method="POST" action="?/invite" class="form-card">
      <label>
        Email Address
        <input name="email" type="email" required placeholder="user@example.com" />
      </label>
      <button type="submit">Send Invitation</button>
    </form>
  {/if}

  <table>
    <thead>
      <tr>
        <th>Email</th>
        <th>Provider</th>
        <th>Status</th>
        <th>Created</th>
        <th>Last Sign In</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      {#each data.users as user}
        <tr class:banned={user.banned_until && new Date(user.banned_until) > new Date()}>
          <td>
            <div class="user-email">{user.email}</div>
            {#if user.user_metadata?.full_name}
              <div class="user-name">{user.user_metadata.full_name}</div>
            {/if}
          </td>
          <td>
            <span class="provider">{user.app_metadata?.provider ?? 'email'}</span>
          </td>
          <td>
            {#if user.banned_until && new Date(user.banned_until) > new Date()}
              <span class="status revoked">Revoked</span>
            {:else if user.email_confirmed_at}
              <span class="status active">Active</span>
            {:else}
              <span class="status pending">Pending</span>
            {/if}
          </td>
          <td class="date">{new Date(user.created_at).toLocaleDateString()}</td>
          <td class="date">
            {#if user.last_sign_in_at}
              {new Date(user.last_sign_in_at).toLocaleString()}
            {:else}
              Never
            {/if}
          </td>
          <td class="actions">
            {#if user.banned_until && new Date(user.banned_until) > new Date()}
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
        <tr><td colspan="6" class="empty">No users yet.</td></tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .container { max-width: 1100px; margin: 0 auto; padding: 2rem; font-family: system-ui, sans-serif; }
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
  .restore { background: #3a5fc8; }
  .restore:hover { background: #2d4a9e; }
  .delete { background: #c0392b; }
  .delete:hover { background: #96281b; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; padding: 0.75rem; border-bottom: 2px solid #c8deca; font-size: 0.8rem; color: #5a7060; text-transform: uppercase; letter-spacing: 0.5px; }
  td { padding: 0.75rem; border-bottom: 1px solid #e8f5ea; font-size: 0.9rem; }
  tr.banned { opacity: 0.5; }
  .user-email { font-weight: 500; }
  .user-name { font-size: 0.8rem; color: #5a7060; }
  .provider { background: #e8f5ea; color: #2d6a35; padding: 2px 8px; border-radius: 3px; font-size: 0.75rem; text-transform: uppercase; }
  .status { padding: 2px 8px; border-radius: 3px; font-size: 0.75rem; font-weight: 600; }
  .status.active { background: #e8f5ea; color: #2d6a35; }
  .status.pending { background: #fdf3e3; color: #c8832a; }
  .status.revoked { background: #fdecea; color: #c0392b; }
  .date { font-size: 0.8rem; color: #5a7060; }
  .actions { display: flex; gap: 0.5rem; }
  .empty { text-align: center; color: #5a7060; padding: 2rem; }
</style>
