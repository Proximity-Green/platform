<script lang="ts">
  import { onDestroy } from 'svelte'
  import { invalidateAll } from '$app/navigation'
  import { supabase } from '$lib/supabase'

  // Watches a single record for changes made by OTHER users via the change_log
  // Supabase Realtime stream. When one arrives, shows a floating pill with
  // "Updated by <name>" and a Refresh button that invalidates SvelteKit data.
  //
  // Requires:
  //   - change_log in the supabase_realtime publication (migration 035)
  //   - the change_log trigger writing changed_by correctly (migration 036)
  //
  // Usage:
  //   <RecordLive tableName="persons" recordId={person.id} viewerId={viewerId} label="member" />
  type Props = {
    tableName: string
    recordId: string
    /** The currently signed-in user's auth UUID. Events with changed_by equal
        to this are ignored (you made the change, so no surprise). */
    viewerId: string | null
    /** Singular noun for the toast: "member" / "organisation" / "invoice". */
    label?: string
  }
  let { tableName, recordId, viewerId, label = 'record' }: Props = $props()

  let pending = $state<{ by: string } | null>(null)

  const channel = supabase
    .channel(`record-live-${tableName}-${recordId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'change_log', filter: `record_id=eq.${recordId}` },
      async (payload) => {
        const row = payload.new as any
        if (row.table_name !== tableName) return
        if (row.changed_by && row.changed_by === viewerId) return

        let by = 'someone else'
        if (row.changed_by) {
          // Best-effort lookup: try to resolve the user_id to a friendly name.
          // RLS controls whether this returns rows; if not, we fall back.
          const { data: person } = await supabase
            .from('persons')
            .select('first_name, last_name, email')
            .eq('user_id', row.changed_by)
            .maybeSingle()
          if (person) {
            const name = [person.first_name, person.last_name].filter(Boolean).join(' ').trim()
            by = name || person.email || row.changed_by.slice(0, 8)
          } else {
            by = row.changed_by.slice(0, 8)
          }
        }
        pending = { by }
      }
    )
    .subscribe()

  function refresh() {
    pending = null
    invalidateAll()
  }

  function dismiss() {
    pending = null
  }

  onDestroy(() => {
    supabase.removeChannel(channel)
  })
</script>

{#if pending}
  <div class="record-live" role="status" aria-live="polite">
    <span class="dot" aria-hidden="true"></span>
    <span class="message">
      This {label} was just updated by <strong>{pending.by}</strong>
    </span>
    <button type="button" class="refresh-btn" onclick={refresh}>Refresh</button>
    <button type="button" class="dismiss-btn" onclick={dismiss} aria-label="Dismiss">×</button>
  </div>
{/if}

<style>
  .record-live {
    position: fixed;
    top: calc(var(--topnav-height, 60px) + 14px);
    right: var(--space-5);
    z-index: 15000;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: 8px 10px 8px 14px;
    background: var(--surface-raised);
    border: 1px solid var(--accent);
    border-radius: 999px;
    box-shadow: var(--shadow-md, 0 4px 16px rgba(0,0,0,0.12));
    font-size: var(--text-sm);
    max-width: min(90vw, 520px);
    animation: record-live-in 200ms ease;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 30%, transparent);
    animation: record-live-pulse 1.5s ease-in-out infinite;
    flex-shrink: 0;
  }
  .message {
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
  .refresh-btn {
    background: var(--accent);
    color: #fff;
    border: none;
    padding: 4px 12px;
    border-radius: 999px;
    cursor: pointer;
    font-weight: var(--weight-semibold);
    font-size: var(--text-xs);
    font-family: inherit;
    flex-shrink: 0;
  }
  .refresh-btn:hover { filter: brightness(1.1); }
  .dismiss-btn {
    background: transparent;
    border: none;
    color: var(--text-muted);
    font-size: 18px;
    cursor: pointer;
    line-height: 1;
    padding: 0 6px;
    flex-shrink: 0;
  }
  .dismiss-btn:hover { color: var(--text); }

  @keyframes record-live-in {
    from { transform: translateX(20px); opacity: 0; }
    to   { transform: translateX(0);    opacity: 1; }
  }
  @keyframes record-live-pulse {
    0%, 100% { opacity: 1; }
    50%      { opacity: 0.55; }
  }
</style>
