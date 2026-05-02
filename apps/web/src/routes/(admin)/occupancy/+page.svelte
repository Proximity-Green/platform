<script lang="ts">
  import { Card, Badge, Notice, KpiCard, PageHead } from '$lib/components/ui'

  let { data } = $props()
  const report = $derived(data.report as any)

  const months = $derived(report.months as { iso: string; label: string }[])
  const network = $derived(report.network)
  const locations = $derived(report.locations as any[])
  const schemaGaps = $derived(report.schema_gaps as string[])

  // ── Active tab ─────────────────────────────────────────────────────
  type TabId = 'grid' | 'kpis' | 'memberships'
  let activeTab = $state<TabId>('grid')

  function fmtMoney(n: number | null | undefined): string {
    if (n == null || !Number.isFinite(Number(n))) return '—'
    return Math.round(Number(n)).toLocaleString('en-ZA')
  }
  function fmtPct(p: number | null | undefined): string {
    if (p == null || !Number.isFinite(Number(p))) return '—'
    return `${Math.round(Number(p) * 100)}%`
  }
  function fmtSqm(n: number | null | undefined): string {
    if (n == null || !Number.isFinite(Number(n))) return '—'
    return `${Math.round(Number(n)).toLocaleString('en-ZA')} m²`
  }

  function pctTone(p: number | null): 'positive' | 'neutral' | 'warning' | 'info' {
    if (p == null) return 'info'
    if (p >= 0.85) return 'positive'
    if (p >= 0.6)  return 'neutral'
    return 'warning'
  }
</script>

<PageHead
  title="Occupancy"
  lede="Inventory lens — what's sold, what's unsold, where the floor pressure is. Mirrors the WSM Location Detail report; adds vacancy highlighting, prospect cells, KPI rollups, and membership demand."
/>

<div class="kpi-strip">
  <KpiCard label="Offices total" value={String(network.total_offices)} />
  <KpiCard label="Sold" value={String(network.active_offices)} tone="positive" delta={network.pct_offices_sold != null ? `${Math.round(network.pct_offices_sold * 100)}% sold` : undefined} />
  <KpiCard label="Vacant" value={String(network.vacant_offices)} tone={network.vacant_offices > 0 ? 'warning' : 'positive'} />
  <KpiCard label="Projected revenue" value={`R ${fmtMoney(network.projected_revenue)}`} tone="info" />
  <KpiCard label="Business case" value={`R ${fmtMoney(network.total_business_case)}`} delta={network.pct_business_case_achieved != null ? `${Math.round(network.pct_business_case_achieved * 100)}% of BC` : undefined} tone={pctTone(network.pct_business_case_achieved)} />
  <KpiCard label="Size occupied" value={fmtSqm(network.occupied_size_sqm)} delta={network.pct_size_occupied != null ? `${Math.round(network.pct_size_occupied * 100)}% of ${fmtSqm(network.total_size_sqm)}` : undefined} tone={pctTone(network.pct_size_occupied)} />
  <KpiCard label="Membership subs" value={String(network.membership_subs)} delta={`${network.membership_seats} seats`} />
</div>

