<script lang="ts">
  import { supabase } from '$lib/supabase'
  import { onMount } from 'svelte'
  import { permStore, canDo } from '$lib/stores/permissions'

  let { form } = $props()
  let session = $state<any>(null)
  let perms = $state({ role: null as string | null, permissions: [] as any, loaded: false })
  let newPassword = $state('')
  let confirmPassword = $state('')
  let message = $state('')
  let error = $state('')
  let provider = $state('')
  let firstName = $state('')
  let lastName = $state('')
  let phone = $state('')
  let loaded = $state(false)

  permStore.subscribe(v => { perms = v })

  onMount(async () => {
    const { data: { session: s } } = await supabase.auth.getSession()
    session = s
    provider = s?.user?.app_metadata?.provider ?? 'email'
    await loadPerson()
    loaded = true
  })

  async function loadPerson() {
    if (!session) return
    // Load from persons table directly
    const { data: person } = await supabase
      .from('persons')
      .select('*')
      .eq('email', session.user.email)
      .is('deleted_at', null)
      .single()

    if (person) {
      firstName = person.first_name ?? ''
      lastName = person.last_name ?? ''
      phone = person.phone ?? ''
    } else {
      // Fall back to session metadata
      const fullName = session.user.user_metadata?.full_name ?? ''
      const parts = fullName.split(' ')
      firstName = parts[0] ?? ''
      lastName = parts.slice(1).join(' ') ?? ''
      phone = session.user.user_metadata?.phone ?? ''
    }
  }

  // Reload after form submission
  $effect(() => {
    if (form?.success && form?.person) {
      firstName = form.person.first_name
      lastName = form.person.last_name
      phone = form.person.phone
    }
  })

  async function updatePassword() {
    error = ''
    message = ''
    if (newPassword.length < 8) {
      error = 'Password must be at least 8 characters'
      return
    }
    if (newPassword !== confirmPassword) {
      error = 'Passwords do not match'
      return
    }
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
    if (updateError) {
      error = updateError.message
    } else {
      message = 'Password updated successfully'
      newPassword = ''
      confirmPassword = ''
    }
  }
</script>

