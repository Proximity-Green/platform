<script lang="ts">
  import { page } from '$app/state'
</script>

<div class="error-container">
  <div class="error-card">
    <div class="error-code">{page.status}</div>
    {#if page.status === 403}
      <h1>Access Denied</h1>
      <p>{page.error?.message || 'You do not have permission to access this page.'}</p>
      <p class="hint">Your current role does not include the required permissions. Contact an administrator if you need access.</p>
    {:else if page.status === 404}
      <h1>Page Not Found</h1>
      <p>The page you're looking for doesn't exist.</p>
    {:else}
      <h1>Something Went Wrong</h1>
      <p>{page.error?.message || 'An unexpected error occurred.'}</p>
    {/if}
    <a href="/people" class="back-btn">Back to Dashboard</a>
  </div>
</div>

<style>
  .error-container { display: flex; justify-content: center; align-items: center; min-height: 60vh; font-family: system-ui, sans-serif; }
  .error-card { text-align: center; max-width: 480px; padding: 3rem; }
  .error-code { font-size: 4rem; font-weight: 800; color: #c8deca; font-family: monospace; margin-bottom: 0.5rem; }
  h1 { font-size: 1.5rem; color: #0a1f0f; margin-bottom: 0.75rem; }
  p { color: #5a7060; line-height: 1.6; margin-bottom: 0.5rem; }
  .hint { font-size: 0.85rem; color: #c8832a; background: #fdf3e3; padding: 0.75rem 1rem; border-radius: 6px; margin-top: 1rem; }
  .back-btn { display: inline-block; margin-top: 1.5rem; padding: 0.6rem 1.5rem; background: #2d6a35; color: white; border-radius: 6px; text-decoration: none; font-size: 0.9rem; }
  .back-btn:hover { background: #1e4d25; }
</style>
