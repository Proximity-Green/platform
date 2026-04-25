<script lang="ts">
  import { supabase } from '$lib/supabase'
  import { onMount } from 'svelte'

  interface Note {
    id: string
    content: string
    mentions: string[]
    created_by: string
    created_at: string
  }

  let { entityType, entityId }: { entityType: string; entityId: string } = $props()

  let notes: Note[] = $state([])
  let newNote = $state('')
  let loading = $state(true)
  let saving = $state(false)

  onMount(() => loadNotes())

  $effect(() => {
    if (entityId && entityType) loadNotes()
  })

  async function loadNotes() {
    const { data } = await supabase
      .from('notes')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
    if (data) notes = data
    loading = false
  }

  async function addNote() {
    const content = newNote.trim()
    if (!content) return
    saving = true
    const { error } = await supabase.from('notes').insert({
      entity_type: entityType,
      entity_id: entityId,
      content
    })
    if (!error) {
      newNote = ''
      await loadNotes()
    }
    saving = false
  }

  async function deleteNote(id: string) {
    // Soft-delete: flip deleted_at instead of hard-deleting. Stays in sync
    // with the platform-wide tier-1 convention; recoverable from /changelog.
    await supabase.from('notes').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    notes = notes.filter(n => n.id !== id)
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

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      addNote()
    }
  }
</script>

<div class="notes">
  <h4>Notes {notes.length > 0 ? `(${notes.length})` : ''}</h4>

  <div class="note-input">
    <textarea
      bind:value={newNote}
      onkeydown={handleKeydown}
      placeholder="Add a note..."
      rows="2"
    ></textarea>
    {#if newNote.trim()}
      <button onclick={addNote} disabled={saving}>{saving ? 'Saving...' : 'Add Note'}</button>
    {/if}
  </div>

  {#if loading}
    <p class="muted">Loading...</p>
  {:else if notes.length === 0}
    <p class="muted">No notes yet</p>
  {:else}
    <div class="note-list">
      {#each notes as note (note.id)}
        <div class="note-item">
          <p class="note-content">{note.content}</p>
          <div class="note-meta">
            <span>{timeAgo(note.created_at)}</span>
            <button class="note-delete" onclick={() => deleteNote(note.id)}>&times;</button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .notes h4 { font-size: 0.8rem; color: #5a7060; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 0.5rem; }
  .note-input textarea { width: 100%; padding: 0.5rem; border: 1px solid #c8deca; border-radius: 6px; font-size: 0.85rem; resize: none; font-family: system-ui; }
  .note-input button { margin-top: 0.25rem; padding: 0.3rem 0.75rem; background: #2d6a35; color: white; border: none; border-radius: 4px; font-size: 0.8rem; cursor: pointer; }
  .note-list { display: flex; flex-direction: column; gap: 0.5rem; max-height: 200px; overflow-y: auto; margin-top: 0.5rem; }
  .note-item { background: #f7f4ee; border-radius: 6px; padding: 0.5rem 0.75rem; }
  .note-content { font-size: 0.85rem; color: #0a1f0f; margin: 0; white-space: pre-wrap; word-break: break-word; }
  .note-meta { display: flex; justify-content: space-between; align-items: center; margin-top: 0.25rem; font-size: 0.7rem; color: #5a7060; }
  .note-delete { background: none; border: none; color: #c0392b; cursor: pointer; font-size: 1rem; padding: 0; opacity: 0.3; }
  .note-delete:hover { opacity: 1; }
  .muted { font-size: 0.8rem; color: #5a7060; }
</style>
