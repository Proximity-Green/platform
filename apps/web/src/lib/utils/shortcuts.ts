/**
 * Svelte action: Cmd/Ctrl+Enter submits the form the action is attached to.
 * Listens globally while the node is mounted.
 */
export function cmdEnterSubmit(node: HTMLFormElement) {
  const handler = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      node.requestSubmit()
    }
  }
  document.addEventListener('keydown', handler)
  return {
    destroy() { document.removeEventListener('keydown', handler) }
  }
}
