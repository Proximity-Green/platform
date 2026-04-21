<script lang="ts">
  import { PageHead } from '$lib/components/ui'
  let { data } = $props()
</script>

<PageHead title="Docs" lede="Architecture & conventions — the canonical reference. Edit the markdown in /docs to update." />

<div class="layout">
  <nav class="side">
    {#each data.pages as p}
      <a href="?p={p.slug}" class="side-link" class:is-active={p.slug === data.slug}>{p.label}</a>
    {/each}
    <a class="side-link external" href="https://github.com/Proximity-Green/platform/tree/develop/docs" target="_blank" rel="noopener">View on GitHub ↗</a>
  </nav>

  <article class="doc">
    {@html data.html}
  </article>
</div>

<style>
  .layout {
    display: grid;
    grid-template-columns: 160px 1fr;
    gap: var(--space-3);
    align-items: start;
  }
  .side {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    position: sticky;
    top: var(--space-6);
  }
  .side-link {
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    color: var(--text-muted);
    font-size: var(--text-sm);
    text-decoration: none;
    transition: background var(--motion-fast) var(--ease-out);
  }
  .side-link:hover { background: var(--surface-hover); color: var(--text); }
  .side-link.is-active {
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: var(--weight-semibold);
  }
  .side-link.external {
    margin-top: var(--space-4);
    border-top: 1px solid var(--border);
    padding-top: var(--space-3);
    font-size: var(--text-xs);
  }

  .doc {
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 2.5rem 3rem;
    box-shadow: var(--shadow-sm);
    line-height: 1.6;
    color: var(--text);
    min-width: 0;
  }
  .doc :global(> *:first-child) { margin-top: 0; }

  .doc :global(h1) {
    font-size: var(--text-2xl);
    margin: 0 0 var(--space-4);
    color: var(--heading-color);
  }
  .doc :global(h2) {
    font-size: var(--text-lg);
    margin: var(--space-6) 0 var(--space-2);
    color: var(--heading-color);
    border-bottom: 1px solid var(--border);
    padding-bottom: var(--space-2);
  }
  .doc :global(h3) {
    font-size: var(--text-md);
    margin: var(--space-5) 0 var(--space-2);
    color: var(--heading-color);
  }
  .doc :global(p) { margin: 0 0 var(--space-3); }
  .doc :global(ul), .doc :global(ol) { margin: 0 0 var(--space-3); padding-left: var(--space-5); }
  .doc :global(li) { margin-bottom: var(--space-1); }
  .doc :global(li > ul), .doc :global(li > ol) { margin-top: var(--space-1); }
  .doc :global(strong) { color: var(--text); font-weight: var(--weight-semibold); }
  .doc :global(em) { font-style: italic; color: var(--text-muted); }
  .doc :global(code) {
    background: var(--surface-sunk, var(--surface-hover));
    padding: 1px 6px;
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: 0.9em;
    color: var(--accent);
  }
  .doc :global(pre) {
    background: var(--surface-sunk, var(--surface-hover));
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: var(--space-3) var(--space-4);
    overflow-x: auto;
    margin: 0 0 var(--space-4);
    font-size: var(--text-sm);
  }
  .doc :global(pre code) {
    background: none;
    padding: 0;
    color: var(--text);
  }
  .doc :global(a) { color: var(--accent); text-decoration: underline; }
  .doc :global(blockquote) {
    border-left: 3px solid var(--accent);
    padding-left: var(--space-3);
    margin: 0 0 var(--space-3);
    color: var(--text-muted);
  }
  .doc :global(hr) {
    border: none;
    border-top: 1px solid var(--border);
    margin: var(--space-5) 0;
  }
  .muted { color: var(--text-muted); }

  @media (max-width: 720px) {
    .layout { grid-template-columns: 1fr; }
    .side { position: static; }
  }
</style>
