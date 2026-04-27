<script lang="ts">
  import { supabase } from '$lib/supabase'
  import { onMount } from 'svelte'
  import { page, navigating } from '$app/stores'
  import { permStore, loadPermissions, canDo } from '$lib/stores/permissions'
  import { loadPrefs } from '$lib/stores/prefs'
  import { look, usesTopNav } from '$lib/stores/theme'
  import { Badge, Button, ErrorBanner, ModeToggle, ThemeToggle, TopNav, Workshop17Logo } from '$lib/components/ui'
  import { globalErrors, dismissGlobalError } from '$lib/stores/global-errors'
  import { buildStats } from '$lib/generated/build-stats'

  let { children, data } = $props()
  // Trust the server-provided session — +layout.server.ts has already gated
  // admin routes and redirected to / if there's no session. No need to re-verify
  // on the client (which breaks when localStorage and cookies drift — common
  // when switching ports or clearing storage).
  let session = $state(data.session)
  let checking = $state(false)
  let impersonating = $state<any>(null)
  let devMode = $state(false)
  let perms = $state({ role: null as string | null, permissions: [] as any, loaded: false })

  permStore.subscribe(v => { perms = v })

  onMount(async () => {
    // Session already provided by the server; don't re-fetch and overwrite it.
    const cookie = document.cookie.split(';').find(c => c.trim().startsWith('impersonating='))
    if (cookie) {
      try {
        impersonating = JSON.parse(decodeURIComponent(cookie.split('=').slice(1).join('=')))
      } catch {}
    }

    if (session) {
      const permUserId = impersonating ? impersonating.targetUserId : session.user.id
      await Promise.all([
        loadPermissions(permUserId),
        loadPrefs(session.user.id)
      ])
    }

    supabase.auth.onAuthStateChange((event, s) => {
      session = s
      // Only redirect on explicit sign-out — don't react to transient null sessions
      // during token refreshes or initial hydration (which was causing flap-back-to-login)
      if (event === 'SIGNED_OUT') {
        window.location.href = '/'
      }
    })
  })

  function can(resource: string, action: string = 'read'): boolean {
    return canDo(perms, resource, action)
  }

  async function signOut() {
    if (impersonating) await stopImpersonating()
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  async function stopImpersonating() {
    await fetch('/api/impersonate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'stop' })
    })
    impersonating = null
    window.location.href = '/users'
  }

  type NavItem = { href: string; label: string; guard?: string }
  const navItems: NavItem[] = [
    { href: '/admin',         label: 'Dashboard',     guard: 'persons' },
    { href: '/feature-requests', label: 'Feedback',  guard: 'feature_requests' },
    { href: '/people',        label: 'Members',       guard: 'persons' },
    { href: '/organisations', label: 'Organisations', guard: 'organisations' },
    { href: '/locations',     label: 'Locations',     guard: 'locations' },
    { href: '/spaces',        label: 'Spaces',        guard: 'locations' },
    { href: '/items',         label: 'Items',         guard: 'items' },
    { href: '/licenses',      label: 'Licences',      guard: 'subscriptions' },
    { href: '/subs',          label: 'Subscriptions', guard: 'subscriptions' },
    { href: '/invoices',      label: 'Invoices',      guard: 'invoices' },
    { href: '/contracts',     label: 'Contracts',     guard: 'contracts' },
    { href: '/wallets',       label: 'Wallets',       guard: 'wallets' },
    { href: '/item-types',    label: 'Item Types',    guard: 'items' },
    { href: '/users',         label: 'Users',         guard: 'users' },
    { href: '/roles',         label: 'Roles',         guard: 'roles' },
    { href: '/messages',      label: 'Messages',      guard: 'settings' },
    { href: '/changelog',     label: 'Change Log',    guard: 'audit_log' },
    { href: '/system-logs',   label: 'System Logs',   guard: 'system_logs' },
    { href: '/reported-errors', label: 'Reported Errors', guard: 'reported_errors' },
    { href: '/docs',          label: 'Docs' }
  ]
</script>

