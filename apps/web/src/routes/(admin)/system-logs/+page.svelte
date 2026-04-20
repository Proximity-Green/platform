<script lang="ts">
  let { data } = $props()

  const levelColors: Record<string, string> = {
    success: 'lvl-success',
    info: 'lvl-info',
    warning: 'lvl-warning',
    error: 'lvl-error'
  }

  const categoryIcons: Record<string, string> = {
    email: 'email',
    auth: 'auth',
    system: 'system',
    import: 'import',
    integration: 'integration',
    billing: 'billing'
  }

  function timeAgo(date: string): string {
    const diff = Date.now() - new Date(date).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    if (days < 30) return `${days}d ago`
    return new Date(date).toLocaleDateString()
  }

  let expandedId = $state<string | null>(null)
</script>

<div class="container">
  <header>
    <div>
      <h1>System Logs</h1>
      <p class="subtitle">{data.total} entries</p>
    </div>
  </header>

  <div class="stats">
    <div class="stat"><span class="stat-num">{data.counts.total}</span><span class="stat-label">Total</span></div>
    <div class="stat"><span class="stat-num email">{data.counts.email}</span><span class="stat-label">Email</span></div>
    <div class="stat"><span class="stat-num auth">{data.counts.auth}</span><span class="stat-label">Auth</span></div>
    <div class="stat"><span class="stat-num system">{data.counts.system}</span><span class="stat-label">System</span></div>
    <div class="stat"><span class="stat-num warning">{data.counts.warning}</span><span class="stat-label">Warnings</span></div>
    <div class="stat"><span class="stat-num error">{data.counts.error}</span><span class="stat-label">Errors</span></div>
  </div>

  <div class="filters">
    <form method="GET" class="filter-form">
      <select name="category" onchange={(e) => e.currentTarget.form?.submit()}>
        <option value="">All categories</option>
        <option value="email" selected={data.filterCategory === 'email'}>Email</option>
        <option value="auth" selected={data.filterCategory === 'auth'}>Auth</option>
        <option value="system" selected={data.filterCategory === 'system'}>System</option>
        <option value="import" selected={data.filterCategory === 'import'}>Import</option>
        <option value="integration" selected={data.filterCategory === 'integration'}>Integration</option>
        <option value="billing" selected={data.filterCategory === 'billing'}>Billing</option>
      </select>
      <select name="level" onchange={(e) => e.currentTarget.form?.submit()}>
        <option value="">All levels</option>
        <option value="success" selected={data.filterLevel === 'success'}>Success</option>
        <option value="info" selected={data.filterLevel === 'info'}>Info</option>
        <option value="warning" selected={data.filterLevel === 'warning'}>Warning</option>
        <option value="error" selected={data.filterLevel === 'error'}>Error</option>
      </select>
      {#if data.filterCategory || data.filterLevel}
        <a href="/system-logs" class="clear">Clear</a>
      {/if}
    </form>
  </div>

  <div class="log-list">
    {#each data.entries as entry (entry.id)}
      <div class="log-entry" onclick={() => expandedId = expandedId === entry.id ? null : entry.id}>
        <div class="log-main">
          <span class="level-dot {levelColors[entry.level]}"></span>
          <span class="category-badge">{entry.category}</span>
          {#if entry.details?.source}
            <span class="source-badge" class:src-trigger={entry.details.source === 'trigger'} class:src-mailgun={entry.details.source === 'mailgun'} class:src-supabase={entry.details.source === 'supabase'} class:src-app={entry.details.source === 'app'}>{entry.details.source}</span>
          {/if}
          {#if entry.details?.via}
            <span class="via-label">via</span>
            <span class="source-badge" class:src-trigger={entry.details.via === 'trigger'} class:src-mailgun={entry.details.via === 'mailgun'} class:src-supabase={entry.details.via === 'supabase'} class:src-app={entry.details.via === 'app'}>{entry.details.via}</span>
          {/if}
          {#if entry.details?.mailgun_status}
            <span class="status-tag" class:tag-delivered={entry.details.mailgun_status === 'delivered'} class:tag-accepted={entry.details.mailgun_status === 'accepted'} class:tag-failed={entry.details.mailgun_status === 'failed' || entry.details.mailgun_status === 'bounced'}>{entry.details.mailgun_status}</span>
          {/if}
          {#if entry.details?.trigger_status}
            <span class="status-tag tag-accepted">{entry.details.trigger_status}</span>
          {/if}
          <span class="log-message">{entry.message}</span>
          <span class="log-user">{entry.created_by_email}</span>
          <span class="log-time" title={new Date(entry.created_at).toLocaleString()}>{timeAgo(entry.created_at)}</span>
        </div>
        {#if expandedId === entry.id && entry.details}
          <div class="log-details">
            {#each Object.entries(entry.details) as [key, val]}
              <div class="detail-row">
                <span class="detail-key">{key}:</span>
                {#if typeof val === 'string' && val.startsWith('http')}
                  <a href={val} target="_blank" class="detail-link">{val}</a>
                {:else if key === 'mailgun_status' || key === 'trigger_status'}
                  <span class="status-tag" class:tag-delivered={val === 'delivered'} class:tag-accepted={val === 'accepted' || val === 'triggered'} class:tag-failed={val === 'failed' || val === 'bounced' || val === 'rejected'}>{val}</span>
                {:else}
                  <span class="detail-val">{val}</span>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {:else}
      <div class="empty">No system logs yet. Actions like invites, revocations, and emails will appear here.</div>
    {/each}
  </div>

  {#if data.total > data.pageSize}
    <div class="pagination">
      <span>Page {data.page + 1} of {Math.ceil(data.total / data.pageSize)}</span>
      <div class="page-btns">
        {#if data.page > 0}
          <a href="/system-logs?page={data.page - 1}&category={data.filterCategory}&level={data.filterLevel}">Prev</a>
        {/if}
        {#if (data.page + 1) * data.pageSize < data.total}
          <a href="/system-logs?page={data.page + 1}&category={data.filterCategory}&level={data.filterLevel}">Next</a>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .container { max-width: 1100px; margin: 0 auto; padding: 2rem; font-family: system-ui, sans-serif; }
  header { margin-bottom: 1.5rem; }
  h1 { font-size: 1.5rem; font-weight: 600; color: #0a1f0f; margin: 0; }
  .subtitle { font-size: 0.85rem; color: #5a7060; margin: 0.25rem 0 0; }
  .stats { display: flex; gap: 1rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
  .stat { background: white; border: 1px solid #c8deca; border-radius: 8px; padding: 0.75rem 1.25rem; text-align: center; min-width: 80px; }
  .stat-num { display: block; font-size: 1.5rem; font-weight: 700; color: #0a1f0f; }
  .stat-num.email { color: #3a5fc8; }
  .stat-num.auth { color: #6d3fc8; }
  .stat-num.system { color: #2d6a35; }
  .stat-num.warning { color: #c8832a; }
  .stat-num.error { color: #c0392b; }
  .stat-label { font-size: 0.7rem; color: #5a7060; text-transform: uppercase; letter-spacing: 0.5px; }
  .filters { margin-bottom: 1rem; }
  .filter-form { display: flex; gap: 0.5rem; align-items: center; }
  .filter-form select { padding: 0.4rem 0.75rem; border: 1px solid #c8deca; border-radius: 4px; font-size: 0.85rem; background: white; }
  .clear { font-size: 0.8rem; color: #5a7060; }
  .log-list { display: flex; flex-direction: column; gap: 2px; }
  .log-entry { background: white; border: 1px solid #e8f5ea; border-radius: 6px; cursor: pointer; }
  .log-entry:hover { border-color: #c8deca; }
  .log-main { display: flex; align-items: center; gap: 0.75rem; padding: 0.6rem 1rem; font-size: 0.85rem; }
  .level-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .lvl-success { background: #2d6a35; }
  .lvl-info { background: #3a5fc8; }
  .lvl-warning { background: #c8832a; }
  .lvl-error { background: #c0392b; }
  .category-badge { font-size: 0.7rem; font-weight: 600; text-transform: uppercase; background: #f7f4ee; color: #5a7060; padding: 2px 6px; border-radius: 3px; flex-shrink: 0; }
  .source-badge { font-size: 0.6rem; font-weight: 600; text-transform: uppercase; padding: 1px 5px; border-radius: 3px; flex-shrink: 0; }
  .src-trigger { background: #f0ebfd; color: #6d3fc8; }
  .src-mailgun { background: #fdf3e3; color: #c8832a; }
  .src-supabase { background: #e8f0fd; color: #3a5fc8; }
  .src-app { background: #e8f5ea; color: #2d6a35; }
  .via-label { font-size: 0.55rem; color: #5a7060; }
  .log-message { flex: 1; color: #0a1f0f; }
  .log-user { font-size: 0.75rem; color: #5a7060; flex-shrink: 0; }
  .log-time { font-size: 0.75rem; color: #5a7060; flex-shrink: 0; min-width: 60px; text-align: right; }
  .log-details { padding: 0.5rem 1rem 0.75rem 2.5rem; background: #fafcfa; border-top: 1px solid #e8f5ea; }
  .detail-row { font-size: 0.8rem; display: flex; gap: 0.5rem; padding: 0.15rem 0; }
  .detail-key { color: #5a7060; font-weight: 500; min-width: 100px; }
  .detail-val { color: #0a1f0f; font-family: monospace; font-size: 0.75rem; }
  .detail-link { color: #3a5fc8; font-family: monospace; font-size: 0.75rem; text-decoration: none; word-break: break-all; }
  .detail-link:hover { text-decoration: underline; }
  .status-tag { padding: 2px 8px; border-radius: 3px; font-size: 0.7rem; font-weight: 600; text-transform: uppercase; }
  .tag-delivered { background: #e8f5ea; color: #2d6a35; }
  .tag-accepted { background: #e8f0fd; color: #3a5fc8; }
  .tag-failed { background: #fdecea; color: #c0392b; }
  .empty { text-align: center; color: #5a7060; padding: 3rem; background: white; border: 1px solid #e8f5ea; border-radius: 6px; }
  .pagination { display: flex; justify-content: space-between; align-items: center; margin-top: 1rem; font-size: 0.85rem; color: #5a7060; }
  .page-btns { display: flex; gap: 0.5rem; }
  .page-btns a { padding: 0.4rem 0.75rem; border: 1px solid #c8deca; border-radius: 4px; text-decoration: none; color: #0a1f0f; }
</style>
