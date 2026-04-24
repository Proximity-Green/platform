<script lang="ts">
  import { page } from '$app/stores'
  import { canDo } from '$lib/stores/permissions'
  import { look, mode, toggleMode } from '$lib/stores/theme'
  import ThemeToggle from './ThemeToggle.svelte'
  import GlobalSearch from './GlobalSearch.svelte'
  import Workshop17Logo from './Workshop17Logo.svelte'

  type Perms = { role: string | null; permissions: any; loaded: boolean }

  type IconName = 'admin' | 'building' | 'user' | 'globe' | 'coins' | 'sliders' | 'book'
  type Leaf = { href: string; label: string; guard?: string; after?: string }
  type Section = { heading?: string; items: Leaf[] }
  type Group = { label: string; icon: IconName; sections: Section[]; primary?: boolean }

  type Props = {
    perms: Perms
    email: string
    role: string | null
    onSignOut: () => void
    search?: import('svelte').Snippet
  }
  let { perms, email, role, onSignOut, search }: Props = $props()

  type PrimaryLeaf = Leaf & { icon: IconName }
  const PRIMARY: PrimaryLeaf[] = [
    { href: '/organisations',    label: 'Organisations',    guard: 'organisations',    icon: 'building' },
    { href: '/people',           label: 'Members',          guard: 'persons',          icon: 'user' },
    { href: '/feature-requests', label: 'Feedback',         guard: 'feature_requests', icon: 'book' }
  ]

  const GROUPS: Group[] = [
    {
      label: 'More', icon: 'globe',
      sections: [
        {
          heading: 'Catalog',
          items: [
            { href: '/locations',  label: 'Locations',      guard: 'locations' },
            { href: '/spaces',     label: 'Spaces',         guard: 'locations' },
            { href: '/items',      label: 'Items',          guard: 'items' },
            { href: '/item-types', label: 'Item Types',     guard: 'items', after: '/items' },
            { href: '/licenses',   label: 'Licences',       guard: 'subscriptions' }
          ]
        },
        {
          heading: 'Finance',
          items: [
            { href: '/subs',      label: 'Subscriptions',  guard: 'subscriptions' },
            { href: '/invoices',  label: 'Invoices',       guard: 'invoices' },
            { href: '/contracts', label: 'Contracts',      guard: 'contracts' },
            { href: '/wallets',   label: 'Wallets',        guard: 'wallets' }
          ]
        },
        {
          heading: 'System',
          items: [
            { href: '/users',            label: 'Users',            guard: 'users' },
            { href: '/roles',            label: 'Roles',            guard: 'roles' },
            { href: '/messages',         label: 'Messages',         guard: 'settings' },
            { href: '/changelog',        label: 'Change Log',       guard: 'audit_log' },
            { href: '/system-logs',      label: 'System Logs',      guard: 'system_logs' }
          ]
        }
      ]
    }
  ]

  function allowed(leaf: Leaf): boolean {
    if (!leaf.guard) return true
    return canDo(perms, leaf.guard, 'read')
  }

  function isActive(href: string): boolean {
    return $page.url.pathname === href || $page.url.pathname.startsWith(href + '/')
  }

  // Keep section headings (Catalog / Finance / System); sort items
  // alphabetically within each section, but pin any leaf with `after: <parentHref>`
  // directly beneath its parent so child items stay visually attached.
  function sortSection(items: Leaf[]): Leaf[] {
    const allowed_ = items.filter(allowed)
    const byParent = new Map<string, Leaf[]>()
    const free: Leaf[] = []
    for (const leaf of allowed_) {
      if (leaf.after) {
        if (!byParent.has(leaf.after)) byParent.set(leaf.after, [])
        byParent.get(leaf.after)!.push(leaf)
      } else {
        free.push(leaf)
      }
    }
    free.sort((a, b) => a.label.localeCompare(b.label))
    for (const children of byParent.values()) {
      children.sort((a, b) => a.label.localeCompare(b.label))
    }
    const out: Leaf[] = []
    for (const leaf of free) {
      out.push(leaf)
      const children = byParent.get(leaf.href)
      if (children) out.push(...children)
    }
    // Orphaned children (parent not in this section) fall to the bottom.
    for (const [parentHref, children] of byParent) {
      if (!free.some(f => f.href === parentHref)) out.push(...children)
    }
    return out
  }

  const visibleGroups = $derived(
    GROUPS.map(g => ({
      ...g,
      sections: g.sections
        .map(s => ({ ...s, items: sortSection(s.items) }))
        .filter(s => s.items.length > 0)
    })).filter(g => g.sections.length > 0)
  )
  const visiblePrimary = $derived(PRIMARY.filter(allowed))

  let openGroup = $state<string | null>(null)
  let openAvatar = $state(false)
  let mobileOpen = $state(false)

  function toggleGroup(label: string) {
    openGroup = openGroup === label ? null : label
    openAvatar = false
  }
  function toggleAvatar() {
    openAvatar = !openAvatar
    openGroup = null
  }
  function toggleMobile() {
    mobileOpen = !mobileOpen
    openGroup = null
    openAvatar = false
  }
  function closeAll() {
    openGroup = null
    openAvatar = false
    mobileOpen = false
  }

  // Click-outside close
  function handleDocClick(e: MouseEvent) {
    const target = e.target as HTMLElement
    if (!target.closest('.topnav')) closeAll()
  }
  $effect(() => {
    document.addEventListener('click', handleDocClick)
    return () => document.removeEventListener('click', handleDocClick)
  })