{#if $navigating}
  <div class="nav-overlay" role="status" aria-live="polite">
    <div class="nav-overlay-card">
      <svg class="nav-overlay-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <circle cx="12" cy="12" r="9" opacity="0.2"/>
        <path d="M21 12a9 9 0 0 0-9-9"/>
      </svg>
      <div class="nav-overlay-label">Opening…</div>
    </div>
  </div>
{/if}

{#if checking}
  <div class="center-state">Loading…</div>
{:else if session}
  {#if impersonating}
    <div class="impersonation-banner">
      <span>
        You ({session.user.email}) are viewing as <strong>{impersonating.targetName}</strong>
        ({impersonating.targetEmail}) — Role: <strong>{impersonating.targetRole ?? 'no role'}</strong>
      </span>
      <Button variant="secondary" size="sm" onclick={stopImpersonating}>Exit</Button>
    </div>
  {/if}

  {#if usesTopNav($look)}
    <!-- W17 theme: horizontal top nav, content below -->
    <TopNav {perms} email={session.user.email ?? ''} role={perms.role} onSignOut={signOut} />
    <main class="content topnav-content">
      {#each $globalErrors as g (g.id)}
        <ErrorBanner error={g.error} showRaw onDismiss={() => dismissGlobalError(g.id)} />
      {/each}
      {#if !perms.role && perms.loaded}
        <div class="no-access">
          <h2>No role assigned</h2>
          <p>Your account has no role. Contact an administrator for access.</p>
        </div>
      {:else}
        {@render children()}
      {/if}
    </main>
    <footer class="app-footer">
      <a class="version-chip" href="/admin" title={`branch ${buildStats.branch} · ${buildStats.commitCount} commits · last commit ${buildStats.lastCommitIso?.slice(0, 10) ?? ''}`}>
        v{buildStats.commitShort || 'dev'}
      </a>
    </footer>
  {:else}
  <div class="shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-name"><Workshop17Logo /></div>
        <div class="brand-sub">Proximity Green 0.1</div>
      </div>

      <nav class="nav">
        {#each navItems as item}
          {#if !item.guard || can(item.guard)}
            <a
              href={item.href}
              class="nav-item"
              class:is-active={$page.url.pathname.startsWith(item.href)}
            >
              {item.label}
            </a>
          {/if}
        {/each}
      </nav>

      <div class="sidebar-foot">
        <a href="/profile" class="profile">
          <div class="profile-email">{session.user.email}</div>
          {#if perms.role}
            <Badge tone="success">{perms.role.replace('_', ' ')}</Badge>
          {:else}
            <Badge tone="warning">no role</Badge>
          {/if}
        </a>
        <div class="toggles">
          <ThemeToggle />
          <ModeToggle />
        </div>
        <div class="foot-actions">
          <button class="foot-link" onclick={() => devMode = !devMode}>Dev</button>
          <a class="foot-link" href="/dev-changelog">v1</a>
          <button class="foot-link" onclick={signOut}>Sign out</button>
        </div>
      </div>
    </aside>

    <main class="content">
      {#each $globalErrors as g (g.id)}
        <ErrorBanner error={g.error} showRaw onDismiss={() => dismissGlobalError(g.id)} />
      {/each}
      {#if devMode}
        <div class="dev-panel">
          <div class="dev-header">Dev Panel</div>
          <div class="dev-grid">
            <div>
              <h4>Authenticated User</h4>
              <div class="dev-row"><span>Email:</span> <strong>{session.user.email}</strong></div>
              <div class="dev-row"><span>User ID:</span> <code>{session.user.id}</code></div>
              <div class="dev-row"><span>Provider:</span> {session.user.app_metadata?.provider}</div>
            </div>
            <div>
              <h4>Active Permissions {impersonating ? '(impersonated)' : ''}</h4>
              <div class="dev-row"><span>Role:</span> <strong>{perms.role ?? 'none'}</strong></div>
              {#if perms.permissions === 'all'}
                <div class="dev-row"><strong>ALL (super_admin)</strong></div>
              {:else if Array.isArray(perms.permissions)}
                {#each perms.permissions as p}
                  <span class="dev-perm">{p.resource}:{p.action}</span>
                {/each}
                {#if perms.permissions.length === 0}
                  <div class="dev-row">No permissions</div>
                {/if}
              {/if}
            </div>
            {#if impersonating}
              <div>
                <h4>Impersonation</h4>
                <div class="dev-row"><span>Admin:</span> {session.user.email}</div>
                <div class="dev-row"><span>Viewing as:</span> <strong>{impersonating.targetEmail}</strong></div>
              </div>
            {/if}
          </div>
        </div>
      {/if}

      {#if !perms.role && perms.loaded}
        <div class="no-access">
          <h2>No role assigned</h2>
          <p>Your account has no role. Contact an administrator for access.</p>
        </div>
      {:else}
        {@render children()}
      {/if}
    </main>
  </div>
  {/if}
{:else}
  <div class="center-state">
    <p>You need to sign in.</p>
    <Button href="/">Sign in</Button>
  </div>
{/if}

<style>
  .center-state {
    text-align: center;
    padding: var(--space-16) var(--space-4);
    color: var(--text-muted);
  }

  .impersonation-banner {
    background: var(--danger-soft);
    color: var(--danger);
    padding: var(--space-2) var(--space-6);
    display: flex;
    justify-content: center;
    align-items: center;
    gap: var(--space-4);
    font-size: var(--text-sm);
    border-bottom: 1px solid var(--danger);
  }

  .shell {
    display: grid;
    grid-template-columns: 240px 1fr;
    min-height: 100vh;
  }

  .sidebar {
    background: var(--nav-bg);
    border-right: 1px solid var(--border);
    padding: var(--space-5) var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    position: sticky;
    top: 0;
    height: 100vh;
    overflow-y: auto;
  }

  .brand { padding-bottom: var(--space-4); border-bottom: 1px solid var(--border); }
  .brand-name {
    display: block;
    color: var(--accent);
    line-height: 0;
  }
  .brand-name :global(svg) {
    width: 100%;
    max-width: 160px;
    height: auto;
    display: block;
  }
  .brand-sub {
    font-size: var(--text-xs);
    color: var(--text-muted);
    margin-top: var(--space-2);
    letter-spacing: 0.02em;
  }

  .nav { display: flex; flex-direction: column; gap: var(--space-1); flex: 1; }
  .nav-item {
    position: relative;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    color: var(--nav-item-color);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    transition: background var(--motion-fast) var(--ease-out);
  }
  .nav-item:hover { background: var(--surface-sunk); }
  .nav-item.is-active {
    background: var(--nav-selected-bg);
    color: var(--heading-color);
  }
  .nav-item.is-active::before {
    content: '';
    position: absolute;
    left: -1px;
    top: 4px;
    bottom: 4px;
    width: 3px;
    border-radius: var(--radius-pill);
    background: var(--nav-selected-accent);
  }

  .sidebar-foot {
    padding-top: var(--space-4);
    border-top: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .profile {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    transition: background var(--motion-fast) var(--ease-out);
  }
  .profile:hover { background: var(--surface-sunk); }
  .profile-email {
    font-size: var(--text-xs);
    color: var(--text-muted);
    word-break: break-all;
  }
  .toggles { display: flex; gap: var(--space-2); flex-wrap: wrap; }
  .foot-actions { display: flex; gap: var(--space-3); }
  .foot-link {
    background: transparent;
    border: none;
    padding: 0;
    color: var(--text-muted);
    font-size: var(--text-xs);
    cursor: pointer;
    text-decoration: none;
  }
  .foot-link:hover { color: var(--text); }

  .content {
    padding: var(--space-6) var(--space-8);
    min-width: 0;
  }
  /* W17: content below the horizontal top-nav, full-width with padding */
  .topnav-content {
    padding: var(--space-6) var(--space-8);
    min-width: 0;
    background: var(--surface);
    min-height: calc(100vh - 56px);
  }
  .topnav-content > :global(*) {
    max-width: 1200px;
    margin-left: auto;
    margin-right: auto;
  }
  .content > :global(*) {
    max-width: 1200px;
    margin-left: 0;
    margin-right: auto;
  }

  .dev-panel {
    background: var(--surface-sunk);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: var(--space-4) var(--space-5);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    margin-bottom: var(--space-6);
  }
  .dev-header {
    color: var(--text-muted);
    font-weight: var(--weight-semibold);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
    margin-bottom: var(--space-3);
  }
  .dev-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: var(--space-4); }
  .dev-grid h4 {
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    margin-bottom: var(--space-2);
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
  }
  .dev-row { display: flex; gap: var(--space-2); margin-bottom: var(--space-1); }
  .dev-row span { color: var(--text-muted); }
  .dev-row code {
    background: var(--surface-raised);
    padding: 1px var(--space-1);
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
  }
  .dev-perm {
    display: inline-block;
    background: var(--badge-default-bg);
    color: var(--badge-default-color);
    padding: 1px var(--space-2);
    border-radius: var(--radius-sm);
    margin: 2px 4px 2px 0;
  }

  .no-access {
    text-align: center;
    padding: var(--space-16) var(--space-4);
  }
  .no-access h2 { color: var(--warning); margin-bottom: var(--space-2); }
  .no-access p { color: var(--text-muted); }

  .nav-overlay {
    position: fixed; inset: 0;
    background: rgba(0, 0, 0, 0.25);
    backdrop-filter: blur(2px);
    display: flex; align-items: center; justify-content: center;
    z-index: 900;
    animation: navOverlayIn 120ms ease-out;
  }
  .nav-overlay-card {
    display: inline-flex; align-items: center; gap: 12px;
    padding: 14px 22px;
    background: #ffffff;
    border-radius: 8px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
    color: #474a54;
    font-size: 0.95rem;
  }
  .nav-overlay-spinner {
    width: 22px; height: 22px; color: #59a370;
    animation: navOverlaySpin 0.8s linear infinite;
  }
  .nav-overlay-label { font-weight: 500; color: #2b3431; }
  @keyframes navOverlaySpin { to { transform: rotate(360deg); } }
  @keyframes navOverlayIn { from { opacity: 0 } to { opacity: 1 } }

  .app-footer {
    display: flex;
    justify-content: flex-end;
    padding: 8px 16px 16px;
    pointer-events: none;
  }
  .version-chip {
    pointer-events: auto;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 999px;
    color: var(--text-muted);
    text-decoration: none;
    border: 1px solid var(--border);
    background: var(--surface, #fff);
    opacity: 0.7;
    transition: opacity 120ms ease;
  }
  .version-chip:hover { opacity: 1; }
</style>
