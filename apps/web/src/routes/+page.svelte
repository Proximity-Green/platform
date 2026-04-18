<script lang="ts">
  let { data } = $props()
</script>

{#if data.session}
  <div style="max-width: 600px; margin: 4rem auto; padding: 2rem; font-family: system-ui, sans-serif; text-align: center;">
    <h1 style="color: #2d6a35; font-size: 2rem;">Proximity Green</h1>
    <p style="color: #5a7060; margin: 0.5rem 0;">Signed in as {data.session.user.email}</p>
    <p style="color: #5a7060; margin: 0 0 2rem;">Last sign in: {new Date(data.session.user.last_sign_in_at ?? '').toLocaleString()}</p>
    <nav style="display: flex; flex-direction: column; gap: 0.75rem;">
      <a href="/people" style="padding: 0.75rem; background: #2d6a35; color: white; border-radius: 6px; text-decoration: none;">People</a>
      <a href="/organisations" style="padding: 0.75rem; background: #2d6a35; color: white; border-radius: 6px; text-decoration: none;">Organisations</a>
    </nav>
  </div>
{:else}
  <div style="max-width: 600px; margin: 4rem auto; padding: 2rem; font-family: system-ui, sans-serif; text-align: center;">
    <h1 style="color: #2d6a35; font-size: 2rem;">Proximity Green</h1>
    <p style="color: #5a7060; margin: 1rem 0 2rem;">Workspace Management Platform</p>
    <a href="/login" style="padding: 0.75rem 2rem; background: #2d6a35; color: white; border-radius: 6px; text-decoration: none;">Sign In</a>
  </div>
{/if}