</script>

{#snippet navIcon(name: IconName)}
  <span class="icon" aria-hidden="true">
    {#if name === 'admin'}
      <!-- Lucide: shield-check -->
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 13c0 5-3.5 7.5-7.7 8.9a1.7 1.7 0 0 1-1.1 0C7 20.5 3.5 18 3.5 13V6l8-3 8 3z"/>
        <path d="m9 12 2 2 4-4"/>
      </svg>
    {:else if name === 'building'}
      <!-- Lucide: building-2 -->
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
        <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/>
        <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/>
        <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/>
        <path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>
      </svg>
    {:else if name === 'user'}
      <!-- Lucide: user-round -->
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="8" r="5"/>
        <path d="M20 21a8 8 0 0 0-16 0"/>
      </svg>
    {:else if name === 'globe'}
      <!-- Lucide: globe -->
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/>
        <path d="M2 12h20"/>
      </svg>
    {:else if name === 'coins'}
      <!-- Lucide: coins -->
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="8" cy="8" r="6"/>
        <path d="M18.09 10.37A6 6 0 1 1 10.34 18"/>
        <path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/>
      </svg>
    {:else if name === 'sliders'}
      <!-- Lucide: sliders-horizontal -->
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
        <line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/>
        <line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/>
        <line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/>
        <line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>
      </svg>
    {:else if name === 'book'}
      <!-- Lucide: book-open -->
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2Z"/>
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7Z"/>
      </svg>
    {/if}
  </span>
{/snippet}

<header class="topnav" class:mobile-open={mobileOpen} role="navigation" aria-label="Primary">
  <div class="nav-inner">
    <a href="/admin" class="brand" onclick={closeAll} aria-label="Workshop17">
      <span class="brand-mark"><Workshop17Logo /></span>
    </a>

    <nav class="nav-items">
      <a href="/admin" class="nav-item" class:is-active={isActive('/admin')}>
        {@render navIcon('admin')}
        <span class="label">Admin</span>
      </a>

      {#each visiblePrimary as item (item.href)}
        <a href={item.href} class="nav-item" class:is-active={isActive(item.href)}>
          {@render navIcon(item.icon)}
          <span class="label">{item.label}</span>
        </a>
      {/each}

      {#each visibleGroups as group (group.label)}
        <div class="nav-item dropdown icon-only" class:is-open={openGroup === group.label}>
          <button type="button" class="dropdown-trigger" onclick={() => toggleGroup(group.label)} aria-expanded={openGroup === group.label} title={group.label}>
            {@render navIcon(group.icon)}
            <span class="chev" aria-hidden="true">▾</span>
          </button>
          {#if openGroup === group.label}
            <div class="dropdown-panel" role="menu">
              {#each group.sections as section}
                {#if section.heading}
                  <div class="dropdown-heading">{section.heading}</div>
                {/if}
                {#each section.items as leaf (leaf.href)}
                  <a
                    href={leaf.href}
                    class="dropdown-link"
                    class:is-active={isActive(leaf.href)}
                    class:is-nested={!!leaf.after}
                    role="menuitem"
                    onclick={closeAll}
                  >
                    {#if leaf.after}<span class="nested-bar" aria-hidden="true"></span>{/if}
                    {leaf.label}
                  </a>
                {/each}
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </nav>

    <div class="nav-right">
      <a href="/docs" class="nav-item docs-link" class:is-active={isActive('/docs')}>
        {@render navIcon('book')}
        <span class="label">Docs</span>
      </a>

      <div class="search-wrap">
        {#if search}
          {@render search()}
        {:else}
          <GlobalSearch />
        {/if}
      </div>

      <div class="avatar-wrap" class:is-open={openAvatar}>
        <button type="button" class="avatar-btn" onclick={toggleAvatar} aria-label="Account">
          <span class="avatar-initials">{(email?.[0] ?? '?').toUpperCase()}</span>
        </button>
        {#if openAvatar}
          <div class="dropdown-panel avatar-panel" role="menu">
            <div class="avatar-meta">
              <div class="avatar-email">{email}</div>
              <div class="avatar-role">{role ?? 'no role'}</div>
            </div>
            <a href="/profile" class="dropdown-link" onclick={closeAll}>Profile</a>
            <a href="/dev-changelog" class="dropdown-link" onclick={closeAll}>Changelog</a>
            <div class="theme-chooser">
              <div class="chooser-label">Theme</div>
              <ThemeToggle />
              {#if $look !== 'w17'}
                <button type="button" class="dropdown-link as-btn mode-btn" onclick={toggleMode}>
                  Mode: {$mode === 'dark' ? 'Dark' : 'Light'} (click to flip)
                </button>
              {/if}
            </div>
            <button class="dropdown-link as-btn" onclick={() => { closeAll(); onSignOut() }}>Sign out</button>
          </div>
        {/if}
      </div>

      <button
        type="button"
        class="hamburger"
        onclick={toggleMobile}
        aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={mobileOpen}
      >
        <span class="hamburger-bars" aria-hidden="true">
          <span></span><span></span><span></span>
        </span>
      </button>
    </div>
  </div>

  {#if mobileOpen}
    <div class="mobile-drawer" role="menu">
      <div class="mobile-search">
        {#if search}
          {@render search()}
        {:else}
          <GlobalSearch />
        {/if}
      </div>

      <a href="/admin" class="mobile-link" class:is-active={isActive('/admin')} onclick={closeAll}>
        {@render navIcon('admin')}
        <span>Admin</span>
      </a>

      {#each visiblePrimary as item (item.href)}
        <a href={item.href} class="mobile-link" class:is-active={isActive(item.href)} onclick={closeAll}>
          {@render navIcon(item.icon)}
          <span>{item.label}</span>
        </a>
      {/each}

      <a href="/docs" class="mobile-link" class:is-active={isActive('/docs')} onclick={closeAll}>
        {@render navIcon('book')}
        <span>Docs</span>
      </a>

      {#each visibleGroups as group (group.label)}
        <div class="mobile-group">
          <div class="mobile-group-head">
            {@render navIcon(group.icon)}
            <span>{group.label}</span>
          </div>
          {#each group.sections as section}
            {#if section.heading}
              <div class="mobile-heading">{section.heading}</div>
            {/if}
            {#each section.items as leaf (leaf.href)}
              <a
                href={leaf.href}
                class="mobile-sublink"
                class:is-active={isActive(leaf.href)}
                class:is-nested={!!leaf.after}
                onclick={closeAll}
              >
                {leaf.label}
              </a>
            {/each}
          {/each}
        </div>
      {/each}
    </div>
  {/if}
</header>

<style>
  :global(:root) { --topnav-height: 60px; }
  .topnav {
    position: sticky;
    top: 0;
    z-index: 500;
    background: var(--nav-bg);
    color: var(--nav-item-color);
    box-shadow: var(--shadow-sm);
  }
  .nav-inner {
    display: flex;
    align-items: stretch;
    gap: var(--space-2);
    padding: 0 var(--space-5);
    height: 60px;
  }

  .brand {
    display: flex;
    align-items: center;
    padding-right: var(--space-5);
    color: var(--nav-item-color);
    text-decoration: none;
  }
  .brand-mark {
    display: inline-flex;
    align-items: center;
    color: #ffffff;
  }
  .brand-mark :global(svg) {
    width: 168px;
    height: auto;
    display: block;
    color: #ffffff;
  }

  @media (max-width: 720px) {
    .brand-mark :global(svg) { width: 120px; }
  }

  .nav-items {
    display: flex;
    align-items: stretch;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }

  .hamburger {
    display: none;
    background: transparent;
    border: none;
    color: var(--nav-item-color);
    width: 40px;
    height: 40px;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0;
    border-radius: 6px;
  }
  .hamburger:hover { background: var(--nav-selected-bg); }
  .hamburger-bars {
    display: inline-flex;
    flex-direction: column;
    gap: 4px;
    width: 20px;
  }
  .hamburger-bars span {
    display: block;
    height: 2px;
    background: currentColor;
    border-radius: 1px;
    transition: transform var(--motion-fast) var(--ease-out), opacity var(--motion-fast) var(--ease-out);
  }
  .topnav.mobile-open .hamburger-bars span:nth-child(1) { transform: translateY(6px) rotate(45deg); }
  .topnav.mobile-open .hamburger-bars span:nth-child(2) { opacity: 0; }
  .topnav.mobile-open .hamburger-bars span:nth-child(3) { transform: translateY(-6px) rotate(-45deg); }

  .mobile-drawer {
    display: none;
    flex-direction: column;
    background: var(--nav-dropdown-bg, var(--nav-bg));
    color: var(--nav-item-color);
    box-shadow: var(--shadow-md);
    padding: var(--space-3) 0 var(--space-4);
    max-height: calc(100vh - var(--topnav-height));
    overflow-y: auto;
  }
  .mobile-search {
    padding: 0 var(--space-4) var(--space-2);
  }
  .mobile-search :global(.global-search) { width: 100%; }
  .mobile-link {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px var(--space-4);
    color: var(--nav-item-color);
    text-decoration: none;
    font-size: 1rem;
    font-weight: var(--weight-medium);
    border-left: 3px solid transparent;
  }
  .mobile-link:hover { background: var(--nav-selected-bg); }
  .mobile-link.is-active {
    background: var(--nav-selected-bg);
    border-left-color: var(--nav-selected-accent);
  }
  .mobile-link .icon { width: 20px; height: 20px; }
  .mobile-group {
    border-top: 1px solid rgba(255, 255, 255, 0.15);
    margin-top: var(--space-2);
    padding-top: var(--space-2);
  }
  .mobile-group-head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px var(--space-4);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    opacity: 0.7;
  }
  .mobile-group-head .icon { width: 16px; height: 16px; }
  .mobile-heading {
    padding: 10px var(--space-4) 4px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    opacity: 0.55;
    font-weight: 600;
  }
  .mobile-sublink {
    display: block;
    padding: 10px var(--space-4) 10px calc(var(--space-4) + 8px);
    color: var(--nav-item-color);
    text-decoration: none;
    font-size: 0.95rem;
    border-left: 3px solid transparent;
  }
  .mobile-sublink:hover { background: var(--nav-selected-bg); }
  .mobile-sublink.is-active {
    background: var(--nav-selected-bg);
    border-left-color: var(--nav-selected-accent);
    font-weight: var(--weight-semibold);
  }
  .mobile-sublink.is-nested { padding-left: calc(var(--space-4) + 24px); font-size: 0.88rem; opacity: 0.85; }

  .nav-item {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 0 var(--space-4);
    font-size: 1rem;
    font-weight: var(--weight-medium);
    color: var(--nav-item-color);
    text-decoration: none;
    position: relative;
    white-space: nowrap;
    transition: background var(--motion-fast) var(--ease-out);
  }
  .nav-item .icon { width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center; opacity: 0.95; }
  .nav-item .icon svg { width: 100%; height: 100%; display: block; }
  .dropdown.icon-only .dropdown-trigger { padding: 0 var(--space-3); font-size: 1rem; }
  .dropdown.icon-only .icon { width: 18px; height: 18px; }
  .nav-item:hover { background: var(--nav-selected-bg); }
  .nav-item.is-active { background: var(--nav-selected-bg); }
  .nav-item.is-active::after {
    content: '';
    position: absolute;
    left: var(--space-3);
    right: var(--space-3);
    bottom: 0;
    height: 2px;
    background: var(--nav-selected-accent);
    border-radius: 1px;
  }
  .icon { font-size: 14px; opacity: 0.95; }
  .label { line-height: 1; }

  .dropdown { position: relative; padding: 0; }
  .dropdown-trigger {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 var(--space-3);
    height: 100%;
    background: transparent;
    border: none;
    color: var(--nav-item-color);
    font: inherit;
    font-weight: var(--weight-medium);
    cursor: pointer;
  }
  .dropdown-trigger:hover { background: var(--nav-selected-bg); }
  .dropdown.is-open .dropdown-trigger { background: var(--nav-selected-bg); }
  .chev { font-size: 10px; opacity: 0.8; }

  .dropdown-panel {
    position: absolute;
    top: 100%;
    left: 0;
    min-width: 240px;
    background: var(--nav-dropdown-bg, var(--nav-bg));
    color: var(--nav-item-color);
    box-shadow: var(--shadow-md);
    display: flex;
    flex-direction: column;
    padding: 8px 0 10px;
    z-index: 10020;
  }
  .dropdown-link {
    display: block;
    padding: 9px 22px 9px 28px;
    font-size: 0.95rem;
    color: var(--nav-item-color);
    text-decoration: none;
    background: transparent;
    border: none;
    text-align: left;
    width: 100%;
    cursor: pointer;
    line-height: 1.2;
  }
  .dropdown-link:hover { background: var(--nav-dropdown-hover, var(--nav-selected-bg)); }
  .dropdown-link.is-active { background: var(--nav-dropdown-hover, var(--nav-selected-bg)); font-weight: var(--weight-semibold); }
  .dropdown-link.as-btn { font-family: inherit; }
  .dropdown-link.is-nested {
    padding-left: 44px;
    position: relative;
    font-size: 0.88rem;
    color: color-mix(in srgb, var(--nav-item-color) 80%, transparent);
  }
  .dropdown-link.is-nested .nested-bar {
    position: absolute;
    left: 32px;
    top: 50%;
    width: 6px;
    height: 1px;
    background: currentColor;
    opacity: 0.4;
  }
  .dropdown-heading {
    padding: 14px 22px 4px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: rgba(255, 255, 255, 0.55);
    font-weight: 600;
  }
  .dropdown-heading:first-child { padding-top: 6px; }

  .nav-right {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-left: auto;
    padding-left: var(--space-3);
  }

  .avatar-wrap { position: relative; }
  .avatar-btn {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.18);
    color: #ffffff;
    border: 1px solid rgba(255, 255, 255, 0.25);
    font-weight: var(--weight-semibold);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .avatar-btn:hover { background: rgba(255, 255, 255, 0.28); }
  .avatar-initials { font-size: 13px; letter-spacing: 0.5px; }

  .avatar-panel { right: 0; left: auto; min-width: 220px; }
  .avatar-meta {
    padding: var(--space-2) var(--space-4);
    border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  }
  .avatar-email { font-size: var(--text-xs); opacity: 0.85; word-break: break-all; }
  .avatar-role { font-size: 11px; opacity: 0.7; text-transform: uppercase; letter-spacing: 0.08em; margin-top: 2px; }

  .theme-chooser {
    padding: var(--space-2) var(--space-4);
    border-top: 1px solid rgba(255, 255, 255, 0.2);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .chooser-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    opacity: 0.6;
  }
  .chooser-row { display: flex; gap: 4px; flex-wrap: wrap; }
  .chooser-chip {
    background: rgba(255, 255, 255, 0.1);
    color: inherit;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: var(--radius-sm);
    padding: 4px 10px;
    font-size: 11px;
    cursor: pointer;
    font: inherit;
  }
  .chooser-chip:hover { background: rgba(255, 255, 255, 0.2); }
  .chooser-chip.is-active {
    background: #ffffff;
    color: #2b3431;
    border-color: #ffffff;
    font-weight: var(--weight-semibold);
  }
  .mode-btn { font-size: 11px; padding: 4px 0; opacity: 0.8; }

  .search-wrap { display: flex; align-items: center; }

  @media (max-width: 900px) {
    .nav-inner { padding: 0 var(--space-4); gap: var(--space-1); }
    .brand { padding-right: var(--space-3); }
    .brand-mark :global(svg) { width: 128px; }
    .nav-items { display: none; }
    .docs-link { display: none; }
    .search-wrap { display: none; }
    .nav-right { gap: var(--space-2); padding-left: 0; }
    .hamburger { display: inline-flex; }
    .topnav.mobile-open .mobile-drawer { display: flex; }
  }
</style>
