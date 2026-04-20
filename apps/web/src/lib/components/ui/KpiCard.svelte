<script lang="ts">
  type Props = {
    label: string
    value: string
    delta?: string
    tone?: 'neutral' | 'positive' | 'warning' | 'info'
  }
  let { label, value, delta, tone = 'neutral' }: Props = $props()
</script>

<div class="kpi">
  <div class="kpi-label">{label}</div>
  <div class="kpi-value">{value}</div>
  {#if delta}
    <div class="kpi-delta" data-tone={tone}>{delta}</div>
  {/if}
</div>

<style>
  .kpi {
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: var(--space-4) var(--space-5);
    box-shadow: var(--shadow-sm);
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .kpi-label {
    color: var(--kpi-label-color);
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    letter-spacing: var(--label-letter-spacing);
    text-transform: uppercase;
  }
  .kpi-value {
    color: var(--kpi-value-color);
    font-size: var(--text-2xl);
    font-weight: var(--weight-bold);
    line-height: var(--line-tight);
  }
  .kpi-delta {
    font-size: var(--text-xs);
    font-family: var(--font-mono);
    color: var(--text-muted);
  }
  .kpi-delta[data-tone='positive'] { color: var(--success); }
  .kpi-delta[data-tone='warning']  { color: var(--warning); }
  .kpi-delta[data-tone='info']     { color: var(--info); }
</style>
