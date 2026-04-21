<script lang="ts">
  import { PageHead } from '$lib/components/ui'
  let { data } = $props()
</script>

<PageHead title="Development Changelog" lede="Every session's shipped work. Edit CHANGELOG.md to update." />

<article class="doc">
  {@html data.html}
</article>

<style>
  .doc {
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 2.5rem 3rem;
    box-shadow: var(--shadow-sm);
    line-height: 1.65;
    color: var(--text);
  }
  .doc :global(> *:first-child) { margin-top: 0; }

  .doc :global(h1) {
    font-size: var(--text-2xl);
    margin: 0 0 var(--space-4);
    color: var(--heading-color);
  }
  .doc :global(h2) {
    font-size: var(--text-lg);
    margin: var(--space-6) 0 var(--space-3);
    color: var(--accent);
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
  .doc :global(li) { margin-bottom: var(--space-1); font-size: var(--text-sm); }
  .doc :global(strong) { color: var(--text); font-weight: var(--weight-semibold); }
  .doc :global(em) { font-style: italic; color: var(--text-muted); }
  .doc :global(code) {
    background: var(--surface-sunk, var(--surface-hover));
    padding: 1px 6px;
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: 0.85em;
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
  .doc :global(pre code) { background: none; padding: 0; color: var(--text); }
  .doc :global(hr) {
    border: none;
    border-top: 1px solid var(--border);
    margin: var(--space-6) 0;
  }
  .doc :global(a) { color: var(--accent); text-decoration: underline; }
</style>
