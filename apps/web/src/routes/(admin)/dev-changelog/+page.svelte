<script lang="ts">
  let { data } = $props()

  function renderMarkdown(md: string): string {
    return md
      .replace(/^### (.*$)/gm, '<h3>$1</h3>')
      .replace(/^## (.*$)/gm, '<h2>$1</h2>')
      .replace(/^# (.*$)/gm, '<h1>$1</h1>')
      .replace(/^\- \*\*(.*?)\*\*:? ?(.*$)/gm, '<li><strong>$1</strong> $2</li>')
      .replace(/^\- (.*$)/gm, '<li>$1</li>')
      .replace(/^\d+\. (.*$)/gm, '<li>$1</li>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/^---$/gm, '<hr/>')
      .replace(/\n\n/g, '<br/><br/>')
  }
</script>

<div class="container">
  <h1>Development Changelog</h1>
  <div class="content">
    {@html renderMarkdown(data.content)}
  </div>
</div>

<style>
  .container { max-width: 900px; margin: 0 auto; padding: 2rem; font-family: system-ui, sans-serif; }
  h1 { font-size: 1.5rem; font-weight: 600; color: #0a1f0f; margin-bottom: 2rem; }
  .content { line-height: 1.8; color: #0a1f0f; }
  .content :global(h1) { font-size: 1.6rem; color: #2d6a35; margin: 2rem 0 1rem; border-bottom: 2px solid #c8deca; padding-bottom: 0.5rem; }
  .content :global(h2) { font-size: 1.2rem; color: #2d6a35; margin: 2rem 0 0.75rem; }
  .content :global(h3) { font-size: 1rem; color: #0a1f0f; margin: 1.5rem 0 0.5rem; }
  .content :global(li) { margin: 0.25rem 0; padding-left: 0.5rem; font-size: 0.9rem; list-style: none; }
  .content :global(li::before) { content: '•'; color: #2d6a35; font-weight: bold; margin-right: 0.5rem; }
  .content :global(strong) { color: #0a1f0f; }
  .content :global(code) { background: #e8f5ea; color: #2d6a35; padding: 1px 5px; border-radius: 3px; font-size: 0.85em; }
  .content :global(hr) { border: none; border-top: 1px solid #c8deca; margin: 2rem 0; }
</style>
