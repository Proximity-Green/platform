<script lang="ts">
  import { goto } from '$app/navigation'
  import { KpiCard, PageHead, Badge, Button, Drawer, FieldGrid, Field, Workshop17Logo } from '$lib/components/ui'
  import { buildStats } from '$lib/generated/build-stats'
  import { marked } from 'marked'

  let { data } = $props()
  const p = data.platform

  type ChatMsg = { role: 'user' | 'assistant'; content: string }
  let messages = $state<ChatMsg[]>([])
  let input = $state('')
  let asking = $state(false)
  let askError = $state<string | null>(null)
  let chatEl = $state<HTMLDivElement | null>(null)
  let inputEl = $state<HTMLTextAreaElement | null>(null)

  let raiseOpen = $state(false)
  let raiseKind = $state<'feature_request' | 'note'>('feature_request')
  let raiseTitle = $state('')
  let raiseSummary = $state('')
  let raising = $state(false)
  let raiseError = $state<string | null>(null)

  $effect(() => {
    // Re-run whenever the conversation length or thinking state changes.
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    messages.length; asking
    if (chatEl) {
      requestAnimationFrame(() => {
        chatEl!.scrollTop = chatEl!.scrollHeight
      })
    }
  })

  const SUGGESTION_POOL = [
    'What are the six item families?',
    'How does the tracking-code cascade work?',
    'Where should new atomic multi-writes live?',
    'How do I add a new column to a family detail table?',
    'How many people are in the database?',
    'How many signed subscription lines do we have right now?',
    'Which organisations have the most active subs?',
    'How many items belong to each family?',
    'Which locations have no tracking codes yet?',
    'What items are on active subs but have no tracking codes?',
    'How do invoice_lines snapshot tracking codes?',
    'What does the membership-from-licence rule mean?',
    'Why are external IDs named "external_accounting_customer_id"?',
    'Why do we use snake_case + _at for timestamps?',
    'Which tables have the most rows?',
    'What\'s the difference between item_types and item families?',
    'Show me the columns on the persons table.',
    'How are tracking codes scoped per location?',
    'What\'s in the wallets / wallet_transactions model?',
    'How do I create a new item family end-to-end?',
    'What are the status values on subscription_lines?',
    'Which items don\'t belong to any tracking code?'
  ]

  function pickSuggestions(n: number): string[] {
    const copy = [...SUGGESTION_POOL]
    const out: string[] = []
    for (let i = 0; i < n && copy.length; i++) {
      const idx = Math.floor(Math.random() * copy.length)
      out.push(copy.splice(idx, 1)[0])
    }
    return out
  }

  const SUGGESTED = $state(pickSuggestions(4))

  async function ask(question?: string) {
    const q = (question ?? input).trim()
    if (!q || asking) return
    askError = null
    input = ''
    messages = [...messages, { role: 'user', content: q }]
    asking = true
    try {
      const res = await fetch('/api/admin/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages })
      })
      const body = await res.json()
      if (!res.ok || body.error) {
        askError = body.error ?? `HTTP ${res.status}`
        return
      }
      messages = [...messages, { role: 'assistant', content: body.answer }]
    } catch (e) {
      askError = e instanceof Error ? e.message : String(e)
    } finally {
      asking = false
      requestAnimationFrame(() => inputEl?.focus())
    }
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); ask() }
  }

  function clearChat() { messages = []; askError = null }

  function openSave(kind: 'feature_request' | 'note') {
    if (messages.length === 0) return
    const firstUser = messages.find((m) => m.role === 'user')?.content ?? ''
    raiseKind = kind
    raiseTitle = firstUser.slice(0, 80)
    raiseSummary = ''
    raiseError = null
    raiseOpen = true
  }

  async function submitRaise(e: Event) {
    e.preventDefault()
    const title = raiseTitle.trim()
    if (!title || raising) return
    raising = true
    raiseError = null
    try {
      const res = await fetch('/api/admin/feature-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          kind: raiseKind,
          summary: raiseSummary.trim() || null,
          transcript: messages
        })
      })
      const body = await res.json()
      if (!res.ok || body.error) {
        raiseError = body.message ?? body.error ?? `HTTP ${res.status}`
        return
      }
      raiseOpen = false
      await goto(body.href)
    } catch (err) {
      raiseError = err instanceof Error ? err.message : String(err)
    } finally {
      raising = false
    }
  }

  const taglines = [
    'Measure twice. Cut once. Ship weekly.',
    'A platform is a trust exercise with a database.',
    'Compound interest compounds commit by commit.',
    'Design the boring parts first — they carry the weight.',
    'Every schema started as an opinion with teeth.',
    'Small surfaces. Tight feedback. Good defaults.',
    'Sensible names outlive clever abstractions.',
    'The best feature is the one that doesn\'t need explaining.',
    'Ship the boring. Save the clever for the interesting.',
    'Boring is a feature. Quiet is a feature.',
    'Five good primitives beat fifty bespoke pages.'
  ]
  const tagline = $state(taglines[Math.floor(Math.random() * taglines.length)])

  const daysBuilding = (() => {
    const start = new Date(buildStats.firstCommitIso).getTime()
    const now = Date.now()
    return Math.max(1, Math.round((now - start) / (1000 * 60 * 60 * 24)))
  })()

  type DocCard = { href: string; title: string; sub: string }
  type DocGroup = { heading: string; cards: DocCard[] }
  const DOC_GROUPS: DocGroup[] = [
    {
      heading: 'Reference',
      cards: [
        { href: '/docs?p=architecture',    title: 'Architecture',       sub: 'Stack, layout, data flow, audit pipeline, deployment.' },
        { href: '/docs?p=conventions',     title: 'Conventions',        sub: 'Naming, services, UI primitives, migration rules.' },
        { href: '/docs?p=catalog',         title: 'Catalog & Tracking', sub: 'Items, families, tracking-code cascade.' },
        { href: '/docs?p=migration',       title: 'Migration',          sub: 'WSM → PG field-by-field map.' },
        { href: '/docs?p=benchmark',       title: 'Benchmark',          sub: 'Our schema vs Stripe / Chargebee / Xero / ERP.' },
        { href: '/docs?p=platform-school', title: 'Platform School',    sub: 'Learning material.' }
      ]
    },
    {
      heading: 'Integrations',
      cards: [
        { href: '/docs?p=sage', title: 'Sage', sub: 'Sage Business Cloud integration — meeting prep, legal-entity map, adapter scope.' }
      ]
    }
  ]

  const fmt = (n: number) => n.toLocaleString('en-US')
  const fmtK = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : fmt(n)

  const locPerDay = Math.round(buildStats.linesOfCode / daysBuilding)
  const commitsPerDay = Math.round((buildStats.commitCount / daysBuilding) * 10) / 10
