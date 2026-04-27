<script lang="ts">
  import { enhance } from '$app/forms'
  import { invalidateAll } from '$app/navigation'
  import { marked } from 'marked'
  import { Badge, Button, PageHead, Toast, Field, FieldGrid, Select, SubmitButton, RecordHistory, ErrorBanner } from '$lib/components/ui'
  import type { FeatureRequest, FeatureRequestKind, FeatureRequestStatus, Tag } from '$lib/services/feature-requests.service'

  let { data, form } = $props()
  const request = $derived(data.request as FeatureRequest)
  const allTags = $derived(data.allTags as Tag[])

  let editing = $state(false)
  let saving = $state(false)

  let tagAdding = $state(false)
  let tagNewDraft = $state('')

  let localStatus = $state<FeatureRequestStatus>('new')
  $effect(() => {
    localStatus = request.status
  })

  async function onStatusChange(value: string) {
    const next = value as FeatureRequestStatus
    if (next === localStatus) return
    const prev = localStatus
    localStatus = next
    const fd = new FormData()
    fd.set('status', next)
    try {
      const res = await fetch('?/updateStatus', { method: 'POST', body: fd })
      if (!res.ok) localStatus = prev
    } catch {
      localStatus = prev
    }
  }

  // Local optimistic state for tag checkboxes — mirrors request.tags but
  // mutates instantly on click so the UI doesn't wait for the server.
  let localApplied = $state<Set<string>>(new Set())
  $effect(() => {
    localApplied = new Set(request.tags.map((t) => t.id))
  })

  async function onTagToggle(tagId: string, checked: boolean) {
    // Optimistic update
    const next = new Set(localApplied)
    if (checked) next.add(tagId)
    else next.delete(tagId)
    localApplied = next

    const fd = new FormData()
    fd.set('tag_id', tagId)
    try {
      const res = await fetch(`?/${checked ? 'addTag' : 'removeTag'}`, { method: 'POST', body: fd })
      if (!res.ok) {
        const revert = new Set(localApplied)
        if (checked) revert.delete(tagId)
        else revert.add(tagId)
        localApplied = revert
      }
    } catch {
      const revert = new Set(localApplied)
      if (checked) revert.delete(tagId)
      else revert.add(tagId)
      localApplied = revert
    }
  }

  async function onAddNewTag() {
    const name = tagNewDraft.trim()
    if (!name || tagAdding) return
    tagNewDraft = ''
    tagAdding = true
    const fd = new FormData()
    fd.set('name', name)
    try {
      await fetch('?/addTag', { method: 'POST', body: fd })
      // Need a full invalidate for the new tag to appear in allTags + request.tags
      await invalidateAll()
    } finally {
      tagAdding = false
    }
  }

  const STATUS_TONE: Record<FeatureRequestStatus, 'default' | 'info' | 'warning' | 'success'> = {
    new: 'default',
    triaged: 'info',
    planned: 'info',
    in_progress: 'warning',
    done: 'success'
  }

  const STATUS_LABEL: Record<FeatureRequestStatus, string> = {
    new: 'New',
    triaged: 'Triaged',
    planned: 'Planned',
    in_progress: 'In progress',
    done: 'Done'
  }

  const STATUS_OPTIONS = [
    { value: 'new', label: 'New' },
    { value: 'triaged', label: 'Triaged' },
    { value: 'planned', label: 'Planned' },
    { value: 'in_progress', label: 'In progress' },
    { value: 'done', label: 'Done' }
  ]

  const KIND_LABEL: Record<FeatureRequestKind, string> = {
    feature_request: 'Feature request',
    note: 'Note'
  }
  const KIND_TONE: Record<FeatureRequestKind, 'info' | 'default'> = {
    feature_request: 'info',
    note: 'default'
  }

  function fmtDateTime(iso: string): string {
    return new Date(iso).toLocaleString('en-ZA', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  $effect(() => {
    if (form?.success) editing = false
  })
</script>

<PageHead title={request.title} lede={`${KIND_LABEL[request.kind]} · ${STATUS_LABEL[request.status]}`}>
  <a class="back-link" href="/feature-requests">← All</a>
</PageHead>

<Toast success={form?.success} message={form?.success ? form?.message : undefined} />
{#if form?.error || (form as any)?.actionable}
  <ErrorBanner error={(form as any)?.actionable ?? form?.error} showRaw />
{/if}

<div class="grid">
  <div class="main">
    <div class="header-row">
      <div class="vote-col">
        <form method="POST" action="?/toggleVote" use:enhance>
          <input type="hidden" name="has_voted" value={request.viewer_voted ? 'true' : 'false'} />
          <button type="submit" class="vote-btn" class:voted={request.viewer_voted} aria-label={request.viewer_voted ? 'Remove vote' : 'Add vote'}>
            <span class="vote-arrow">▲</span>
            <span class="vote-count">{request.vote_count}</span>
          </button>
        </form>
      </div>
      <div class="title-col">
        {#if editing}
          <form
            method="POST"
            action="?/updateDetails"
            id="edit-fr-form"
            use:enhance={() => {
              saving = true
              return async ({ update }) => {
                await update({ reset: false })
                saving = false
              }
            }}
          >
            <FieldGrid cols={1}>
              <Field name="title" label="Title" value={request.title} required />
              <Field label="Summary">
                <textarea name="summary" rows="3" class="summary-textarea">{request.summary ?? ''}</textarea>
              </Field>
            </FieldGrid>
            <div class="edit-actions">
              <Button variant="ghost" size="sm" onclick={() => (editing = false)} disabled={saving}>Cancel</Button>
              <Button type="submit" size="sm" loading={saving}>{saving ? 'Saving…' : 'Save'}</Button>
            </div>
          </form>
        {:else}
          <h2 class="fr-title">{request.title}</h2>
          {#if request.summary}
            <div class="fr-summary md">{@html marked.parse(request.summary)}</div>
          {:else}
            <p class="fr-summary muted"><em>No summary.</em></p>
          {/if}
          <div class="header-actions">
            <Button variant="ghost" size="sm" onclick={() => (editing = true)}>Edit title/summary</Button>
          </div>
        {/if}
      </div>
    </div>

    <section class="panel">
      <h3 class="section-title">Conversation</h3>
      {#if request.transcript.length === 0}
        <p class="muted">No transcript attached.</p>
      {:else}
        <div class="chat">
          {#each request.transcript as m}
            <div class="msg" data-role={m.role}>
              <div class="msg-who">
                <span class="avatar">{m.role === 'user' ? 'M' : 'C'}</span>
                {m.role === 'user' ? 'Raiser' : 'Claude'}
              </div>
              <div class="msg-body">
                {#if m.role === 'assistant'}
                  {@html marked.parse(m.content)}
                {:else}
                  {m.content}
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </section>
  </div>

  <aside class="side">
    <div class="side-card">
      <div class="side-label">Kind</div>
      <div class="side-badge"><Badge tone={KIND_TONE[request.kind]}>{KIND_LABEL[request.kind]}</Badge></div>
      <form method="POST" action="?/updateKind" use:enhance class="status-form">
        <input type="hidden" name="kind" value={request.kind === 'feature_request' ? 'note' : 'feature_request'} />
        <Button type="submit" size="sm" variant="ghost">
          {request.kind === 'feature_request' ? 'Mark as note' : 'Promote to feature request'}
        </Button>
      </form>
    </div>

    <div class="side-card">
      <div class="side-label">Status</div>
      <div class="side-badge"><Badge tone={STATUS_TONE[localStatus]}>{STATUS_LABEL[localStatus]}</Badge></div>
      <Select value={localStatus} options={STATUS_OPTIONS} onchange={onStatusChange} />
    </div>

    <div class="side-card">
      <div class="side-label">Tags</div>
      <div class="tag-list">
        {#each allTags as t}
          <label class="tag-check">
            <input
              type="checkbox"
              checked={localApplied.has(t.id)}
              onchange={(e) => onTagToggle(t.id, (e.currentTarget as HTMLInputElement).checked)}
            />
            <span>{t.name}</span>
          </label>
        {/each}
        {#if allTags.length === 0}
          <span class="muted tag-empty">No tags yet — add the first one below.</span>
        {/if}
      </div>
      <div class="tag-add">
        <input
          type="text"
          bind:value={tagNewDraft}
          placeholder="New tag name"
          class="tag-input"
          autocomplete="off"
          disabled={tagAdding}
          onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onAddNewTag() } }}
        />
        <Button type="button" size="sm" variant="ghost" onclick={onAddNewTag} loading={tagAdding}>+ Add</Button>
      </div>
    </div>

    <div class="side-card">
      <div class="side-label">Meta</div>
      <dl class="meta">
        <dt>Raised by</dt>
        <dd>{request.author_email ?? 'Unknown'}</dd>
        <dt>Created</dt>
        <dd>{fmtDateTime(request.created_at)}</dd>
        <dt>Updated</dt>
        <dd>{fmtDateTime(request.updated_at)}</dd>
        <dt>Votes</dt>
        <dd>{request.vote_count}</dd>
      </dl>
    </div>

    <div class="side-card danger-card">
      <SubmitButton
        action="?/delete"
        label="Delete request"
        pendingLabel="Deleting…"
        variant="danger"
        size="sm"
        confirm={{
          title: 'Delete feature request?',
          message: `Permanently delete "${request.title}"? Votes and tags will be removed.`,
          variant: 'danger'
        }}
      />
    </div>
  </aside>
</div>

<RecordHistory table="feature_requests" id={request?.id} />

<style>
  .grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 280px;
    gap: var(--space-5);
    align-items: start;
  }
  .main { min-width: 0; }
  .back-link { color: var(--text-muted); font-size: var(--text-sm); text-decoration: none; }
  .back-link:hover { color: var(--accent); }

  .header-row {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--space-4);
    align-items: start;
    padding: var(--space-4);
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-4);
  }
  .vote-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: var(--space-2) var(--space-3);
    min-width: 58px;
    border: 1px solid var(--border);
    background: var(--surface);
    border-radius: var(--radius-md);
    color: var(--text-muted);
    cursor: pointer;
    transition: all 150ms;
  }
  .vote-btn:hover { border-color: var(--accent); color: var(--accent); }
  .vote-btn.voted {
    background: color-mix(in srgb, var(--accent) 14%, var(--surface));
    border-color: var(--accent);
    color: var(--accent);
  }
  .vote-arrow { font-size: 12px; line-height: 1; }
  .vote-count {
    font-family: var(--font-mono);
    font-weight: var(--weight-bold);
    font-size: var(--text-md);
  }
  .fr-title {
    margin: 0 0 var(--space-1);
    font-size: var(--text-xl);
    color: var(--heading-color);
  }
  .fr-summary {
    margin: 0 0 var(--space-2);
    color: var(--text);
    line-height: 1.5;
  }
  .fr-summary.muted em { color: var(--text-muted); }

  /* Markdown-rendered summary — keep typography close to surrounding UI */
  .fr-summary.md :global(h1),
  .fr-summary.md :global(h2),
  .fr-summary.md :global(h3),
  .fr-summary.md :global(h4) {
    margin: var(--space-3) 0 var(--space-1);
    color: var(--heading-color);
    font-weight: var(--weight-semibold);
  }
  .fr-summary.md :global(h1) { font-size: var(--text-lg); }
  .fr-summary.md :global(h2) { font-size: var(--text-md); }
  .fr-summary.md :global(h3),
  .fr-summary.md :global(h4) { font-size: var(--text-sm); text-transform: uppercase; letter-spacing: 0.05em; color: var(--label-color); }
  .fr-summary.md :global(p) { margin: 0 0 var(--space-2); }
  .fr-summary.md :global(ul),
  .fr-summary.md :global(ol) { margin: 0 0 var(--space-2); padding-left: var(--space-5); }
  .fr-summary.md :global(li) { margin: 0 0 4px; }
  .fr-summary.md :global(li > ul),
  .fr-summary.md :global(li > ol) { margin: 4px 0 0; }
  .fr-summary.md :global(code) {
    font-family: var(--font-mono);
    font-size: 0.9em;
    background: var(--surface-sunk);
    padding: 1px 6px;
    border-radius: 3px;
  }
  .fr-summary.md :global(pre) {
    background: var(--surface-sunk);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    overflow-x: auto;
    font-size: var(--text-xs);
  }
  .fr-summary.md :global(pre code) { background: transparent; padding: 0; }
  .fr-summary.md :global(strong) { font-weight: var(--weight-semibold); }
  .fr-summary.md :global(blockquote) {
    margin: 0 0 var(--space-2);
    padding-left: var(--space-3);
    border-left: 3px solid var(--border);
    color: var(--text-muted);
  }
  .fr-summary.md :global(a) { color: var(--accent); text-decoration: none; }
  .fr-summary.md :global(a:hover) { text-decoration: underline; }
  .fr-summary.md :global(hr) {
    border: none;
    border-top: 1px solid var(--border);
    margin: var(--space-3) 0;
  }
  .header-actions { margin-top: var(--space-2); }
  .edit-actions { display: flex; gap: var(--space-2); justify-content: flex-end; margin-top: var(--space-3); }
  .summary-textarea {
    width: 100%;
    padding: var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-family: inherit;
    font-size: var(--text-sm);
    resize: vertical;
    min-height: 60px;
  }

  .panel {
    padding: var(--space-4);
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-4);
  }
  .section-title {
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--label-color);
    margin: 0 0 var(--space-3);
  }

  .chat { display: flex; flex-direction: column; gap: var(--space-4); }
  .msg { display: flex; flex-direction: column; gap: var(--space-1); }
  .msg-who {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-xs);
    font-weight: var(--weight-bold);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .avatar {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: var(--weight-bold);
  }
  .msg[data-role='user'] .avatar { background: var(--accent); }
  .msg[data-role='assistant'] .avatar { background: #1e1e1e; }
  .msg-body {
    padding: var(--space-2) var(--space-3);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
    line-height: 1.5;
  }
  .msg[data-role='user'] .msg-body {
    background: color-mix(in srgb, var(--accent) 10%, var(--surface));
    border-color: color-mix(in srgb, var(--accent) 25%, var(--border));
  }

  .side { display: flex; flex-direction: column; gap: var(--space-3); position: sticky; top: var(--space-4); }
  .side-card {
    padding: var(--space-3);
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
  }
  .side-label {
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--label-color);
    margin-bottom: var(--space-2);
  }
  .side-badge { margin-bottom: var(--space-2); }
  .status-form { display: flex; gap: var(--space-2); align-items: center; }
  .status-form :global(select) { flex: 1; }

  .tag-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: var(--space-2);
    min-height: 22px;
  }
  .tag-check {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 10px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface);
    font-size: var(--text-xs);
    cursor: pointer;
    color: var(--text-muted);
  }
  .tag-check:hover { color: var(--text); border-color: var(--text-muted); }
  .tag-check input { margin: 0; accent-color: var(--accent); cursor: pointer; }
  .tag-check:has(input:checked) {
    background: color-mix(in srgb, var(--accent) 12%, var(--surface));
    border-color: var(--accent);
    color: var(--accent);
    font-weight: var(--weight-semibold);
  }
  .tag-empty { font-size: var(--text-xs); padding: 2px 0; }
  .tag-add { display: flex; gap: var(--space-2); align-items: center; }
  .tag-input {
    flex: 1;
    padding: 4px 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
  }

  .meta { margin: 0; font-size: var(--text-xs); display: grid; grid-template-columns: auto 1fr; gap: 4px var(--space-3); }
  .meta dt { color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; font-size: 10px; }
  .meta dd { margin: 0; color: var(--text); }

  .danger-card { border-color: color-mix(in srgb, var(--danger) 30%, var(--border)); }

  .muted { color: var(--text-muted); }

  @media (max-width: 900px) {
    .grid { grid-template-columns: 1fr; }
    .side { position: static; }
  }
</style>
