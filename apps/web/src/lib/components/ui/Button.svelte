<script lang="ts">
  type Props = {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
    size?: 'sm' | 'md'
    type?: 'button' | 'submit' | 'reset'
    disabled?: boolean
    loading?: boolean
    onclick?: (e: MouseEvent) => void
    href?: string
    form?: string
    children?: any
  }
  let {
    variant = 'primary',
    size = 'md',
    type = 'button',
    disabled = false,
    loading = false,
    onclick,
    href,
    form,
    children
  }: Props = $props()
</script>

{#if href}
  <a class="btn" data-variant={variant} data-size={size} {href}>
    {@render children?.()}
  </a>
{:else}
  <button
    class="btn"
    class:is-loading={loading}
    data-variant={variant}
    data-size={size}
    {type}
    disabled={disabled || loading}
    {onclick}
    {form}
  >
    {#if loading}<span class="spinner" aria-hidden="true"></span>{/if}
    {@render children?.()}
  </button>
{/if}

<style>
  .btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    border: 1px solid transparent;
    border-radius: var(--radius-pill);
    font-family: var(--font-body);
    font-weight: var(--weight-medium);
    letter-spacing: -0.005em;
    cursor: pointer;
    line-height: 1;
    white-space: nowrap;
    text-decoration: none;
    user-select: none;
    overflow: hidden;
    isolation: isolate;
    transition:
      background 220ms cubic-bezier(0.16, 1, 0.3, 1),
      border-color 220ms cubic-bezier(0.16, 1, 0.3, 1),
      color 220ms cubic-bezier(0.16, 1, 0.3, 1),
      box-shadow 260ms cubic-bezier(0.16, 1, 0.3, 1),
      transform 220ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  /* Shine sweep — reveals on hover, travels across the button */
  .btn::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: inherit;
    background: linear-gradient(
      120deg,
      transparent 30%,
      rgba(255, 255, 255, 0.25) 50%,
      transparent 70%
    );
    transform: translateX(-120%);
    transition: transform 650ms cubic-bezier(0.22, 1, 0.36, 1);
    pointer-events: none;
    opacity: 0;
  }
  .btn:hover:not(:disabled)::before {
    transform: translateX(120%);
    opacity: 1;
  }

  .btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn.is-loading { cursor: progress; opacity: 0.85; }
  .spinner {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 2px solid currentColor;
    border-right-color: transparent;
    animation: spin 600ms linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .btn:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  .btn:hover:not(:disabled) { transform: translateY(-1px); }
  .btn:active:not(:disabled) {
    transform: translateY(0);
    transition-duration: 80ms;
  }

  .btn[data-size='sm'] {
    height: 28px;
    padding: 0 0.8rem;
    font-size: var(--text-xs);
  }
  .btn[data-size='md'] {
    height: 36px;
    padding: 0 1.1rem;
    font-size: var(--text-sm);
  }

  /* Primary — solid accent, dimensional lift + glow on hover */
  .btn[data-variant='primary'] {
    background: var(--accent);
    color: var(--accent-contrast);
    border-color: var(--accent);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.18),
      0 1px 2px rgba(0, 0, 0, 0.08);
  }
  .btn[data-variant='primary']:hover:not(:disabled) {
    background: var(--accent-hover);
    border-color: var(--accent-hover);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.24),
      0 6px 18px var(--accent-soft),
      0 2px 4px rgba(0, 0, 0, 0.12);
  }
  .btn[data-variant='primary']:active:not(:disabled) {
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.22);
  }

  /* Secondary — tinted chip, fills to solid accent on hover */
  .btn[data-variant='secondary'] {
    background: var(--accent-soft);
    border-color: transparent;
    color: var(--accent-hover, var(--accent));
  }
  .btn[data-variant='secondary']:hover:not(:disabled) {
    background: var(--accent);
    color: var(--accent-contrast);
    box-shadow: 0 4px 14px var(--accent-soft);
  }

  /* Ghost — neutral chip, borrows accent tint on hover */
  .btn[data-variant='ghost'] {
    background: var(--surface-sunk);
    color: var(--text);
    border-color: transparent;
  }
  .btn[data-variant='ghost']:hover:not(:disabled) {
    background: var(--accent-soft);
    color: var(--accent-hover, var(--accent));
  }

  /* Danger — soft chip, intensifies on hover with glow */
  .btn[data-variant='danger'] {
    background: var(--danger-soft);
    color: var(--danger);
    border-color: transparent;
  }
  .btn[data-variant='danger']:hover:not(:disabled) {
    background: var(--danger);
    color: #ffffff;
    box-shadow: 0 4px 14px var(--danger-soft);
  }
</style>