</script>

<PageHead title="Admin" lede={tagline} />

<div class="hero">
  <div class="hero-grid" aria-hidden="true"></div>
  <div class="hero-glow hero-glow-a" aria-hidden="true"></div>
  <div class="hero-glow hero-glow-b" aria-hidden="true"></div>

  <div class="hero-topright">
    <div class="hero-logo-top"><Workshop17Logo /></div>
    <p class="hero-tagline">Human design, <span class="ai-mark">AI</span> built and enabled.</p>
    <p class="hero-version">version 26.1 · day {daysBuilding}</p>
  </div>

  <div class="hero-inner">
    <div class="hero-top">
      <div class="hero-chip">
        <span class="pulse-dot"></span>
        LIVE · {buildStats.branch}
      </div>
      <div class="hero-chip ghost">
        <span class="mono">#{buildStats.commitShort}</span>
      </div>
      <div class="hero-chip ghost">
        {buildStats.commitCount} commits
      </div>
    </div>

    <div class="hero-stats">
      <div class="hero-stat">
        <div class="hero-stat-value">{fmtK(buildStats.linesOfCode)}</div>
        <div class="hero-stat-label">lines of code</div>
      </div>
      <div class="hero-stat">
        <div class="hero-stat-value">{buildStats.svelteFiles + buildStats.tsFiles}</div>
        <div class="hero-stat-label">source files</div>
      </div>
      <div class="hero-stat">
        <div class="hero-stat-value">{buildStats.routes}</div>
        <div class="hero-stat-label">routes</div>
      </div>
      <div class="hero-stat">
        <div class="hero-stat-value">{buildStats.migrations}</div>
        <div class="hero-stat-label">migrations</div>
      </div>
    </div>

    <div class="hero-spark" aria-hidden="true">
      <svg viewBox="0 0 320 48" preserveAspectRatio="none">
        <defs>
          <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stop-color="#9fe8a7" stop-opacity="0.9" />
            <stop offset="100%" stop-color="#9fe8a7" stop-opacity="0.08" />
          </linearGradient>
        </defs>
        {#each Array(48) as _, i}
          {@const x = 2 + i * 6.6}
          {@const h = 5 + (Math.sin(i * 0.55) * 0.5 + 0.5) * 40}
          <rect x={x} y={48 - h} width="4" height={h} rx="2" fill="url(#sparkFill)" />
        {/each}
      </svg>
    </div>
  </div>
</div>

<section class="section ask">
  <div class="ask-head">
    <h2 class="section-title">Ask the platform</h2>
    {#if messages.length > 0}
      <div class="ask-head-actions">
        <button class="ask-clear" onclick={() => openSave('feature_request')} disabled={asking}>Raise as feature request</button>
        <button class="ask-clear" onclick={() => openSave('note')} disabled={asking}>Save as note</button>
        <button class="ask-clear" onclick={clearChat} disabled={asking}>Clear</button>
      </div>
    {/if}
  </div>
  <p class="section-sub">Claude Sonnet 4.6 with the platform's schema, conventions, and architecture in its head. Read-only — it describes, explains, suggests.</p>

  {#if messages.length === 0}
    <div class="suggest-grid">
      {#each SUGGESTED as s, i}
        <button class="suggest" onclick={() => ask(s)} disabled={asking} style="--i:{i}">
          <span class="suggest-num">0{i + 1}</span>
          <span class="suggest-text">{s}</span>
          <svg class="suggest-arrow" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path d="M2 8h11M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.9" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      {/each}
    </div>
  {:else}
    <div class="chat" bind:this={chatEl}>
      {#each messages as m, i}
        {@const isLatest = !asking && i === messages.length - 1}
        <div class="msg" data-role={m.role} class:is-latest={isLatest}>
          <div class="msg-who">
            <span class="avatar">{m.role === 'user' ? 'M' : 'C'}</span>
            {m.role === 'user' ? 'You' : 'Claude'}
            {#if isLatest && m.role === 'assistant'}
              <span class="latest-pip">latest</span>
            {/if}
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
      {#if asking}
        <div class="msg" data-role="assistant">
          <div class="msg-who">
            <span class="avatar">C</span>
            Claude
            <span class="latest-pip thinking">thinking…</span>
          </div>
          <div class="msg-body typing"><span></span><span></span><span></span></div>
        </div>
      {/if}
    </div>
  {/if}

  {#if askError}
    <div class="ask-error">Couldn't get a reply: {askError}</div>
  {/if}

  <div class="ask-input">
    <div class="ask-input-icon" aria-hidden="true">✶</div>
    <textarea
      placeholder="Ask about schema, conventions, architecture, or live data…"
      bind:value={input}
      bind:this={inputEl}
      onkeydown={onKey}
      rows="1"
      disabled={asking}
    ></textarea>
    <div class="ask-actions">
      <span class="ask-hint">⌘↵</span>
      <button
        type="button"
        class="ask-btn"
        onclick={() => ask()}
        disabled={asking || !input.trim()}
      >
        {#if asking}
          <span class="btn-dots"><span></span><span></span><span></span></span>
        {:else}
          <span>Ask</span>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M2 8h11M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        {/if}
      </button>
    </div>
  </div>
</section>

<Drawer
  open={raiseOpen}
  title={raiseKind === 'feature_request' ? 'Raise as feature request' : 'Save as note'}
  formId="raise-fr-form"
  onClose={() => (raiseOpen = false)}
>
  <form id="raise-fr-form" onsubmit={submitRaise}>
    <div class="kind-toggle">
      <label class="kind-opt" class:is-active={raiseKind === 'feature_request'}>
        <input type="radio" bind:group={raiseKind} value="feature_request" />
        <span class="kind-name">Feature request</span>
        <span class="kind-hint">Actionable ask, enters the triage / planned / done lifecycle and can be upvoted.</span>
      </label>
      <label class="kind-opt" class:is-active={raiseKind === 'note'}>
        <input type="radio" bind:group={raiseKind} value="note" />
        <span class="kind-name">Note</span>
        <span class="kind-hint">Just save the chat for reference. Can be promoted to a feature request later.</span>
      </label>
    </div>

    <FieldGrid cols={1}>
      <Field label="Title">
        <input type="text" bind:value={raiseTitle} required maxlength="160" class="raise-input" />
      </Field>
      <Field label="Summary — the problem or ask in plain language">
        <textarea bind:value={raiseSummary} rows="4" class="raise-textarea" placeholder="Optional. If blank, reviewers will read the chat below."></textarea>
      </Field>
    </FieldGrid>
    <p class="raise-hint">The full chat ({messages.length} messages) will be attached.</p>
    {#if raiseError}
      <p class="raise-error">{raiseError}</p>
    {/if}
  </form>
  {#snippet footer()}
    <Button variant="ghost" size="sm" onclick={() => (raiseOpen = false)} disabled={raising}>Cancel</Button>
    <Button type="submit" form="raise-fr-form" size="sm" loading={raising}>
      {raising ? 'Saving…' : raiseKind === 'feature_request' ? 'Raise' : 'Save'}
    </Button>
  {/snippet}
</Drawer>

<div class="feedback-strip">
  <span class="feedback-strip-label">Feedback</span>
  <a class="feedback-strip-link primary" href="/feature-requests" target="_blank" rel="noopener">Browse all ↗</a>
  <span class="feedback-strip-sep" aria-hidden="true">·</span>
  <a class="feedback-strip-link" href="/feature-requests?new=feature_request" target="_blank" rel="noopener">+ Raise request ↗</a>
  <a class="feedback-strip-link" href="/feature-requests?new=note" target="_blank" rel="noopener">+ Save note ↗</a>
</div>

<section class="section">
  <h2 class="section-title">Platform</h2>
  <p class="section-sub">What's in the database right now.</p>
  <div class="kpi-grid">
    <KpiCard label="Organisations"   value={fmt(p.organisations)} delta="tenants" tone="info" />
    <KpiCard label="People"          value={fmt(p.people)}        delta="records" tone="info" />
    <KpiCard label="Items"           value={fmt(p.items)}         delta="catalog" tone="info" />
    <KpiCard label="Item types"      value={fmt(p.itemTypes)}     delta="+ 6 families" tone="neutral" />
    <KpiCard label="Locations"       value={fmt(p.locations)}     delta="workspaces" tone="info" />
    <KpiCard label="Tracking codes"  value={fmt(p.trackingCodes)} delta="active" tone="info" />
    <KpiCard label="Subs signed"     value={fmt(p.subsSigned)}    delta={`of ${fmt(p.subsAll)} total`} tone="positive" />
    <KpiCard label="Invoices"        value={fmt(p.invoices)}      delta="all time" tone="info" />
    <KpiCard label="Licences"        value={fmt(p.licences)}      delta="issued" tone="info" />
    <KpiCard label="Wallets"         value={fmt(p.wallets)}       delta="org accounts" tone="info" />
  </div>
</section>

<section class="section">
  <h2 class="section-title">Build</h2>
  <p class="section-sub">Shaped by a sprint of weekend-and-evenings craft.</p>
  <div class="kpi-grid">
    <KpiCard label="Lines of code"   value={fmtK(buildStats.linesOfCode)} delta={`${locPerDay.toLocaleString()} per day`} tone="positive" />
    <KpiCard label="Svelte files"    value={fmt(buildStats.svelteFiles)}  delta="components + pages" tone="info" />
    <KpiCard label="TypeScript"      value={fmt(buildStats.tsFiles)}      delta=".ts files"           tone="info" />
    <KpiCard label="Routes"          value={fmt(buildStats.routes)}       delta="pages + endpoints"   tone="info" />
    <KpiCard label="UI components"   value={fmt(buildStats.components)}   delta="shared primitives"   tone="info" />
    <KpiCard label="Migrations"      value={fmt(buildStats.migrations)}   delta="schema steps"        tone="info" />
    <KpiCard label="SQL files"       value={fmt(buildStats.sqlFiles)}     delta="migrations + seeds"  tone="info" />
    <KpiCard label="Commits"         value={fmt(buildStats.commitCount)}  delta={`${commitsPerDay}/day`} tone="positive" />
    <KpiCard label="Days building"   value={fmt(daysBuilding)}            delta={`since ${new Date(buildStats.firstCommitIso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}`} tone="positive" />
    <KpiCard label="CSS files"       value={fmt(buildStats.cssFiles)}     delta="styles + tokens"     tone="info" />
  </div>
</section>

<section class="reports-section">
  <h2 class="section-title">
    Reported errors
    <a class="section-link" href="/reported-errors">Triage queue →</a>
  </h2>
  {#await data.reportedErrors}
    <p class="muted">Loading reports…</p>
  {:then reports}
    {#if !reports || (reports.openCount === 0 && reports.inProgressCount === 0 && reports.recent.length === 0)}
      <p class="muted">No open error reports. ✓</p>
    {:else}
      <div class="report-counters">
        <span class="rc rc-open">Open <strong>{reports.openCount}</strong></span>
        <span class="rc rc-progress">In progress <strong>{reports.inProgressCount}</strong></span>
      </div>
      {#if reports.recent.length > 0}
        <table class="reports-tbl">
          <thead>
            <tr>
              <th>When</th>
              <th>Code</th>
              <th>Title</th>
              <th>Reported by</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {#each reports.recent as r (r.id)}
              <tr onclick={() => goto(`/reported-errors?entry=${r.id}`)}>
                <td class="muted small">
                  {r.reported_at ? new Date(r.reported_at).toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                </td>
                <td class="mono small">{r.code}</td>
                <td class="ellipsis">{r.title}</td>
                <td class="muted small ellipsis">{r.reported_by_email ?? '—'}</td>
                <td>
                  <Badge tone={r.status === 'open' ? 'danger' : 'warning'}>
                    {r.status === 'in_progress' ? 'In progress' : 'Open'}
                  </Badge>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    {/if}
  {:catch}
    <p class="muted">Couldn't load reports.</p>
  {/await}
</section>

<section class="commits-section">
  <h2 class="section-title">Recent commits</h2>
  {#await data.commits}
    <p class="muted">Loading commits…</p>
  {:then commits}
    {#if !commits || commits.length === 0}
      <p class="muted">
        No commit data — set <span class="mono">GITHUB_TOKEN</span> in Coolify to enable this list.
      </p>
    {:else}
      <table class="commits-tbl">
        <thead>
          <tr>
            <th>Date</th>
            <th>Message</th>
            <th>Author</th>
            <th class="num">Files</th>
            <th class="num">+</th>
            <th class="num">−</th>
            <th>SHA</th>
          </tr>
        </thead>
        <tbody>
          {#each commits as c (c.sha)}
            <tr>
              <td class="muted small">
                {c.date ? new Date(c.date).toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
              </td>
              <td>{c.message}</td>
              <td class="muted small">{c.author}</td>
              <td class="num mono">{c.filesChanged ?? '—'}</td>
              <td class="num mono pos">{c.additions != null ? `+${c.additions.toLocaleString('en-US')}` : '—'}</td>
              <td class="num mono neg">{c.deletions != null ? `−${c.deletions.toLocaleString('en-US')}` : '—'}</td>
              <td class="mono small">
                <a href={c.url} target="_blank" rel="noopener">{c.short}</a>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  {/await}
</section>

<div class="footer-strip">
  <span class="muted">Generated {new Date(buildStats.generatedAt).toLocaleString('en-ZA')}</span>
  <span class="muted">·</span>
  <span class="muted">Stats refresh at every build.</span>
</div>

<style>
  .hero {
    position: relative;
    overflow: hidden;
    padding: var(--space-7, 40px) var(--space-7, 40px) var(--space-6);
    margin-bottom: var(--space-6);
    min-height: 200px;
    background: linear-gradient(135deg, #0f1f14 0%, #16301c 40%, #1d4128 100%);
    border-radius: 18px;
    box-shadow:
      0 8px 40px rgba(15,31,20,0.35),
      0 2px 6px rgba(0,0,0,0.15),
      inset 0 1px 0 rgba(255,255,255,0.06);
    color: #f2ebd5;
    isolation: isolate;
  }

  .hero-grid {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px);
    background-size: 36px 36px;
    background-position: -1px -1px;
    mask-image: radial-gradient(ellipse at 70% 40%, rgba(0,0,0,0.8), transparent 75%);
    pointer-events: none;
    z-index: 0;
  }
  .hero-glow {
    position: absolute;
    border-radius: 50%;
    filter: blur(60px);
    pointer-events: none;
    z-index: 0;
  }
  .hero-glow-a {
    width: 380px; height: 380px;
    top: -140px; right: -80px;
    background: radial-gradient(circle, #9fe8a7 0%, transparent 70%);
    opacity: 0.35;
    animation: drift-a 18s ease-in-out infinite alternate;
  }
  .hero-glow-b {
    width: 300px; height: 300px;
    bottom: -120px; left: 30%;
    background: radial-gradient(circle, #f0d97a 0%, transparent 70%);
    opacity: 0.20;
    animation: drift-b 22s ease-in-out infinite alternate;
  }
  @keyframes drift-a {
    from { transform: translate(0,0);      }
    to   { transform: translate(-40px,30px); }
  }
  @keyframes drift-b {
    from { transform: translate(0,0);      }
    to   { transform: translate(50px,-20px); }
  }

  .hero-inner {
    position: relative;
    z-index: 1;
  }

  .hero-top {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
    margin-bottom: var(--space-6);
  }
  .hero-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 12px;
    font-size: 11px;
    font-weight: var(--weight-bold);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    border-radius: 999px;
    background: rgba(159, 232, 167, 0.14);
    border: 1px solid rgba(159, 232, 167, 0.35);
    color: #c4f5cb;
    backdrop-filter: blur(6px);
  }
  .hero-chip.ghost {
    background: rgba(255,255,255,0.04);
    border-color: rgba(255,255,255,0.12);
    color: rgba(242,235,213,0.75);
    text-transform: none;
    letter-spacing: 0.02em;
    font-weight: var(--weight-medium);
  }
  .pulse-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: #9fe8a7;
    box-shadow:
      0 0 10px #9fe8a7,
      0 0 20px rgba(159,232,167,0.6);
    animation: dot-pulse 1.8s ease-in-out infinite;
  }
  @keyframes dot-pulse {
    0%, 100% { transform: scale(1);   opacity: 1;   }
    50%      { transform: scale(1.2); opacity: 0.6; }
  }

  .hero-topright {
    position: absolute;
    top: var(--space-5);
    right: var(--space-6);
    z-index: 2;
    max-width: 340px;
    text-align: right;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
    pointer-events: none;
  }
  .hero-logo-top {
    color: #f7f2dd;
    opacity: 0.92;
    filter: drop-shadow(0 2px 16px rgba(159,232,167,0.2));
  }
  .hero-logo-top :global(svg) {
    height: clamp(22px, 2.4vw, 32px);
    width: auto;
    display: block;
  }
  .hero-topright .hero-tagline { margin: 0; }
  .hero-topright .hero-version { margin: 0; }

  @media (max-width: 720px) {
    .hero-topright {
      position: static;
      max-width: none;
      align-items: flex-start;
      text-align: left;
      margin-bottom: var(--space-4);
    }
  }
  .accent-word {
    background: linear-gradient(135deg, #9fe8a7 0%, #d9f59d 50%, #f0d97a 100%);
    -webkit-background-clip: text;
            background-clip: text;
    -webkit-text-fill-color: transparent;
            color: transparent;
    font-style: italic;
  }

  .hero-tagline {
    margin: var(--space-2) 0 var(--space-1);
    color: rgba(242,235,213,0.92);
    font-size: clamp(1rem, 1.4vw, 1.25rem);
    font-weight: var(--weight-medium);
    letter-spacing: -0.005em;
  }
  .ai-mark {
    background: linear-gradient(135deg, #9fe8a7 0%, #f0d97a 100%);
    -webkit-background-clip: text;
            background-clip: text;
    -webkit-text-fill-color: transparent;
            color: transparent;
    font-weight: var(--weight-bold);
    font-style: italic;
  }
  .hero-version {
    margin: 0 0 var(--space-5);
    color: rgba(242,235,213,0.5);
    font-size: 12px;
    font-family: var(--font-mono, ui-monospace, SFMono-Regular, monospace);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .hero-stats {
    display: flex;
    align-items: flex-end;
    gap: var(--space-5);
    flex-wrap: wrap;
  }
  .hero-stat {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 90px;
  }
  .hero-stat-value {
    font-size: clamp(1.6rem, 2.4vw, 2.1rem);
    font-weight: var(--weight-bold);
    color: #f7f2dd;
    letter-spacing: -0.02em;
    line-height: 1;
  }
  .hero-stat-label {
    font-size: 10.5px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(159,232,167,0.7);
    font-weight: var(--weight-semibold);
  }
  .hero-spark {
    margin-top: var(--space-5);
    width: 100%;
    max-width: 560px;
    opacity: 0.9;
  }
  .hero-spark svg {
    width: 100%;
    height: 42px;
    display: block;
  }

  .mono { font-family: var(--font-mono); }
  .muted { color: var(--text-muted); }

  .section { margin-bottom: var(--space-6); }
  .section-title {
    font-size: var(--text-lg);
    font-weight: var(--weight-bold);
    color: var(--text);
    margin: 0 0 var(--space-1);
  }
  .section-sub {
    color: var(--text-muted);
    font-size: var(--text-sm);
    margin: 0 0 var(--space-3);
  }

  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--space-3);
  }

  .footer-strip {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    padding-top: var(--space-4);
    border-top: 1px dashed var(--border);
    font-size: var(--text-xs);
  }

  .commits-section { margin-top: var(--space-6); }
  .reports-section { margin-top: var(--space-6); }
  .section-link {
    margin-left: var(--space-3);
    font-size: var(--text-xs);
    font-weight: var(--weight-regular);
    color: var(--accent);
    text-decoration: none;
    text-transform: none;
    letter-spacing: 0;
  }
  .section-link:hover { text-decoration: underline; }
  .report-counters {
    display: flex;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }
  .rc {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    border-radius: 999px;
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    border: 1px solid var(--border);
    color: var(--text-muted);
  }
  .rc strong {
    font-variant-numeric: tabular-nums;
    color: var(--text);
  }
  .rc-open { border-color: color-mix(in srgb, var(--danger) 35%, var(--border)); }
  .rc-progress { border-color: color-mix(in srgb, var(--warning) 35%, var(--border)); }
  .reports-tbl {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
  }
  .reports-tbl thead th {
    text-align: left;
    padding: 6px 10px;
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
    font-weight: var(--weight-medium);
  }
  .reports-tbl tbody td {
    padding: 6px 10px;
    border-bottom: 1px solid var(--border);
    vertical-align: middle;
  }
  .reports-tbl tbody tr { cursor: pointer; }
  .reports-tbl tbody tr:hover { background: var(--surface-sunk); }
  .reports-tbl .ellipsis {
    max-width: 360px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .commits-tbl {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    overflow: hidden;
    font-size: var(--text-sm);
    background: var(--surface);
  }
  .commits-tbl th {
    text-align: left;
    padding: 8px 12px;
    background: var(--surface-sunk, #fafafa);
    border-bottom: 1px solid var(--border);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--label-color);
    font-weight: var(--weight-semibold);
    white-space: nowrap;
  }
  .commits-tbl td {
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
    vertical-align: middle;
  }
  .commits-tbl tbody tr:last-child td { border-bottom: none; }
  .commits-tbl tbody tr:hover { background: var(--surface-sunk, #fafafa); }
  .commits-tbl .num { text-align: right; }
  .commits-tbl .pos { color: var(--success, #2d6a35); }
  .commits-tbl .neg { color: var(--danger, #c0392b); }
  .commits-tbl .mono { font-family: var(--font-mono); }
  .commits-tbl .small { font-size: var(--text-xs); }
  .commits-tbl .muted { color: var(--text-muted); }
  .commits-tbl a {
    color: var(--accent);
    text-decoration: none;
    border-bottom: 1px dashed transparent;
  }
  .commits-tbl a:hover { border-bottom-color: var(--accent); }

  .ask-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    margin-bottom: var(--space-1);
  }
  .ask-head .section-title { margin: 0; }
  .ask-clear {
    background: none;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 2px 10px;
    font-size: var(--text-xs);
    color: var(--text-muted);
    cursor: pointer;
  }
  .ask-clear:hover:not(:disabled) { color: var(--text); border-color: var(--text-muted); }
  .ask-clear:disabled { opacity: 0.5; cursor: not-allowed; }
  .ask-head-actions { display: inline-flex; gap: var(--space-2); align-items: center; }

  .raise-input,
  .raise-textarea {
    width: 100%;
    padding: var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-family: inherit;
    font-size: var(--text-sm);
    background: var(--surface);
    color: var(--text);
  }
  .raise-textarea { resize: vertical; min-height: 80px; }
  .raise-hint { font-size: var(--text-xs); color: var(--text-muted); margin: var(--space-3) 0 0; }
  .raise-error { font-size: var(--text-xs); color: var(--danger); margin: var(--space-2) 0 0; }

  .feedback-strip {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    margin: var(--space-3) 0 var(--space-6);
    background: var(--surface-sunk, var(--surface-hover));
    border: 1px dashed var(--border);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
  }
  .feedback-strip-label {
    font-size: 10px;
    font-weight: var(--weight-semibold);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--text-muted);
    margin-right: var(--space-1);
  }
  .feedback-strip-link {
    color: var(--text);
    text-decoration: none;
    padding: 2px 0;
    font-weight: var(--weight-medium);
  }
  .feedback-strip-link:hover { color: var(--accent); text-decoration: underline; }
  .feedback-strip-link.primary { color: var(--accent); font-weight: var(--weight-semibold); }
  .feedback-strip-sep { color: var(--text-muted); }

  .kind-toggle {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }
  .kind-opt {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    cursor: pointer;
    background: var(--surface);
    transition: all 150ms;
  }
  .kind-opt input { display: none; }
  .kind-opt:hover { border-color: var(--text-muted); }
  .kind-opt.is-active {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 10%, var(--surface));
  }
  .kind-name {
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    color: var(--text);
  }
  .kind-hint {
    font-size: var(--text-xs);
    color: var(--text-muted);
    line-height: 1.4;
  }

  .suggest-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: var(--space-3);
    margin-bottom: var(--space-3);
  }
  .suggest {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 14px;
    align-items: center;
    text-align: left;
    padding: 14px 16px;
    background: #ffffff;
    border: 1px solid #e4e4de;
    border-radius: 14px;
    color: #1e1e1e;
    font-family: inherit;
    cursor: pointer;
    box-shadow:
      0 2px 10px rgba(0,0,0,0.04),
      0 1px 2px rgba(0,0,0,0.03);
    transition:
      transform 160ms ease,
      border-color 160ms ease,
      box-shadow 160ms ease,
      background 160ms ease;
    animation: suggest-in 360ms ease both;
    animation-delay: calc(var(--i, 0) * 60ms);
  }
  @keyframes suggest-in {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .suggest-num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: #1e1e1e;
    color: #ffffff;
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0;
    transition: background 160ms, transform 160ms;
  }
  .suggest-text {
    font-size: 14.5px;
    font-weight: 600;
    line-height: 1.4;
    color: #1e1e1e;
    letter-spacing: -0.005em;
  }
  .suggest-arrow {
    color: #a8b0ac;
    transition: color 160ms, transform 160ms;
    flex-shrink: 0;
  }
  .suggest:hover:not(:disabled) {
    transform: translateY(-2px);
    border-color: var(--accent);
    background: linear-gradient(135deg,
      color-mix(in srgb, var(--accent) 10%, #ffffff) 0%,
      #ffffff 60%);
    box-shadow:
      0 6px 22px rgba(74,122,78,0.18),
      0 2px 4px rgba(0,0,0,0.04);
  }
  .suggest:hover:not(:disabled) .suggest-num {
    background: var(--accent);
    transform: scale(1.06);
  }
  .suggest:hover:not(:disabled) .suggest-arrow {
    color: var(--accent);
    transform: translateX(3px);
  }
  .suggest:active:not(:disabled) { transform: translateY(-1px); }
  .suggest:disabled { opacity: 0.5; cursor: not-allowed; }

  .chat {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    margin-bottom: var(--space-3);
    max-height: 640px;
    overflow-y: auto;
    padding: var(--space-5);
    background: #ffffff;
    border: 1px solid var(--border);
    border-radius: 14px;
    box-shadow: 0 2px 12px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.03);
  }

  .msg {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    transition: transform 200ms ease;
  }
  .msg-who {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-xs);
    font-weight: var(--weight-bold);
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .avatar {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: var(--weight-bold);
    letter-spacing: 0;
    color: #fff;
  }
  .msg[data-role='user']      .avatar { background: var(--accent); }
  .msg[data-role='assistant'] .avatar { background: #1e1e1e; }

  .msg[data-role='user'] .msg-who      { color: var(--accent); }
  .msg[data-role='assistant'] .msg-who { color: #1e1e1e; }

  .latest-pip {
    margin-left: 4px;
    padding: 2px 8px;
    font-size: 10px;
    letter-spacing: 0.08em;
    font-weight: var(--weight-bold);
    color: #fff;
    background: var(--accent);
    border-radius: 999px;
    text-transform: uppercase;
    animation: pip-in 300ms ease;
  }
  .latest-pip.thinking {
    background: #f0ad4e;
    animation: pulse-pip 1.4s ease-in-out infinite;
  }
  @keyframes pip-in {
    from { transform: scale(0.6); opacity: 0; }
    to   { transform: scale(1);   opacity: 1; }
  }
  @keyframes pulse-pip {
    0%, 100% { opacity: 1; }
    50%      { opacity: 0.55; }
  }

  .msg-body {
    font-size: 14.5px;
    line-height: 1.55;
    color: #1e1e1e;
    font-family: var(--font-body, system-ui, -apple-system, 'Segoe UI', sans-serif);
  }
  .msg-body :global(h1),
  .msg-body :global(h2),
  .msg-body :global(h3),
  .msg-body :global(h4) {
    font-family: inherit;
    font-weight: 600;
    color: #0f1f14;
    letter-spacing: -0.005em;
    line-height: 1.3;
    margin: var(--space-4) 0 var(--space-2);
  }
  .msg-body :global(h1):first-child,
  .msg-body :global(h2):first-child,
  .msg-body :global(h3):first-child,
  .msg-body :global(h4):first-child { margin-top: 0; }
  .msg-body :global(h1) { font-size: 1.15rem; }
  .msg-body :global(h2) {
    font-size: 1.02rem;
    padding-bottom: 4px;
    border-bottom: 1px solid #eee;
  }
  .msg-body :global(h3) { font-size: 0.95rem; }
  .msg-body :global(h4) { font-size: 0.9rem; color: #444; }
  .msg-body :global(strong) { font-weight: 600; color: #0f1f14; }
  .msg-body :global(em)     { font-style: italic; color: #444; }
  .msg-body :global(hr) {
    border: none;
    border-top: 1px solid #eee;
    margin: var(--space-4) 0;
  }
  .msg-body :global(table) {
    width: 100%;
    border-collapse: collapse;
    margin: var(--space-2) 0;
    font-size: 13.5px;
  }
  .msg-body :global(th),
  .msg-body :global(td) {
    padding: 6px 10px;
    text-align: left;
    border-bottom: 1px solid #eee;
    vertical-align: top;
  }
  .msg-body :global(th) {
    font-weight: 600;
    color: #555;
    background: #f7f7f3;
  }
  .msg-body :global(blockquote) {
    margin: var(--space-2) 0;
    padding: var(--space-2) var(--space-3);
    border-left: 3px solid #ddd;
    color: #444;
    background: #f7f7f3;
    border-radius: 0 6px 6px 0;
  }
  .msg-body :global(a) {
    color: var(--accent);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .msg[data-role='user'] .msg-body {
    padding: var(--space-3) var(--space-4);
    background: linear-gradient(135deg,
      color-mix(in srgb, var(--accent) 16%, #ffffff) 0%,
      color-mix(in srgb, var(--accent) 8%, #ffffff) 100%);
    border-left: 3px solid var(--accent);
    border-radius: 10px;
    font-weight: var(--weight-medium);
  }
  .msg[data-role='assistant'] .msg-body {
    padding: var(--space-3) var(--space-4);
    background: #fafaf7;
    border-radius: 10px;
    border: 1px solid #ececec;
  }

  .msg.is-latest[data-role='assistant'] .msg-body {
    background: #fffef5;
    border-color: #f0d97a;
    box-shadow: 0 2px 16px rgba(240,217,122,0.18);
    animation: latest-glow 600ms ease;
  }
  @keyframes latest-glow {
    from { box-shadow: 0 0 0 4px rgba(240,217,122,0.35), 0 2px 16px rgba(240,217,122,0.18); }
    to   { box-shadow: 0 0 0 0   rgba(240,217,122,0),    0 2px 16px rgba(240,217,122,0.18); }
  }
  .msg-body :global(p) { margin: 0 0 var(--space-2); }
  .msg-body :global(p:last-child) { margin-bottom: 0; }
  .msg-body :global(ul), .msg-body :global(ol) { margin: 0 0 var(--space-2); padding-left: 1.25rem; }
  .msg-body :global(pre) {
    background: #1e2922;
    color: #e8e3c8;
    padding: 12px 14px;
    border-radius: 8px;
    overflow-x: auto;
    font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 12.5px;
    line-height: 1.5;
    margin: var(--space-2) 0;
  }
  .msg-body :global(code) {
    font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 0.88em;
    background: #eef1ea;
    color: #2a4032;
    padding: 1px 6px;
    border-radius: 4px;
    white-space: nowrap;
  }
  .msg-body :global(pre code) {
    background: none;
    color: inherit;
    padding: 0;
    white-space: pre;
  }

  .typing { display: inline-flex; gap: 4px; padding: var(--space-2) 0; }
  .typing span {
    width: 6px; height: 6px; border-radius: 50%;
    background: var(--text-muted);
    animation: bounce 1.2s infinite ease-in-out;
  }
  .typing span:nth-child(2) { animation-delay: 0.2s; }
  .typing span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes bounce {
    0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
    30%           { transform: translateY(-4px); opacity: 1; }
  }

  .ask-error {
    padding: var(--space-2) var(--space-3);
    background: color-mix(in srgb, var(--danger) 10%, var(--surface));
    border: 1px solid color-mix(in srgb, var(--danger) 30%, var(--border));
    border-radius: var(--radius-sm);
    color: var(--danger);
    font-size: var(--text-sm);
    margin-bottom: var(--space-3);
  }

  .ask-input {
    display: flex;
    gap: var(--space-3);
    align-items: center;
    padding: 10px 12px 10px 16px;
    background: #ffffff;
    border: 1px solid #e4e4de;
    border-radius: 14px;
    box-shadow:
      0 2px 10px rgba(0,0,0,0.04),
      0 1px 2px rgba(0,0,0,0.04);
    transition: border-color 180ms, box-shadow 180ms;
  }
  .ask-input:focus-within {
    border-color: var(--accent);
    box-shadow:
      0 0 0 4px color-mix(in srgb, var(--accent) 14%, transparent),
      0 2px 10px rgba(0,0,0,0.06);
  }
  .ask-input-icon {
    font-size: 18px;
    color: var(--accent);
    line-height: 1;
    flex-shrink: 0;
  }
  .ask-input textarea {
    flex: 1;
    padding: 10px 4px;
    border: none;
    outline: none;
    background: transparent;
    color: #1e1e1e;
    font-family: inherit;
    font-size: 15px;
    line-height: 1.5;
    resize: none;
    min-height: 24px;
    max-height: 160px;
  }
  .ask-input textarea::placeholder { color: #9aa5a0; }
  .ask-input textarea:disabled { opacity: 0.6; }

  .ask-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }
  .ask-hint {
    font-family: var(--font-mono, ui-monospace, SFMono-Regular, monospace);
    font-size: 11px;
    color: #9aa5a0;
    padding: 3px 7px;
    border: 1px solid #e4e4de;
    border-radius: 5px;
    background: #f8f8f4;
  }
  .ask-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 9px 18px;
    background: linear-gradient(135deg, var(--accent) 0%, #3a6a3e 100%);
    color: #ffffff;
    font-size: 14px;
    font-weight: 600;
    border: none;
    border-radius: 10px;
    cursor: pointer;
    transition: transform 120ms, box-shadow 120ms, filter 120ms;
    box-shadow:
      0 1px 2px rgba(15,31,20,0.08),
      inset 0 1px 0 rgba(255,255,255,0.18);
  }
  .ask-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    filter: brightness(1.08);
    box-shadow:
      0 4px 14px rgba(74,122,78,0.35),
      inset 0 1px 0 rgba(255,255,255,0.2);
  }
  .ask-btn:active:not(:disabled) { transform: translateY(0); }
  .ask-btn:disabled {
    cursor: not-allowed;
    opacity: 0.45;
    filter: saturate(0.5);
  }
  .ask-btn svg { opacity: 0.95; }

  .btn-dots {
    display: inline-flex;
    gap: 3px;
    align-items: center;
    padding: 2px 0;
  }
  .btn-dots span {
    width: 5px; height: 5px; border-radius: 50%;
    background: #fff;
    animation: btn-bounce 1.1s infinite ease-in-out;
  }
  .btn-dots span:nth-child(2) { animation-delay: 0.15s; }
  .btn-dots span:nth-child(3) { animation-delay: 0.3s; }
  @keyframes btn-bounce {
    0%, 60%, 100% { opacity: 0.4; }
    30%           { opacity: 1; }
  }
</style>