<div class="container">
  {#if session && loaded}
    <h1>Profile</h1>

    <div class="section">
      <h2>Personal Details</h2>
      {#if form?.error}
        <div class="error">{form.error}</div>
      {/if}
      {#if form?.success}
        <div class="success">{form.message}</div>
      {/if}
      <form method="POST" action="?/updateProfile" class="profile-form">
        <input type="hidden" name="user_id" value={session.user.id} />
        <input type="hidden" name="email" value={session.user.email} />
        <div class="form-grid">
          <label>First Name <input name="first_name" bind:value={firstName} required /></label>
          <label>Last Name <input name="last_name" bind:value={lastName} required /></label>
          <label>Phone <input name="phone" bind:value={phone} placeholder="+27..." /></label>
          <label>Email <input value={session.user.email} disabled class="disabled" /></label>
        </div>
        <button type="submit">Save Changes</button>
      </form>
    </div>

    <div class="section">
      <h2>Account Info</h2>
      <div class="detail-grid">
        <div class="detail">
          <span class="label">Auth Provider</span>
          <span class="value"><span class="provider-badge" class:google={provider === 'google'}>{provider}</span></span>
        </div>
        <div class="detail">
          <span class="label">Role</span>
          <span class="value"><span class="role-badge">{perms.role?.replace('_', ' ') ?? 'no role'}</span></span>
        </div>
        <div class="detail">
          <span class="label">Last Sign In</span>
          <span class="value">{new Date(session.user.last_sign_in_at ?? '').toLocaleString()}</span>
        </div>
        <div class="detail">
          <span class="label">Account Created</span>
          <span class="value">{new Date(session.user.created_at).toLocaleString()}</span>
        </div>
        <div class="detail">
          <span class="label">User ID</span>
          <span class="value mono">{session.user.id}</span>
        </div>
      </div>
    </div>

    <div class="section">
      <h2>Permissions</h2>
      {#if perms.permissions === 'all'}
        <div class="perm-badge all">All access (super admin)</div>
      {:else if Array.isArray(perms.permissions) && perms.permissions.length > 0}
        <div class="perm-list">
          {#each perms.permissions as p}
            <span class="perm-badge">{p.resource}:{p.action}</span>
          {/each}
        </div>
      {:else}
        <p class="muted">No permissions assigned</p>
      {/if}
    </div>

    <div class="section">
      <h2>{provider === 'email' ? 'Change Password' : 'Set Password'}</h2>
      {#if provider !== 'email'}
        <p class="muted" style="margin-bottom: 1rem;">Your primary login is via {provider}. You can also set a password for email/password login.</p>
      {/if}
      {#if error}
        <div class="error">{error}</div>
      {/if}
      {#if message}
        <div class="success">{message}</div>
      {/if}
      <form onsubmit={(e) => { e.preventDefault(); updatePassword() }} class="password-form">
        <label>New Password <input type="password" bind:value={newPassword} required minlength="8" placeholder="Minimum 8 characters" /></label>
        <label>Confirm Password <input type="password" bind:value={confirmPassword} required placeholder="Repeat password" /></label>
        <button type="submit">{provider === 'email' ? 'Update Password' : 'Set Password'}</button>
      </form>
    </div>
  {/if}
</div>

<style>
  .container { max-width: 700px; margin: 0 auto; padding: 2rem; font-family: system-ui, sans-serif; }
  h1 { font-size: 1.5rem; font-weight: 600; color: #0a1f0f; margin-bottom: 2rem; }
  .section { background: white; border: 1px solid #c8deca; border-radius: 10px; padding: 1.5rem; margin-bottom: 1.5rem; }
  h2 { font-size: 1rem; font-weight: 600; color: #0a1f0f; margin: 0 0 1rem; }
  .profile-form { max-width: 500px; }
  .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem; }
  .form-grid label { display: flex; flex-direction: column; font-size: 0.85rem; font-weight: 500; color: #5a7060; }
  .form-grid input { margin-top: 0.25rem; padding: 0.5rem; border: 1px solid #c8deca; border-radius: 4px; font-size: 0.9rem; }
  .disabled { background: #f0f0f0; color: #999; cursor: not-allowed; }
  .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
  .detail { display: flex; flex-direction: column; gap: 0.25rem; }
  .label { font-size: 0.75rem; color: #5a7060; text-transform: uppercase; letter-spacing: 0.5px; }
  .value { font-size: 0.9rem; color: #0a1f0f; }
  .mono { font-family: monospace; font-size: 0.8rem; color: #5a7060; }
  .provider-badge { padding: 2px 8px; border-radius: 3px; font-size: 0.75rem; text-transform: uppercase; font-weight: 600; background: #f0ebfd; color: #6d3fc8; }
  .provider-badge.google { background: #e8f0fd; color: #3a5fc8; }
  .role-badge { background: #2d6a35; color: white; padding: 2px 8px; border-radius: 3px; font-size: 0.75rem; text-transform: uppercase; }
  .perm-list { display: flex; flex-wrap: wrap; gap: 4px; }
  .perm-badge { background: #e8f5ea; color: #2d6a35; padding: 3px 8px; border-radius: 3px; font-size: 0.8rem; font-family: monospace; }
  .perm-badge.all { background: #fdecea; color: #c0392b; font-weight: 600; }
  .muted { color: #5a7060; font-size: 0.85rem; }
  .error { background: #fdecea; color: #c0392b; padding: 0.5rem 1rem; border-radius: 4px; margin-bottom: 1rem; font-size: 0.85rem; }
  .success { background: #e8f5ea; color: #2d6a35; padding: 0.5rem 1rem; border-radius: 4px; margin-bottom: 1rem; font-size: 0.85rem; }
  .password-form { display: flex; flex-direction: column; gap: 1rem; max-width: 350px; }
  .password-form label { display: flex; flex-direction: column; font-size: 0.85rem; font-weight: 500; color: #5a7060; }
  .password-form input { margin-top: 0.25rem; padding: 0.5rem; border: 1px solid #c8deca; border-radius: 4px; font-size: 0.9rem; }
  button { padding: 0.5rem 1rem; background: #2d6a35; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.85rem; }
  button:hover { background: #1e4d25; }
</style>
