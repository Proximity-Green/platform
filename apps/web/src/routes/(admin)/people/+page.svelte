<script lang="ts">
  let { data, form } = $props()
  let showForm = $state(false)
  let editingId = $state<string | null>(null)
</script>

<div class="container">
  <header>
    <h1>People</h1>
    <div class="header-actions">
      {#if data.canCreate}
        <form method="POST" action="?/generateRandom" style="display:inline">
          <button type="submit" class="random-btn">+ 10 Random</button>
        </form>
        <button onclick={() => { showForm = !showForm; editingId = null }}>
          {showForm ? 'Cancel' : '+ Add Person'}
        </button>
      {/if}
    </div>
  </header>

  {#if form?.error}
    <div class="error">{form.error}</div>
  {/if}

  {#if form?.success}
    <div class="success">Saved successfully</div>
  {/if}

  {#if showForm && data.canCreate}
    <form method="POST" action="?/create" class="form-card">
      <div class="form-grid">
        <label>
          First Name *
          <input name="first_name" required />
        </label>
        <label>
          Last Name *
          <input name="last_name" required />
        </label>
        <label>
          Email *
          <input name="email" type="email" required />
        </label>
        <label>
          Phone
          <input name="phone" />
        </label>
        <label>
          Job Title
          <input name="job_title" />
        </label>
      </div>
      <button type="submit">Create Person</button>
    </form>
  {/if}

  <table>
    <thead>
      <tr>
        <th>Name</th>
        <th>Email</th>
        <th>Phone</th>
        <th>Job Title</th>
        {#if data.canUpdate || data.canDelete}
          <th>Actions</th>
        {/if}
      </tr>
    </thead>
    <tbody>
      {#each data.persons as person}
        {#if editingId === person.id && data.canUpdate}
          <tr>
            <td colspan={data.canDelete ? 5 : 4}>
              <form method="POST" action="?/update" class="edit-form">
                <input type="hidden" name="id" value={person.id} />
                <input name="first_name" value={person.first_name} required />
                <input name="last_name" value={person.last_name} required />
                <input name="phone" value={person.phone ?? ''} />
                <input name="job_title" value={person.job_title ?? ''} />
                <button type="submit">Save</button>
                <button type="button" onclick={() => editingId = null}>Cancel</button>
              </form>
            </td>
          </tr>
        {:else}
          <tr>
            <td>{person.first_name} {person.last_name}</td>
            <td>{person.email}</td>
            <td>{person.phone ?? '—'}</td>
            <td>{person.job_title ?? '—'}</td>
            {#if data.canUpdate || data.canDelete}
              <td class="actions">
                {#if data.canUpdate}
                  <button onclick={() => editingId = person.id}>Edit</button>
                {/if}
                {#if data.canDelete}
                  <form method="POST" action="?/delete" style="display:inline">
                    <input type="hidden" name="id" value={person.id} />
                    <button type="submit" class="delete"
                      onclick={(e) => { if (!confirm('Delete this person?')) e.preventDefault() }}>
                      Delete
                    </button>
                  </form>
                {/if}
              </td>
            {/if}
          </tr>
        {/if}
      {:else}
        <tr><td colspan="5" class="empty">No people yet.</td></tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .container { max-width: 960px; margin: 0 auto; padding: 2rem; font-family: system-ui, sans-serif; }
  header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
  .header-actions { display: flex; gap: 0.5rem; }
  h1 { font-size: 1.5rem; font-weight: 600; color: #0a1f0f; }
  .error { background: #fdecea; color: #c0392b; padding: 0.75rem 1rem; border-radius: 6px; margin-bottom: 1rem; }
  .success { background: #e8f5ea; color: #2d6a35; padding: 0.75rem 1rem; border-radius: 6px; margin-bottom: 1rem; }
  .form-card { background: #f7f4ee; border: 1px solid #c8deca; border-radius: 8px; padding: 1.5rem; margin-bottom: 1.5rem; }
  .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem; }
  label { display: flex; flex-direction: column; font-size: 0.85rem; font-weight: 500; color: #5a7060; }
  input { margin-top: 0.25rem; padding: 0.5rem; border: 1px solid #c8deca; border-radius: 4px; font-size: 0.9rem; }
  button { padding: 0.5rem 1rem; background: #2d6a35; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.85rem; }
  button:hover { background: #1e4d25; }
  .random-btn { background: #3a5fc8; }
  .random-btn:hover { background: #2d4a9e; }
  .delete { background: #c0392b; }
  .delete:hover { background: #96281b; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; padding: 0.75rem; border-bottom: 2px solid #c8deca; font-size: 0.8rem; color: #5a7060; text-transform: uppercase; letter-spacing: 0.5px; }
  td { padding: 0.75rem; border-bottom: 1px solid #e8f5ea; font-size: 0.9rem; }
  .actions { display: flex; gap: 0.5rem; }
  .edit-form { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
  .edit-form input { padding: 0.35rem; font-size: 0.85rem; }
  .empty { text-align: center; color: #5a7060; padding: 2rem; }
</style>
