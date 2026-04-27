<script lang="ts">
  /**
   * Renders an ActionableError consistently across the app. Drop into any
   * modal, page, or form. Endpoints surface errors as ActionableError via
   * the translate() helper in $lib/services/errors.
   *
   * Tone defaults to 'danger' but can be overridden for warnings (e.g. an
   * action-completed-with-skipped-rows summary that's not a failure).
   */
  import type { ActionableError } from '$lib/services/errors'
  import { page } from '$app/stores'

  type Tone = 'danger' | 'warning' | 'info'
  type Props = {
    error: ActionableError | string | null | undefined
    tone?: Tone
    /** Show the raw developer error string under the actions (collapsed). */
    showRaw?: boolean
    /** Optional dismiss handler — fires when the user clicks the × button.
     *  Banner self-dismisses regardless; this is just a notification hook. */
    onDismiss?: () => void
    /** Hide the × button entirely (rare — use only when you need the
     *  banner to stay until external state changes it). */
    dismissable?: boolean
  }
  let { error, tone = 'danger', showRaw = false, onDismiss, dismissable = true }: Props = $props()

  // Normalise: a bare string becomes an ActionableError with title only.
  const normalised = $derived.by((): ActionableError | null => {
    if (error == null) return null
    if (typeof error === 'string') {
      return { code: 'unknown', title: error, raw: error }
    }
    return error
  })

  // Self-dismissal — when the user clicks ×, hide locally. Reset whenever a
  // new error arrives (different title/raw) so the next failure isn't
  // pre-suppressed. Using title+raw as the identity key is good enough; the
  // chance of two consecutive failures sharing both is vanishingly small.
  // We also reset the report-this-error state on the same trigger, since
  // each new failure is its own report-able event.
  let dismissed = $state(false)
  let lastKey = $state<string | null>(null)
  $effect(() => {
    const key = normalised ? `${normalised.title}::${normalised.raw ?? ''}` : null
    if (key !== lastKey) {
      lastKey = key
      dismissed = false
      reportedId = null
      reportError = null
      reporting = false
    }
  })

  function handleDismiss() {
    dismissed = true
    onDismiss?.()
  }

  let rawOpen = $state(false)
  let copied = $state(false)
  let reporting = $state(false)
  let reportedId = $state<string | null>(null)
  let reportError = $state<string | null>(null)

  // Map machine codes to short, lay-friendly labels for the chip. Anything
  // not mapped here still copies/logs as the raw code, so support can
  // search by the underlying identifier.
  const CODE_LABELS: Record<string, string> = {
    cross_location_tracking_code: 'Wrong location',
    fk_to_soft_deleted: 'Linked record deleted',
    fk_to_possibly_deleted: 'Linked record deleted',
    fk_violation: 'Missing link',
    duplicate_key: 'Already exists',
    permission_denied: 'No permission',
    ref_soft_deleted: 'Deleted record',
    undefined_column: 'Server bug',
    not_null_violation: 'Missing field',
    check_violation: 'Invalid value',
    string_too_long: 'Too long',
    invalid_text_representation: 'Wrong format',
    unclassified: '',
    unknown: ''
  }
  const codeLabel = $derived(
    normalised ? (CODE_LABELS[normalised.code] ?? normalised.code) : ''
  )

  // Single source of truth — both the Copy button and the "Show technical
  // detail" panel render the same multiline blob, so what the user sees
  // matches what they paste into a bug report.
  const detailsBlob = $derived.by(() => {
    if (!normalised) return ''
    // Pull current user from the layout's session so support has the
    // "who" alongside the "what" without the user having to remember to
    // include it in the bug report. Falls through silently if the page
    // isn't wrapped in a session-aware layout.
    const user = ($page.data as any)?.session?.user as { id?: string; email?: string } | undefined
    const userLine = user
      ? `User: ${user.email ?? '(no email)'}${user.id ? ` (${user.id})` : ''}`
      : 'User: (signed out)'
    return [
      `Code: ${normalised.code}`,
      `Title: ${normalised.title}`,
      normalised.detail ? `Detail: ${normalised.detail}` : null,
      `When: ${new Date().toISOString()}`,
      `URL: ${typeof window !== 'undefined' ? window.location.href : ''}`,
      userLine,
      normalised.raw && normalised.raw !== normalised.title ? `Raw: ${normalised.raw}` : null
    ].filter(Boolean).join('\n')
  })

  async function copyAll() {
    if (!detailsBlob) return
    try {
      await navigator.clipboard.writeText(detailsBlob)
      copied = true
      setTimeout(() => (copied = false), 1800)
    } catch { /* noop — older browsers / no clipboard permission */ }
  }

  // Capture the visible viewport as a PNG data URL using html2canvas-pro.
  // Dynamic-imported so the ~30KB lib only loads when the user actually
  // hits Report — the success path on every page never pays for it.
  // Returns null on any failure (huge browser, CORS-tainted image, etc.) so
  // the report still goes through with text fields intact.
  async function captureViewport(): Promise<{ dataUrl: string | null; w: number; h: number }> {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return { dataUrl: null, w: 0, h: 0 }
    }
    const w = window.innerWidth
    const h = window.innerHeight
    try {
      const mod = await import('html2canvas-pro')
      const html2canvas = (mod as any).default ?? mod
      const canvas = await html2canvas(document.body, {
        // Capture only what's currently scrolled into view — both keeps the
        // image relevant ("the user saw this") and bounds the data-URL size.
        x: window.scrollX,
        y: window.scrollY,
        width: w,
        height: h,
        windowWidth: document.documentElement.scrollWidth,
        windowHeight: document.documentElement.scrollHeight,
        scale: window.devicePixelRatio > 1 ? 1 : 1.25, // ~1× HiDPI / 1.25× LoDPI
        backgroundColor: null,
        logging: false,
        useCORS: true
      })
      // PNG quality is irrelevant; switch to JPEG when the PNG is huge.
      let dataUrl = canvas.toDataURL('image/png')
      if (dataUrl.length > 1_500_000) {
        dataUrl = canvas.toDataURL('image/jpeg', 0.78)
      }
      return { dataUrl, w, h }
    } catch {
      return { dataUrl: null, w, h }
    }
  }

  async function reportError_() {
    if (!normalised || reporting || reportedId) return
    reporting = true
    reportError = null
    try {
      const { dataUrl, w, h } = await captureViewport()
      const res = await fetch('/api/admin/report-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: normalised.code,
          title: normalised.title,
          detail: normalised.detail,
          raw: normalised.raw,
          url: typeof window !== 'undefined' ? window.location.href : '',
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
          screenshot: dataUrl,
          viewport_w: w,
          viewport_h: h
        })
      })
      if (!res.ok) {
        const t = await res.text().catch(() => '')
        throw new Error(t || `HTTP ${res.status}`)
      }
      const json = await res.json().catch(() => ({} as any))
      reportedId = json?.id ?? 'submitted'
    } catch (e: any) {
      reportError = e?.message ?? String(e)
    } finally {
      reporting = false
    }
  }

