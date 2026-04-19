<script lang="ts">
  import { permStore, canDo } from '$lib/stores/permissions'

  let { data, form } = $props()
  let editingId = $state<string | null>(null)
  let showNew = $state(false)
  let previewHtml = $state('')
  let testEmailId = $state<string | null>(null)
  let perms = $state({ role: null as string | null, permissions: [] as any, loaded: false })

  permStore.subscribe(v => { perms = v })
  function can(r: string, a: string = 'read') { return canDo(perms, r, a) }

  const channelColors: Record<string, string> = {
    email: 'ch-email', sms: 'ch-sms', whatsapp: 'ch-whatsapp', push: 'ch-push', in_app: 'ch-inapp'
  }

  function preview(html: string, variables: string[]) {
    const vars: Record<string, string> = {
      firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com', invitedBy: 'admin@proximity.green'
    }
    let result = html
    for (const [key, val] of Object.entries(vars)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val)
    }
    previewHtml = result
  }
</script>

<div class="container">
  <header>
    <h1>Message Templates</h1>
    {#if can('settings', 'manage')}
      <button onclick={() => showNew = !showNew}>{showNew ? 'Cancel' : '+ New Template'}</button>
    {/if}
  </header>

  {#if form?.error}
    <div class="error">{form.error}</div>
  {/if}
  {#if form?.success}
    <div class="success">{form.message}</div>
  {/if}

  {#if showNew && can('settings', 'manage')}
    <form method="POST" action="?/create" class="new-form">
      <div class="form-row">
        <label>Slug <input name="slug" required placeholder="e.g. password-reset" /></label>
        <label>Name <input name="name" required placeholder="e.g. Password Reset" /></label>
        <label>Channel
          <select name="channel">
            <option value="email">Email</option>
            <option value="sms">SMS</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="push">Push</option>
            <option value="in_app">In-App</option>
          </select>
        </label>
      </div>
      <label>Description <input name="description" placeholder="What this template is used for" /></label>
      <label>Variables (comma-separated) <input name="variables" placeholder="firstName,lastName,email" /></label>
      <label>Subject <input name="subject" placeholder="Welcome, {{firstName}}!" /></label>
      <label>Title (push/in-app) <input name="title" placeholder="Optional" /></label>
      <label>Text Body (SMS/WhatsApp) <textarea name="text_body" rows="3" placeholder="Hi {{firstName}}..."></textarea></label>
      <label>HTML Body (Email) <textarea name="html_body" rows="6" placeholder="<div>..."></textarea></label>
      <button type="submit">Create Template</button>
    </form>
  {/if}

  {#if previewHtml}
    <div class="preview-overlay" onclick={() => previewHtml = ''}>
      <div class="preview-modal" onclick={(e) => e.stopPropagation()}>
        <div class="preview-header">
          <h3>Preview</h3>
          <button onclick={() => previewHtml = ''} class="close-btn">&times;</button>
        </div>
        <div class="preview-body">
          {@html previewHtml}
        </div>
      </div>
    </div>
  {/if}

  <div class="templates">
    {#each data.templates as template (template.id)}
      <div class="template-card">
        <div class="template-header">
          <div>
            <span class="channel-badge {channelColors[template.channel]}">{template.channel}</span>
            <h2>{template.name}</h2>
            <p class="slug">{template.slug}</p>
            {#if template.description}
              <p class="desc">{template.description}</p>
            {/if}
          </div>
          <div class="template-actions">
            <button class="preview-btn" onclick={() => preview(template.html_body, template.variables)}>Preview</button>
            {#if can('settings', 'manage')}
              <button class="edit-btn" onclick={() => editingId = editingId === template.id ? null : template.id}>
                {editingId === template.id ? 'Cancel' : 'Edit'}
              </button>
            {/if}
          </div>
        </div>

        {#if template.variables?.length > 0}
          <div class="vars">
            {#each template.variables as v}
              <code>{`{{${v}}}`}</code>
            {/each}
          </div>
        {/if}

        <div class="subject-line">
          <span class="subject-label">Subject:</span> {template.subject}
        </div>

        {#if editingId === template.id}
          <form method="POST" action="?/update" class="edit-form">
            <input type="hidden" name="id" value={template.id} />
            <label>Subject <input name="subject" value={template.subject} /></label>
            {#if template.channel === 'email'}
              <label>HTML Body <textarea name="html_body" rows="12">{template.html_body}</textarea></label>
            {/if}
            {#if ['sms', 'whatsapp'].includes(template.channel)}
              <label>Text Body <textarea name="text_body" rows="4">{template.text_body ?? ''}</textarea></label>
            {/if}
            {#if ['push', 'in_app'].includes(template.channel)}
              <label>Title <input name="title" value={template.title ?? ''} /></label>
              <label>Text Body <textarea name="text_body" rows="4">{template.text_body ?? ''}</textarea></label>
            {/if}
            <input type="hidden" name="text_body" value={template.text_body ?? ''} />
            <input type="hidden" name="title" value={template.title ?? ''} />
            <div class="edit-actions">
              <button type="submit">Save</button>
              {#if template.channel === 'email'}
                <button type="button" class="test-btn" onclick={() => testEmailId = template.id}>Send Test</button>
              {/if}
            </div>
          </form>
          <form method="POST" action="?/delete" style="margin-top: 0.5rem;">
            <input type="hidden" name="id" value={template.id} />
            <button type="submit" class="delete"
              onclick={(e) => { if (!confirm('Delete this template?')) e.preventDefault() }}>Delete Template</button>
          </form>
        {/if}

        {#if testEmailId === template.id}
          <form method="POST" action="?/sendTest" class="test-form">
            <input type="hidden" name="id" value={template.id} />
            <input name="test_email" type="email" required placeholder="Send test to..." />
            <button type="submit">Send</button>
            <button type="button" onclick={() => testEmailId = null}>Cancel</button>
          </form>
        {/if}
      </div>
    {:else}
      <p class="empty">No templates yet.</p>
    {/each}
  </div>
</div>

<style>
  .container { max-width: 1000px; margin: 0 auto; padding: 2rem; font-family: system-ui, sans-serif; }
  header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
  h1 { font-size: 1.5rem; font-weight: 600; color: #0a1f0f; }
  .error { background: #fdecea; color: #c0392b; padding: 0.75rem 1rem; border-radius: 6px; margin-bottom: 1rem; }
  .success { background: #e8f5ea; color: #2d6a35; padding: 0.75rem 1rem; border-radius: 6px; margin-bottom: 1rem; }
  button { padding: 0.5rem 1rem; background: #2d6a35; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.85rem; }
  button:hover { background: #1e4d25; }
  .new-form { background: #f7f4ee; border: 1px solid #c8deca; border-radius: 8px; padding: 1.5rem; margin-bottom: 1.5rem; display: flex; flex-direction: column; gap: 0.75rem; }
  .form-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.75rem; }
  label { display: flex; flex-direction: column; font-size: 0.85rem; font-weight: 500; color: #5a7060; }
  input, select { margin-top: 0.25rem; padding: 0.5rem; border: 1px solid #c8deca; border-radius: 4px; font-size: 0.9rem; }
  textarea { margin-top: 0.25rem; padding: 0.5rem; border: 1px solid #c8deca; border-radius: 4px; font-size: 0.85rem; font-family: monospace; }
  .templates { display: flex; flex-direction: column; gap: 1rem; }
  .template-card { background: white; border: 1px solid #c8deca; border-radius: 10px; padding: 1.25rem; }
  .template-header { display: flex; justify-content: space-between; align-items: flex-start; }
  .channel-badge { font-size: 0.65rem; font-weight: 600; text-transform: uppercase; padding: 2px 8px; border-radius: 3px; margin-bottom: 0.5rem; display: inline-block; }
  .ch-email { background: #e8f0fd; color: #3a5fc8; }
  .ch-sms { background: #e8f5ea; color: #2d6a35; }
  .ch-whatsapp { background: #e8f5ea; color: #128C7E; }
  .ch-push { background: #f0ebfd; color: #6d3fc8; }
  .ch-inapp { background: #fdf3e3; color: #c8832a; }
  h2 { font-size: 1.1rem; font-weight: 600; color: #0a1f0f; margin: 0.25rem 0; }
  .slug { font-family: monospace; font-size: 0.8rem; color: #5a7060; margin: 0; }
  .desc { font-size: 0.8rem; color: #5a7060; margin: 0.25rem 0 0; }
  .template-actions { display: flex; gap: 0.5rem; }
  .preview-btn { background: #3a5fc8; }
  .edit-btn { background: #2c3e50; }
  .vars { display: flex; gap: 4px; flex-wrap: wrap; margin: 0.75rem 0; }
  .vars code { background: #e8f5ea; color: #2d6a35; padding: 2px 6px; border-radius: 3px; font-size: 0.75rem; }
  .subject-line { font-size: 0.85rem; color: #5a7060; margin-top: 0.5rem; }
  .subject-label { font-weight: 600; }
  .edit-form { margin-top: 1rem; display: flex; flex-direction: column; gap: 0.75rem; border-top: 1px solid #e8f5ea; padding-top: 1rem; }
  .edit-actions { display: flex; gap: 0.5rem; }
  .test-btn { background: #6d3fc8; }
  .delete { background: #c0392b; }
  .test-form { display: flex; gap: 0.5rem; align-items: center; margin-top: 0.75rem; border-top: 1px solid #e8f5ea; padding-top: 0.75rem; }
  .test-form input { flex: 1; }
  .preview-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 1000; }
  .preview-modal { background: white; border-radius: 12px; max-width: 700px; width: 90%; max-height: 80vh; overflow-y: auto; }
  .preview-header { display: flex; justify-content: space-between; align-items: center; padding: 1rem 1.5rem; border-bottom: 1px solid #e8f5ea; }
  .preview-header h3 { margin: 0; color: #0a1f0f; }
  .close-btn { background: none; color: #5a7060; border: none; font-size: 1.5rem; cursor: pointer; padding: 0; }
  .preview-body { padding: 1rem; }
  .empty { color: #5a7060; text-align: center; padding: 2rem; }
</style>
