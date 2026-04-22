<script lang="ts">
  import { KpiCard, PageHead, Badge } from '$lib/components/ui'
  import { buildStats } from '$lib/generated/build-stats'

  let { data } = $props()
  const p = data.platform

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

  const fmt = (n: number) => n.toLocaleString('en-US')
  const fmtK = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : fmt(n)

  const locPerDay = Math.round(buildStats.linesOfCode / daysBuilding)
  const commitsPerDay = Math.round((buildStats.commitCount / daysBuilding) * 10) / 10
</script>

<PageHead title="Admin" lede={tagline} />

<div class="hero">
  <div class="hero-left">
    <div class="pulse-wrap">
      <div class="pulse"></div>
      <div class="pulse-core"></div>
    </div>
    <div>
      <div class="hero-eyebrow">Live</div>
      <div class="hero-title">Proximity Green platform — day {daysBuilding}</div>
      <div class="hero-sub">
        <Badge tone="info">{buildStats.branch}</Badge>
        <span class="mono">{buildStats.commitShort}</span>
        <span class="muted">· {buildStats.commitCount} commits · {locPerDay.toLocaleString()} loc/day</span>
      </div>
    </div>
  </div>
  <div class="hero-right">
    <svg viewBox="0 0 120 60" class="spark" aria-hidden="true">
      {#each Array(20) as _, i}
        {@const x = 6 + i * 6}
        {@const h = 10 + (Math.sin(i * 0.7) * 0.5 + 0.5) * 40}
        <rect x={x} y={60 - h} width="4" height={h} rx="1.5" />
      {/each}
    </svg>
  </div>
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

<div class="footer-strip">
  <span class="muted">Generated {new Date(buildStats.generatedAt).toLocaleString('en-ZA')}</span>
  <span class="muted">·</span>
  <span class="muted">Stats refresh at every build.</span>
</div>

<style>
  .hero {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-5) var(--space-6);
    margin-bottom: var(--space-6);
    background: linear-gradient(135deg,
      color-mix(in srgb, var(--accent) 18%, var(--surface)) 0%,
      var(--surface) 60%);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg, 12px);
    box-shadow: var(--shadow-sm);
  }

  .hero-left {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }

  .pulse-wrap {
    position: relative;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .pulse {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: var(--accent, #4a7a4e);
    opacity: 0.35;
    animation: pulse 2s ease-in-out infinite;
  }
  .pulse-core {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--accent, #4a7a4e);
    box-shadow: 0 0 12px color-mix(in srgb, var(--accent) 70%, transparent);
  }
  @keyframes pulse {
    0%, 100% { transform: scale(1); opacity: 0.35; }
    50%      { transform: scale(1.6); opacity: 0; }
  }

  .hero-eyebrow {
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--accent);
    margin-bottom: 2px;
  }
  .hero-title {
    font-size: var(--text-xl);
    font-weight: var(--weight-bold);
    color: var(--text);
    margin-bottom: 4px;
  }
  .hero-sub {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
    font-size: var(--text-sm);
  }
  .mono { font-family: var(--font-mono); }
  .muted { color: var(--text-muted); }

  .hero-right { flex-shrink: 0; opacity: 0.75; }
  .spark {
    width: 140px;
    height: 60px;
    display: block;
  }
  .spark rect {
    fill: var(--accent);
    opacity: 0.6;
  }
  .spark rect:nth-child(odd)  { opacity: 0.85; }
  .spark rect:nth-child(3n)   { opacity: 0.4; }

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
</style>