</script>

{#if normalised && !dismissed}
  <div class="error-banner is-{tone}" role="alert">
    <div class="error-icon" aria-hidden="true">
      {#if tone === 'danger'}!{:else if tone === 'warning'}⚠{:else}i{/if}
    </div>
    <div class="error-body">
      <div class="error-head">
        <div class="error-title">{normalised.title}</div>
        {#if codeLabel}
          <span class="error-code" title={`Error code: ${normalised.code} — quote this when reporting an issue`}>{codeLabel}</span>
        {/if}
      </div>
      {#if normalised.detail}
        <div class="error-detail">{normalised.detail}</div>
      {/if}
      {#if normalised.actions?.length}
        <div class="error-actions">
          {#each normalised.actions as a (a.label)}
            {#if a.href}
              <a class="error-action-link"
                 href={a.href}
                 target={a.external ? '_blank' : undefined}
                 rel={a.external ? 'noopener noreferrer' : undefined}>
                {a.label}{a.external ? ' ↗' : ' →'}
              </a>
            {:else}
              <span class="error-action-label">{a.label}</span>
            {/if}
          {/each}
        </div>
      {/if}
      <div class="error-foot">
        <button type="button" class="error-copy-btn" onclick={copyAll} title="Copy error details">
          {copied ? '✓ Copied' : 'Copy details'}
        </button>
        <button
          type="button"
          class="error-copy-btn"
          onclick={reportError_}
          disabled={reporting || !!reportedId}
          title={reportedId ? 'Report submitted — visible on /admin/reported-errors' : 'Send this error to the triage queue'}
        >
          {reporting ? 'Reporting…' : reportedId ? '✓ Reported' : 'Report error'}
        </button>
        {#if showRaw}
          <button type="button" class="error-raw-toggle" onclick={() => (rawOpen = !rawOpen)}>
            {rawOpen ? 'Hide' : 'Show'} technical detail
          </button>
        {/if}
      </div>
      {#if reportError}
        <div class="error-report-feedback">Couldn't submit report: {reportError}</div>
      {/if}
      {#if showRaw && rawOpen}
        <pre class="error-raw">{detailsBlob}</pre>
      {/if}
    </div>
    {#if dismissable}
      <button type="button" class="error-dismiss" aria-label="Dismiss" title="Dismiss" onclick={handleDismiss}>×</button>
    {/if}
  </div>
{/if}

<style>
  .error-banner {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    margin-bottom: var(--space-3);
    border: 1px solid transparent;
    border-radius: var(--radius-md, 6px);
    line-height: 1.4;
  }
  .is-danger {
    background: color-mix(in srgb, var(--danger, #c0392b) 10%, transparent);
    border-color: color-mix(in srgb, var(--danger, #c0392b) 30%, transparent);
    color: var(--text);
  }
  .is-warning {
    background: color-mix(in srgb, var(--warning, #d68910) 10%, transparent);
    border-color: color-mix(in srgb, var(--warning, #d68910) 30%, transparent);
    color: var(--text);
  }
  .is-info {
    background: color-mix(in srgb, var(--info, #2874a6) 8%, transparent);
    border-color: color-mix(in srgb, var(--info, #2874a6) 25%, transparent);
    color: var(--text);
  }

  .error-icon {
    flex-shrink: 0;
    width: 22px;
    height: 22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    font-weight: var(--weight-bold);
    font-size: 13px;
    line-height: 1;
  }
  .is-danger .error-icon {
    background: var(--danger, #c0392b);
    color: #fff;
  }
  .is-warning .error-icon {
    background: var(--warning, #d68910);
    color: #fff;
  }
  .is-info .error-icon {
    background: var(--info, #2874a6);
    color: #fff;
  }

  .error-body {
    flex: 1;
    min-width: 0;
  }
  .error-head {
    display: flex;
    align-items: baseline;
    gap: 10px;
    flex-wrap: wrap;
  }
  .error-title {
    font-weight: var(--weight-semibold);
    font-size: var(--text-sm);
    margin-bottom: 2px;
  }
  .error-code {
    display: inline-block;
    padding: 1px 8px;
    border: 1px solid color-mix(in srgb, currentColor 25%, transparent);
    border-radius: 3px;
    font-size: 11px;
    font-weight: var(--weight-medium);
    opacity: 0.75;
    user-select: all;
    white-space: nowrap;
  }
  .error-detail {
    color: var(--text-muted);
    font-size: var(--text-sm);
    margin-bottom: 6px;
  }

  .error-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 6px;
  }
  .error-action-link {
    color: var(--accent);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    text-decoration: none;
  }
  .error-action-link:hover { text-decoration: underline; }
  .error-action-label {
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  .error-foot {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-top: 8px;
  }
  .error-copy-btn {
    background: none;
    border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
    border-radius: 3px;
    padding: 2px 8px;
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-family: inherit;
    cursor: pointer;
    transition: background var(--motion-fast) var(--ease-out), color var(--motion-fast) var(--ease-out);
  }
  .error-copy-btn:hover:not(:disabled) {
    background: color-mix(in srgb, currentColor 8%, transparent);
    color: var(--text);
  }
  .error-copy-btn:disabled {
    opacity: 0.7;
    cursor: default;
  }
  .error-report-feedback {
    margin-top: 6px;
    font-size: var(--text-xs);
    color: var(--danger);
  }
  .error-raw-toggle {
    background: none;
    border: none;
    padding: 0;
    color: var(--text-subtle, var(--text-muted));
    font-size: var(--text-xs);
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .error-raw {
    margin-top: 6px;
    padding: 8px 10px;
    background: var(--surface-sunk, rgba(0,0,0,0.04));
    border-radius: var(--radius-sm, 4px);
    font-family: var(--font-mono, monospace);
    font-size: var(--text-xs);
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--text-muted);
  }

  .error-dismiss {
    flex-shrink: 0;
    background: none;
    border: none;
    padding: 0 4px;
    font-size: 18px;
    line-height: 1;
    color: var(--text-muted);
    cursor: pointer;
  }
  .error-dismiss:hover { color: var(--text); }
</style>