{#if schemaGaps?.length}
  <Notice tone="warning">
    <p><strong>Data layer is incomplete.</strong> The numbers below are a sketch. To make this report production-grade, the schema needs:</p>
    <ul>
      {#each schemaGaps as gap}
        <li><code>{gap}</code></li>
      {/each}
    </ul>
  </Notice>
{/if}

<div class="tabs">
  <button class:active={activeTab === 'grid'}        onclick={() => activeTab = 'grid'}>By item × month</button>
  <button class:active={activeTab === 'kpis'}        onclick={() => activeTab = 'kpis'}>KPIs (legend A1–D7)</button>
  <button class:active={activeTab === 'memberships'} onclick={() => activeTab = 'memberships'}>Memberships</button>
</div>

<!-- ─────────────────────── BY ITEM × MONTH ─────────────────────── -->
{#if activeTab === 'grid'}
  <section class="grid-view">
    {#each locations as loc}
      <Card padding="md">
        <header class="loc-head">
          <h2>{loc.short_name ?? loc.location_name}</h2>
          <span class="muted small">{loc.location_name}</span>
          <span class="loc-summary">
            {loc.kpis.active_offices} / {loc.kpis.total_offices} sold
            {#if loc.kpis.pct_offices_sold != null}
              · <Badge tone={pctTone(loc.kpis.pct_offices_sold) === 'positive' ? 'success' : pctTone(loc.kpis.pct_offices_sold) === 'warning' ? 'warning' : 'info'}>{Math.round(loc.kpis.pct_offices_sold * 100)}%</Badge>
            {/if}
            · R{fmtMoney(loc.kpis.projected_revenue)}/mo
            {#if loc.kpis.pct_business_case_achieved != null}
              · {fmtPct(loc.kpis.pct_business_case_achieved)} of BC
            {/if}
          </span>
        </header>

        {#if loc.rows.length === 0}
          <p class="empty">No space-family items at this location.</p>
        {:else}
          <div class="grid-wrap">
            <table class="grid">
              <thead>
                <tr>
                  <th class="sticky">Item</th>
                  <th class="sticky">Tenant</th>
                  <th class="num">m²</th>
                  <th class="num">Cap</th>
                  {#each months as m}
                    <th class="month">{m.label}</th>
                  {/each}
                  <th class="num">Forward total</th>
                </tr>
              </thead>
              <tbody>
                {#each loc.rows as r}
                  {@const forwardSum = r.cells.reduce((s: number, c: any) => s + (c.rate ?? 0), 0)}
                  {@const tenant = r.cells.find((c: any) => c.org_name)?.org_name ?? null}
                  <tr>
                    <td class="item">
                      <div class="item-name">{r.item_name}</div>
                      <div class="item-type muted small">{r.type_name}</div>
                    </td>
                    <td class="tenant">{tenant ?? ''}</td>
                    <td class="num">{r.area_sqm != null ? Math.round(r.area_sqm) : '—'}</td>
                    <td class="num">{r.capacity ?? '—'}</td>
                    {#each r.cells as c}
                      <td class="cell cell-{c.state}" title={c.org_name ? `${c.org_name} — ${c.org_status ?? ''}` : 'Vacant'}>
                        {#if c.state === 'sold'}
                          <span class="rate">{fmtMoney(c.rate)}</span>
                        {:else if c.state === 'prospect'}
                          <span class="rate">{fmtMoney(c.rate)}</span>
                          <span class="p-flag">P</span>
                        {/if}
                      </td>
                    {/each}
                    <td class="num bold">{fmtMoney(forwardSum)}</td>
                  </tr>
                {/each}
                <tr class="total-row">
                  <td colspan={4}>Total</td>
                  {#each months as _, i}
                    {@const monthTotal = loc.rows.reduce((s: number, r: any) => s + (r.cells[i]?.rate ?? 0), 0)}
                    <td class="num">{fmtMoney(monthTotal)}</td>
                  {/each}
                  <td class="num bold">{fmtMoney(loc.kpis.forward_revenue_total)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="legend">
            <span class="swatch swatch-sold"></span> Sold (active org)
            <span class="swatch swatch-prospect"></span> Prospect (P) — sub exists, org not yet active
            <span class="swatch swatch-vacant"></span> Vacant
          </div>
        {/if}
      </Card>
    {/each}
  </section>
{/if}

<!-- ─────────────────────── KPIs ─────────────────────── -->
{#if activeTab === 'kpis'}
  <section class="kpi-view">
    {#each locations as loc}
      <Card padding="md">
        <header class="loc-head">
          <h2>{loc.short_name ?? loc.location_name}</h2>
          <span class="muted small">{loc.location_name}</span>
        </header>
        <table class="report">
          <thead>
            <tr><th>KPI</th><th class="num">Value</th><th>Notes</th></tr>
          </thead>
          <tbody>
            <tr><td class="kpi-id">A1</td><td class="num">{fmtPct(loc.kpis.pct_offices_sold)}</td><td>% of offices sold (B1 / B3)</td></tr>
            <tr><td class="kpi-id">A2</td><td class="num">{fmtPct(loc.kpis.pct_business_case_achieved)}</td><td>% of business-case revenue achieved (C1 / C2)</td></tr>
            <tr><td class="kpi-id">B1</td><td class="num">{loc.kpis.active_offices}</td><td>Active (sold) offices</td></tr>
            <tr><td class="kpi-id">B2</td><td class="num">{loc.kpis.vacant_offices}</td><td>Vacant offices</td></tr>
            <tr><td class="kpi-id">B3</td><td class="num">{loc.kpis.total_offices}</td><td>Total offices</td></tr>
            <tr><td class="kpi-id">C1</td><td class="num">R {fmtMoney(loc.kpis.projected_revenue)}</td><td>Projected revenue (sum of active sub rates)</td></tr>
            <tr><td class="kpi-id">C2</td><td class="num">R {fmtMoney(loc.kpis.total_business_case)}</td><td>Total business case (Σ start_price_per_m² × area_sqm)</td></tr>
            <tr><td class="kpi-id">C3</td><td class="num">R {fmtMoney(loc.kpis.achievable_revenue)}</td><td>Achievable revenue (Σ items.base_rate — list price)</td></tr>
            <tr><td class="kpi-id">D1</td><td class="num">{fmtSqm(loc.kpis.total_size_sqm)}</td><td>Total office size</td></tr>
            <tr><td class="kpi-id">D2</td><td class="num">{fmtSqm(loc.kpis.occupied_size_sqm)}</td><td>Occupied size</td></tr>
            <tr><td class="kpi-id">D3</td><td class="num">{fmtSqm(loc.kpis.vacant_size_sqm)}</td><td>Vacant size</td></tr>
            <tr><td class="kpi-id">D4</td><td class="num">{fmtPct(loc.kpis.pct_size_occupied)}</td><td>Ratio of size occupied (D2 / D1)</td></tr>
            <tr><td class="kpi-id">D5</td><td class="num">R {fmtMoney(loc.kpis.avg_rate_per_sqm_sold)}</td><td>Avg rate per m² sold</td></tr>
            <tr><td class="kpi-id">D6</td><td class="num">R {fmtMoney(loc.kpis.price_per_seat_sold)}</td><td>Avg price per seat sold (capacity-weighted)</td></tr>
            <tr><td class="kpi-id">D7</td><td class="num">{loc.kpis.total_desk_capacity}</td><td>Total desk capacity</td></tr>
          </tbody>
        </table>
      </Card>
    {/each}
  </section>
{/if}

<!-- ─────────────────────── MEMBERSHIPS ─────────────────────── -->
{#if activeTab === 'memberships'}
  <section class="memberships-view">
    {#each locations as loc}
      <Card padding="md">
        <header class="loc-head">
          <h2>{loc.short_name ?? loc.location_name}</h2>
          <span class="muted small">{loc.location_name}</span>
        </header>

        {#if loc.membership.sub_count === 0}
          <p class="empty">No active membership subs at this location.</p>
        {:else}
          <table class="report">
            <thead>
              <tr>
                <th>Occupancy type</th>
                <th class="num">Rooted</th>
                <th class="num">Occasional</th>
                <th class="num">Subs</th>
                <th class="num">Seats</th>
              </tr>
            </thead>
            <tbody>
              {#each loc.membership.buckets as b}
                {@const subs = b.rooted + b.occasional}
                {#if subs > 0}
                  <tr>
                    <td class="cap">{b.occupancy_type}</td>
                    <td class="num">{b.rooted}</td>
                    <td class="num">{b.occasional}</td>
                    <td class="num">{subs}</td>
                    <td class="num">{b.total_members}</td>
                  </tr>
                {/if}
              {/each}
              <tr class="total-row">
                <td>Total</td>
                <td class="num">{loc.membership.buckets.reduce((s: number, b: any) => s + b.rooted, 0)}</td>
                <td class="num">{loc.membership.buckets.reduce((s: number, b: any) => s + b.occasional, 0)}</td>
                <td class="num">{loc.membership.sub_count}</td>
                <td class="num">{loc.membership.total_seats}</td>
              </tr>
            </tbody>
          </table>
          <p class="caption muted small">
            <strong>Rooted</strong> = no monthly credit cap (full presence). <strong>Occasional</strong> = capped credits/mo (fractional pressure).
            V0 splits the count; once <code>space_pressure_factor</code> exists, weighted demand can be compared to <code>membership_capacity_target</code>.
          </p>
        {/if}
      </Card>
    {/each}
  </section>
{/if}

<style>
  .kpi-strip {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: var(--space-3);
    margin-bottom: var(--space-5);
  }

  .tabs {
    display: flex;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
    border-bottom: 1px solid var(--border);
  }
  .tabs button {
    background: transparent;
    border: none;
    padding: 8px 16px;
    cursor: pointer;
    color: var(--text-muted);
    border-bottom: 2px solid transparent;
    font-size: var(--text-sm);
  }
  .tabs button:hover { color: var(--text); }
  .tabs button.active {
    color: var(--text);
    border-bottom-color: var(--accent);
  }

  .grid-view, .kpi-view, .memberships-view {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .loc-head {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
    border-bottom: 1px solid var(--border);
    padding-bottom: var(--space-2);
    flex-wrap: wrap;
  }
  .loc-head h2 { margin: 0; font-size: var(--text-lg); }
  .loc-summary {
    margin-left: auto;
    font-size: var(--text-sm);
    color: var(--text-muted);
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
  }

  .grid-wrap {
    overflow-x: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
  }
  table.grid {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
  }
  table.grid th, table.grid td {
    padding: 6px 10px;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
    text-align: left;
    white-space: nowrap;
  }
  table.grid th {
    background: var(--surface-sunk, color-mix(in srgb, var(--text) 3%, var(--surface)));
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted);
  }
  table.grid th.month, table.grid td.cell, table.grid td.num, table.grid th.num { text-align: right; }
  table.grid th.sticky, table.grid td.item, table.grid td.tenant {
    position: sticky;
    background: var(--surface);
  }
  table.grid th.sticky:nth-child(1), table.grid td.item     { left: 0; }
  table.grid th.sticky:nth-child(2), table.grid td.tenant   { left: 200px; min-width: 180px; }
  table.grid td.item .item-name { font-weight: var(--weight-medium); }

  /* cell tones */
  .cell { font-weight: var(--weight-medium); }
  .cell-sold     { background: color-mix(in srgb, var(--success) 14%, var(--surface)); color: color-mix(in srgb, var(--success) 90%, var(--text)); }
  .cell-prospect { background: color-mix(in srgb, var(--warning) 18%, var(--surface)); color: color-mix(in srgb, var(--warning) 90%, var(--text)); position: relative; }
  .cell-prospect .p-flag {
    display: inline-block;
    margin-left: 4px;
    font-size: 10px;
    font-weight: bold;
    color: var(--warning);
  }
  .cell-vacant   { background: color-mix(in srgb, var(--danger) 8%, var(--surface)); }

  table.grid tr.total-row td { background: var(--surface-sunk, color-mix(in srgb, var(--text) 3%, var(--surface))); font-weight: var(--weight-semibold); border-top: 1px solid var(--border); }
  table.grid td.bold { font-weight: var(--weight-semibold); }

  .legend {
    margin-top: var(--space-3);
    display: flex;
    align-items: center;
    gap: var(--space-3);
    font-size: var(--text-xs);
    color: var(--text-muted);
    flex-wrap: wrap;
  }
  .swatch {
    display: inline-block;
    width: 12px;
    height: 12px;
    border-radius: 2px;
    margin-right: 4px;
    vertical-align: middle;
  }
  .swatch-sold     { background: color-mix(in srgb, var(--success) 60%, var(--surface)); }
  .swatch-prospect { background: color-mix(in srgb, var(--warning) 60%, var(--surface)); }
  .swatch-vacant   { background: color-mix(in srgb, var(--danger) 30%, var(--surface)); }

  table.report {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
  }
  table.report th, table.report td {
    text-align: left;
    padding: 6px 10px;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
  }
  table.report th { font-weight: var(--weight-semibold); color: var(--text-muted); font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.04em; }
  table.report td.num, table.report th.num { text-align: right; font-variant-numeric: tabular-nums; }
  table.report td.kpi-id { font-family: var(--font-mono); color: var(--text-muted); width: 60px; }
  table.report td.cap { text-transform: capitalize; }
  table.report tr.total-row td { font-weight: var(--weight-semibold); border-top: 1px solid var(--border); }

  .empty { color: var(--text-muted); font-size: var(--text-sm); margin: var(--space-2) 0; font-style: italic; }
  .caption { margin-top: var(--space-2); }
  .muted { color: var(--text-muted); }
  .small { font-size: var(--text-xs); }
</style>
