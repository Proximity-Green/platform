<script lang="ts">
  import { Card, KpiCard, Badge, Button } from '$lib/components/ui'
</script>

<section class="page-head">
  <h1>Overview</h1>
  <p class="lede">
    Platform pulse at a glance — operations, commerce, and member activity across your community.
  </p>
</section>

<div class="kpi-grid">
  <KpiCard label="Occupancy"      value="78%"    delta="+12% vs last Q"   tone="positive" />
  <KpiCard label="Revenue"        value="R2.4M"  delta="+8% MoM"          tone="positive" />
  <KpiCard label="Active members" value="342"    delta="+14 this month"   tone="positive" />
  <KpiCard label="Parking"        value="87%"    delta="32 / 40 bays"     tone="neutral"  />
  <KpiCard label="Visitors today" value="7"      delta="3 checked in"     tone="info"     />
  <KpiCard label="Open leads"     value="18"     delta="6 hot"            tone="positive" />
</div>

<div class="briefing">
  <Card>
    <div class="briefing-head">
      <span class="dot"></span>
      <span class="u-label">AI Morning Briefing</span>
    </div>
    <p>
      Good morning. <Badge tone="warning">3 invoices</Badge> from the March run have anomalies —
      details below. Occupancy at Rosebank is trending
      <Badge tone="success">12% above last quarter</Badge>. Parking is at 87% — Admyt shows 32 of
      40 bays filled by 08:30, predicted full by <Badge tone="warning">09:15</Badge>.
      7 visitors expected today: 3 already checked in, 4 pending.
      <Badge tone="warning">TechFlow</Badge> and <Badge tone="warning">GreenLeaf Design</Badge>
      haven't checked in this week. Xero sync completed overnight —
      <Badge tone="success">no errors</Badge>.
    </p>
  </Card>
</div>

<div class="two-col">
  <Card>
    <h3>Invoice Anomalies</h3>
    <p class="muted">AI-flagged from March billing run</p>
    <ul class="row-list">
      <li>
        <span>Acme Corp</span>
        <span class="row-meta">R12,400 <Badge tone="warning">340% above avg</Badge></span>
      </li>
      <li>
        <span>Nova Digital</span>
        <span class="row-meta">R0 <Badge tone="warning">Missing line items</Badge></span>
      </li>
      <li>
        <span>GreenLeaf Design</span>
        <span class="row-meta">R3,200 <Badge tone="warning">Duplicate charge</Badge></span>
      </li>
    </ul>
  </Card>

  <Card>
    <h3>Churn Prediction</h3>
    <p class="muted">Members flagged by engagement signals</p>
    <div class="churn-item">
      <Badge tone="danger">High Risk</Badge>
      <h4>ByteWorks</h4>
      <p class="muted">
        Zero check-ins for 14 days. Last booking was 26 Feb. Contract renewal in 21 days.
        Recommend proactive outreach from community manager.
      </p>
    </div>
    <div class="churn-item">
      <Badge tone="warning">Medium Risk</Badge>
      <h4>Solaris Partners</h4>
      <p class="muted">
        Meeting room bookings down 60% vs prior quarter. Key contact hasn't responded to last 2
        emails. Usage pattern suggests remote-first shift.
      </p>
    </div>
  </Card>
</div>

<div class="actions">
  <Button variant="primary">Run payroll sync</Button>
  <Button variant="secondary">Export report</Button>
  <Button variant="ghost">Settings</Button>
</div>

<style>
  .page-head { margin-bottom: var(--space-6); }
  .page-head h1 { font-size: var(--text-2xl); margin-bottom: var(--space-2); }
  .lede { color: var(--text-muted); font-size: var(--text-base); max-width: 640px; }

  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: var(--space-3);
    margin-bottom: var(--space-4);
  }

  .briefing { margin-bottom: var(--space-4); }
  .briefing-head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }
  .dot {
    width: 8px; height: 8px;
    border-radius: var(--radius-pill);
    background: var(--accent);
  }
  .briefing p {
    color: var(--text);
    line-height: var(--line-normal);
  }

  .two-col {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: var(--space-3);
    margin-bottom: var(--space-4);
  }

  .two-col h3 { margin-bottom: var(--space-1); font-size: var(--text-lg); }
  .muted { color: var(--text-muted); font-size: var(--text-sm); }

  .row-list {
    list-style: none;
    padding: 0;
    margin: var(--space-4) 0 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .row-list li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-3) var(--space-4);
    background: var(--surface);
    border-radius: var(--radius-sm);
  }
  .row-meta {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3);
    color: var(--text);
    font-weight: var(--weight-medium);
  }

  .churn-item {
    margin-top: var(--space-4);
    padding: var(--space-4);
    background: var(--surface);
    border-radius: var(--radius-sm);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    align-items: flex-start;
  }
  .churn-item h4 { font-size: var(--text-md); margin: 0; }
  .churn-item p { margin: 0; }

  .actions {
    display: flex;
    gap: var(--space-3);
    align-items: center;
  }
</style>
