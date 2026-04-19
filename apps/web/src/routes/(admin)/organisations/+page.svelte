<script lang="ts">
</script>

<div class="container">
  <div class="hero">
    <div class="icon">
      <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
        <line x1="6" y1="11" x2="6" y2="11.01"/>
        <line x1="10" y1="11" x2="10" y2="11.01"/>
        <line x1="14" y1="11" x2="14" y2="11.01"/>
        <line x1="18" y1="11" x2="18" y2="11.01"/>
        <line x1="6" y1="15" x2="6" y2="15.01"/>
        <line x1="10" y1="15" x2="10" y2="15.01"/>
        <line x1="14" y1="15" x2="14" y2="15.01"/>
        <line x1="18" y1="15" x2="18" y2="15.01"/>
      </svg>
    </div>
    <h1>Organisations</h1>
    <p class="subtitle">Billing entities, legal structures, and commercial relationships</p>
    <div class="status">
      <span class="badge">Coming Soon</span>
      <span class="phase">Stage 2 of 16</span>
    </div>
    <div class="features">
      <div class="feature">
        <div class="feature-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        </div>
        <div>
          <h3>Organisation Management</h3>
          <p>Create and manage billing entities with legal entity links, community visibility, and multi-currency support.</p>
        </div>
      </div>
      <div class="feature">
        <div class="feature-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        </div>
        <div>
          <h3>Legal Entity Separation</h3>
          <p>Clean separation between commercial organisations and legal entities for accounting, tax, and compliance.</p>
        </div>
      </div>
      <div class="feature">
        <div class="feature-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
        </div>
        <div>
          <h3>Multi-Currency Billing</h3>
          <p>ZAR, USD, KES and beyond. Each organisation bills in its own currency with consistent pricing.</p>
        </div>
      </div>
    </div>
    <div class="progress">
      <div class="progress-bar">
        <div class="progress-fill"></div>
      </div>
      <span class="progress-text">Schema defined. CRUD next.</span>
    </div>
  </div>
</div>

<style>
  .container { max-width: 720px; margin: 0 auto; padding: 3rem 2rem; font-family: system-ui, sans-serif; }
  .hero { text-align: center; }
  .icon { color: #2d6a35; margin-bottom: 1.5rem; }
  h1 { font-size: 2rem; font-weight: 700; color: #0a1f0f; margin-bottom: 0.5rem; }
  .subtitle { color: #5a7060; font-size: 1rem; margin-bottom: 2rem; line-height: 1.6; }
  .status { display: flex; justify-content: center; gap: 1rem; align-items: center; margin-bottom: 3rem; }
  .badge { background: linear-gradient(135deg, #2d6a35, #4caf64); color: white; padding: 0.4rem 1.2rem; border-radius: 100px; font-size: 0.8rem; font-weight: 600; letter-spacing: 0.5px; }
  .phase { color: #5a7060; font-size: 0.85rem; font-family: monospace; }
  .features { display: flex; flex-direction: column; gap: 1.25rem; margin-bottom: 3rem; text-align: left; }
  .feature { display: flex; gap: 1rem; background: white; border: 1px solid #c8deca; border-radius: 10px; padding: 1.25rem; }
  .feature-icon { color: #2d6a35; flex-shrink: 0; margin-top: 2px; }
  .feature h3 { font-size: 0.95rem; font-weight: 600; color: #0a1f0f; margin: 0 0 0.35rem; }
  .feature p { font-size: 0.85rem; color: #5a7060; margin: 0; line-height: 1.5; }
  .progress { margin-top: 1rem; }
  .progress-bar { height: 6px; background: #e8f5ea; border-radius: 3px; overflow: hidden; margin-bottom: 0.5rem; }
  .progress-fill { width: 15%; height: 100%; background: linear-gradient(90deg, #2d6a35, #4caf64); border-radius: 3px; }
  .progress-text { font-size: 0.8rem; color: #5a7060; font-family: monospace; }
</style>
