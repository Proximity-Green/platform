<script lang="ts">
  import { permStore, canDo } from '$lib/stores/permissions'

  let { data, form } = $props()
  let showNewRole = $state(false)
  let showNewPerm = $state<string | null>(null)
  let perms = $state({ role: null as string | null, permissions: [] as any, loaded: false })

  permStore.subscribe(v => { perms = v })

  function can(resource: string, action: string = 'read') {
    return canDo(perms, resource, action)
  }
</script>

<div class="container">
  <header>
    <h1>Roles & Permissions</h1>
    {#if can('roles', 'manage')}
      <button onclick={() => showNewRole = !showNewRole}>
        {showNewRole ? 'Cancel' : '+ New Role'}
      </button>
    {/if}
  </header>

  {#if form?.error}
    <div class="error">{form.error}</div>
  {/if}
  {#if form?.success}
    <div class="success">{form.message}</div>
  {/if}

  {#if showNewRole}
    <form method="POST" action="?/createRole" class="form-card">
      <label>
        Name
        <input name="name" required placeholder="e.g. location_manager" />
      </label>
      <label>
        Description
        <input name="description" placeholder="What this role can do" />
      </label>
      <button type="submit">Create Role</button>
    </form>
  {/if}

  <div class="roles-grid">
    {#each data.roles as role}
      {@const perms = data.permissions.filter((p) => p.role_id === role.id)}
      {@const userCount = data.roleCounts[role.id] || 0}
      <div class="role-card">
        <div class="role-header">
          <div>
            <h2>{role.name.replace(/_/g, ' ')}</h2>
            {#if role.description}
              <p class="role-desc">{role.description}</p>
            {/if}
            <span class="user-count">{userCount} user{userCount !== 1 ? 's' : ''}</span>
          </div>
          {#if can('roles', 'manage') && userCount === 0 && !['super_admin', 'admin', 'finance', 'member'].includes(role.name)}
            <form method="POST" action="?/deleteRole" style="display:inline">
              <input type="hidden" name="id" value={role.id} />
              <button type="submit" class="delete-sm"
                onclick={(e) => { if (!confirm('Delete role ' + role.name + '?')) e.preventDefault() }}>
                Delete
              </button>
            </form>
          {/if}
        </div>

        <div class="perms-section">
          <h3>Permissions</h3>
          {#if perms.length > 0}
            <div class="perm-list">
              {#each perms as perm}
                <div class="perm-item">
                  <span class="perm-resource">{perm.resource}</span>
                  <span class="perm-action">{perm.action}</span>
                  {#if can('roles', 'manage')}
                  <form method="POST" action="?/removePermission" style="display:inline">
                    <input type="hidden" name="id" value={perm.id} />
                    <button type="submit" class="remove-perm">&times;</button>
                  </form>
                {/if}
                </div>
              {/each}
            </div>
          {:else}
            <p class="no-perms">No permissions defined</p>
          {/if}

          {#if can('roles', 'manage')}
            {#if showNewPerm === role.id}
              <form method="POST" action="?/addPermission" class="perm-form">
                <input type="hidden" name="role_id" value={role.id} />
                <select name="resource" required>
                  <option value="">Resource...</option>
                  <option value="persons">Persons</option>
                  <option value="organisations">Organisations</option>
                  <option value="locations">Locations</option>
                  <option value="subscriptions">Subscriptions</option>
                  <option value="invoices">Invoices</option>
                  <option value="wallets">Wallets</option>
                  <option value="users">Users</option>
                  <option value="roles">Roles</option>
                  <option value="audit_log">Audit Log</option>
                  <option value="settings">Settings</option>
                </select>
                <select name="action" required>
                  <option value="">Action...</option>
                  <option value="read">Read</option>
                  <option value="create">Create</option>
                  <option value="update">Update</option>
                  <option value="delete">Delete</option>
                  <option value="manage">Manage (all)</option>
                </select>
                <button type="submit">Add</button>
                <button type="button" class="cancel-btn" onclick={() => showNewPerm = null}>Cancel</button>
              </form>
            {:else}
              <button class="add-perm" onclick={() => showNewPerm = role.id}>+ Add Permission</button>
            {/if}
          {/if}
        </div>
      </div>
    {/each}
  </div>
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
  .roles-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1rem; }
  .role-card { background: white; border: 1px solid #c8deca; border-radius: 8px; padding: 1.25rem; }
  .role-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem; }
  h2 { font-size: 1.1rem; font-weight: 600; color: #0a1f0f; text-transform: capitalize; margin: 0; }
  .role-desc { font-size: 0.8rem; color: #5a7060; margin: 0.25rem 0; }
  .user-count { font-size: 0.75rem; color: #5a7060; background: #e8f5ea; padding: 2px 6px; border-radius: 3px; }
  .delete-sm { background: #c0392b; padding: 0.25rem 0.5rem; font-size: 0.75rem; }
  .perms-section { border-top: 1px solid #e8f5ea; padding-top: 0.75rem; }
  h3 { font-size: 0.8rem; color: #5a7060; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 0.5rem; }
  .perm-list { display: flex; flex-direction: column; gap: 4px; margin-bottom: 0.5rem; }
  .perm-item { display: flex; align-items: center; gap: 0.5rem; font-size: 0.8rem; }
  .perm-resource { background: #e8f5ea; color: #2d6a35; padding: 2px 6px; border-radius: 3px; font-weight: 500; }
  .perm-action { background: #e8f0fd; color: #3a5fc8; padding: 2px 6px; border-radius: 3px; }
  .remove-perm { background: none; color: #c0392b; border: none; padding: 0; font-size: 1.1rem; cursor: pointer; }
  .no-perms { font-size: 0.8rem; color: #5a7060; margin: 0.5rem 0; }
  .add-perm { background: none; color: #2d6a35; border: 1px dashed #c8deca; padding: 0.35rem 0.75rem; font-size: 0.8rem; width: 100%; margin-top: 0.5rem; }
  .perm-form { display: flex; gap: 0.5rem; margin-top: 0.5rem; flex-wrap: wrap; }
  .perm-form select { padding: 0.35rem; border: 1px solid #c8deca; border-radius: 4px; font-size: 0.8rem; }
  .perm-form button { padding: 0.35rem 0.75rem; font-size: 0.8rem; }
  .cancel-btn { background: #5a7060; }
</style>
