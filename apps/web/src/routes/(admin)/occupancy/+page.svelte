<script lang="ts">
  import { Card, Badge, Notice, KpiCard, PageHead } from '$lib/components/ui'

  let { data } = $props()
  const locations = $derived(data.locations as any[])
  const schemaGaps = $derived(data.schemaGaps as string[])

  // Network-wide rollups for the top KPI strip.
  const totals = $derived(
    locations.reduce(
      (acc, l) => {
        acc.space_stock     += l.space.stock_total
        acc.space_sold      += l.space.sold_total
        acc.space_unsold    += l.space.unsold_total
        acc.membership_subs += l.membership.sub_count
        acc.membership_seats += l.membership.total_seats
        return acc
      },
      { space_stock: 0, space_sold: 0, space_unsold: 0, membership_subs: 0, membership_seats: 0 }
    )
  )

  const networkOccPct = $derived(
    totals.space_stock > 0 ? Math.round((totals.space_sold / totals.space_stock) * 100) : null
  )

  function pctTone(pct: number | null): 'positive' | 'neutral' | 'warning' | 'info' {
    if (pct == null) return 'info'
    if (pct >= 85) return 'positive'
    if (pct >= 60) return 'neutral'
    return 'warning'
  }
</script>

<PageHead
  title="Occupancy"
  lede="Inventory lens — what's sold, what's unsold, where the floor pressure is. Crude V0; informs the data layer for proper reporting."
/>

<div class="kpi-strip">
  <KpiCard label="Space stock (network)"  value={String(totals.space_stock)} />
  <KpiCard label="Sold"                    value={String(totals.space_sold)}     tone="positive" />
  <KpiCard label="Unsold"                  value={String(totals.space_unsold)}   tone={totals.space_unsold > 0 ? 'warning' : 'positive'} />
  <KpiCard label="Network occupancy"       value={networkOccPct == null ? '—' : `${networkOccPct}%`} tone={pctTone(networkOccPct)} />
  <KpiCard label="Active membership subs"  value={String(totals.membership_subs)} />
  <KpiCard label="Membership seats sold"   value={String(totals.membership_seats)} tone="info" />
</div>

{#if schemaGaps?.length}
  <Notice tone="warning">
    <p><strong>Data layer is incomplete.</strong> The numbers below are a sketch. To make this report production-grade, the schema needs:</p>
    <ul>
      {#each schemaGaps as gap}
        <li><code>{gap}</code></li>
      {/each}
    </ul>
    <p class="small muted">
      Without those, "membership occupancy" is just a count — there's no target to measure against
      and no weighting between rooted and occasional members. Use this report as the spec for what
      the schema needs to support.
    </p>
  </Notice>
{/if}

<section class="loc-list">
  {#each locations as loc}
    <Card padding="md">
      <header class="loc-head">
        <h2>{loc.short_name ?? loc.name}</h2>
        <span class="muted small">{loc.name}</span>
      </header>

      <!-- ── Space inventory ────────────────────────────────────────── -->
      <div class="section">
        <div class="section-head">
          <h3>Space inventory</h3>
          <span class="muted small">offices · meeting rooms · hotel rooms · dedicated desks — every item is one unit of stock</span>
        </div>

        {#if loc.space.rows.length === 0}
          <p class="empty">No space-family items at this location.</p>
        {:else}
          <table class="report">
            <thead>
              <tr>
                <th>Type</th>
                <th class="num">Stock</th>
                <th class="num">Sold</th>
                <th class="num">Unsold</th>
                <th class="num">Occ %</th>
              </tr>
            </thead>
            <tbody>
              {#each loc.space.rows as r}
                {@const pct = r.stock > 0 ? Math.round((r.sold / r.stock) * 100) : null}
                <tr>
                  <td>{r.type_name}</td>
                  <td class="num">{r.stock}</td>
                  <td class="num">{r.sold}</td>
                  <td class="num">{r.stock - r.sold}</td>
                  <td class="num">
                    {#if pct == null}<span class="muted">—</span>
                    {:else}
                      <Badge tone={pct >= 85 ? 'success' : pct >= 60 ? 'info' : 'warning'}>{pct}%</Badge>
                    {/if}
                  </td>
                </tr>
              {/each}
              <tr class="total">
                <td>Total</td>
                <td class="num">{loc.space.stock_total}</td>
                <td class="num">{loc.space.sold_total}</td>
                <td class="num">{loc.space.unsold_total}</td>
                <td class="num">
                  {#if loc.space.occupancy_pct == null}<span class="muted">—</span>
                  {:else}
                    <Badge tone={loc.space.occupancy_pct >= 85 ? 'success' : loc.space.occupancy_pct >= 60 ? 'info' : 'warning'}>{loc.space.occupancy_pct}%</Badge>
                  {/if}
                </td>
              </tr>
            </tbody>
          </table>
        {/if}
      </div>

      <!-- ── Membership demand ──────────────────────────────────────── -->
      <div class="section">
        <div class="section-head">
          <h3>Membership demand</h3>
          <span class="muted small">access products — floor pressure depends on type + visit pattern</span>
        </div>

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
              <tr class="total">
                <td>Total</td>
                <td class="num">{loc.membership.buckets.reduce((s: number, b: any) => s + b.rooted, 0)}</td>
                <td class="num">{loc.membership.buckets.reduce((s: number, b: any) => s + b.occasional, 0)}</td>
                <td class="num">{loc.membership.sub_count}</td>
                <td class="num">{loc.membership.total_seats}</td>
              </tr>
            </tbody>
          </table>

          <p class="caption muted small">
            <strong>Rooted</strong> = unlimited / no monthly credit cap (full daily presence assumed).
            <strong>Occasional</strong> = capped credits-per-month (fractional pressure). V0 just splits the count;
            once <code>space_pressure_factor</code> exists, we can compute weighted demand and compare against
            <code>membership_capacity_target</code>.
          </p>
        {/if}
      </div>
    </Card>
  {/each}

  {#if locations.length === 0}
    <p class="empty">No active locations.</p>
  {/if}
</section>

<style>
  .kpi-strip {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: var(--space-3);
    margin-bottom: var(--space-5);
  }
  .loc-list {
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
  }
  .loc-head h2 { margin: 0; font-size: var(--text-lg); }
  .section { margin-top: var(--space-4); }
  .section-head {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
    flex-wrap: wrap;
  }
  .section-head h3 { margin: 0; font-size: var(--text-base); }

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
  table.report tr.total td { font-weight: var(--weight-semibold); border-top: 1px solid var(--border); }
  table.report td.cap { text-transform: capitalize; }

  .empty { color: var(--text-muted); font-size: var(--text-sm); margin: var(--space-2) 0; font-style: italic; }
  .caption { margin-top: var(--space-2); }
  .muted { color: var(--text-muted); }
  .small { font-size: var(--text-xs); }
</style>
