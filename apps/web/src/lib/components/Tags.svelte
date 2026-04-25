<script lang="ts">
  import { supabase } from '$lib/supabase'
  import { onMount } from 'svelte'

  interface Tag {
    id: string
    name: string
    color: string
  }

  let { entityType, entityId }: { entityType: string; entityId: string } = $props()

  let assignedTags: Tag[] = $state([])
  let allTags: Tag[] = $state([])
  let showPicker = $state(false)
  let newTagName = $state('')
  let newTagColor = $state('#2d6a35')

  const colors = ['#2d6a35', '#3a5fc8', '#c0392b', '#c8832a', '#6d3fc8', '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#2c3e50']

  let availableTags = $derived(allTags.filter(t => !assignedTags.some(a => a.id === t.id)))
  let filteredAvailable = $derived(
    newTagName ? availableTags.filter(t => t.name.toLowerCase().includes(newTagName.toLowerCase())) : availableTags
  )
  let showCreate = $derived(newTagName.trim() && !allTags.some(t => t.name.toLowerCase() === newTagName.trim().toLowerCase()))

  onMount(async () => {
    await Promise.all([loadAssigned(), loadAllTags()])
  })

  $effect(() => { if (entityId && entityType) loadAssigned() })

  async function loadAssigned() {
    const { data } = await supabase
      .from('tag_assignments')
      .select('tag_id, tags(id, name, color)')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .is('tags.deleted_at', null)
    if (data) assignedTags = data.map((d: any) => d.tags).filter(Boolean)
  }

  async function loadAllTags() {
    const { data } = await supabase.from('tags').select('*').is('deleted_at', null).order('name')
    if (data) allTags = data
  }

  async function assignTag(tag: Tag) {
    const { error } = await supabase.from('tag_assignments').insert({
      entity_type: entityType,
      entity_id: entityId,
      tag_id: tag.id
    })
    if (!error) assignedTags = [...assignedTags, tag]
  }

  async function removeTag(tagId: string) {
    await supabase.from('tag_assignments').delete()
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .eq('tag_id', tagId)
    assignedTags = assignedTags.filter(t => t.id !== tagId)
  }

  async function createAndAssign() {
    const name = newTagName.trim()
    if (!name) return
    const { data, error } = await supabase.from('tags').insert({ name, color: newTagColor }).select().single()
    if (data && !error) {
      allTags = [...allTags, data]
      await assignTag(data)
      newTagName = ''
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (showCreate) createAndAssign()
      else if (filteredAvailable.length > 0) { assignTag(filteredAvailable[0]); newTagName = '' }
    } else if (e.key === 'Escape') showPicker = false
  }
</script>

<div class="tags">
  <h4>Tags</h4>
  <div class="tag-list">
    {#each assignedTags as tag (tag.id)}
      <span class="tag" style="background-color: {tag.color}">
        {tag.name}
        <button onclick={() => removeTag(tag.id)}>&times;</button>
      </span>
    {/each}
    <button class="add-tag" onclick={() => showPicker = !showPicker}>+ Add</button>
  </div>

  {#if showPicker}
    <div class="picker">
      <input type="text" bind:value={newTagName} onkeydown={handleKeydown} placeholder="Search or create..." />
      {#if filteredAvailable.length > 0}
        <div class="picker-list">
          {#each filteredAvailable as tag (tag.id)}
            <button class="picker-item" onclick={() => { assignTag(tag); newTagName = '' }}>
              <span class="color-dot" style="background-color: {tag.color}"></span>
              {tag.name}
            </button>
          {/each}
        </div>
      {/if}
      {#if showCreate}
        <div class="create-section">
          <div class="color-row">
            {#each colors as c}
              <button class="color-btn" class:selected={newTagColor === c} style="background-color: {c}" onclick={() => newTagColor = c}></button>
            {/each}
          </div>
          <button class="create-btn" onclick={createAndAssign}>Create "{newTagName.trim()}"</button>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .tags h4 { font-size: 0.8rem; color: #5a7060; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 0.5rem; }
  .tag-list { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
  .tag { display: inline-flex; align-items: center; gap: 4px; color: white; font-size: 0.75rem; font-weight: 500; padding: 2px 8px; border-radius: 100px; }
  .tag button { background: none; border: none; color: white; cursor: pointer; padding: 0; font-size: 0.85rem; opacity: 0.7; }
  .tag button:hover { opacity: 1; }
  .add-tag { background: none; border: 1px dashed #c8deca; color: #5a7060; font-size: 0.75rem; padding: 2px 8px; border-radius: 100px; cursor: pointer; }
  .add-tag:hover { border-color: #2d6a35; color: #2d6a35; }
  .picker { background: white; border: 1px solid #c8deca; border-radius: 8px; padding: 0.75rem; margin-top: 0.5rem; }
  .picker input { width: 100%; padding: 0.4rem; border: 1px solid #c8deca; border-radius: 4px; font-size: 0.85rem; margin-bottom: 0.5rem; }
  .picker-list { max-height: 120px; overflow-y: auto; }
  .picker-item { display: flex; align-items: center; gap: 0.5rem; width: 100%; text-align: left; padding: 0.35rem 0.5rem; border: none; background: none; cursor: pointer; font-size: 0.85rem; border-radius: 4px; color: #0a1f0f; }
  .picker-item:hover { background: #e8f5ea; }
  .color-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  .create-section { border-top: 1px solid #e8f5ea; padding-top: 0.5rem; margin-top: 0.5rem; }
  .color-row { display: flex; gap: 4px; margin-bottom: 0.5rem; }
  .color-btn { width: 20px; height: 20px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; }
  .color-btn.selected { border-color: #0a1f0f; }
  .create-btn { width: 100%; padding: 0.4rem; background: #2d6a35; color: white; border: none; border-radius: 4px; font-size: 0.8rem; cursor: pointer; }
</style>
