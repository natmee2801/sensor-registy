<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <nav class="app-nav">
    <RouterLink to="/" class="app-nav__brand">
      <span class="app-nav__brand-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="14" height="14">
          <path
            d="M12 2.5a6 6 0 0 0-3.6 10.8c.6.4.9 1 .9 1.7v.4h5.4v-.4c0-.7.3-1.3.9-1.7A6 6 0 0 0 12 2.5Z M9.6 18h4.8 M10.4 20.5h3.2"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </span>
      <span class="app-nav__brand-text">
        Lumen<span class="app-nav__brand-soft">.registry</span>
      </span>
    </RouterLink>
    <div class="app-nav__links">
      <RouterLink to="/" class="app-nav__link" exact-active-class="app-nav__link--active">
        อุปกรณ์
      </RouterLink>
    </div>
  </nav>
</template>

<style scoped>
.app-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.4rem 0.55rem 0.4rem 0.85rem;
  border-radius: 999px;
  background: var(--surface);
  border: 1px solid var(--stroke);
  box-shadow: var(--shadow-sm);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  margin-bottom: clamp(0.65rem, 2vw, 1rem);
}

.app-nav__brand {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  text-decoration: none;
  color: var(--text);
  font-weight: 700;
  font-size: 0.95rem;
  letter-spacing: -0.01em;
}

.app-nav__brand-mark {
  display: inline-grid;
  place-items: center;
  width: 1.6rem;
  height: 1.6rem;
  border-radius: 50%;
  background: linear-gradient(140deg, #fcd34d 0%, #f59e0b 60%, #c2410c 100%);
  color: #422006;
  box-shadow:
    inset 0 0 0 1px rgba(120, 53, 15, 0.18),
    0 4px 10px rgba(245, 158, 11, 0.28);
}

.app-nav__brand-soft {
  color: var(--muted);
  font-weight: 500;
}

.app-nav__links {
  display: flex;
  gap: 0.25rem;
}

.app-nav__link {
  padding: 0.38rem 0.9rem;
  border-radius: 999px;
  text-decoration: none;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-2);
  transition:
    background 0.18s ease,
    color 0.18s ease;
}

.app-nav__link:hover {
  color: var(--text);
  background: var(--surface-sunk);
}

.app-nav__link--active {
  color: var(--warm-strong);
  background: var(--accent-soft);
  box-shadow: inset 0 0 0 1px rgba(245, 158, 11, 0.28);
}

@media (max-width: 480px) {
  .app-nav {
    flex-direction: column;
    border-radius: var(--radius-lg);
    align-items: stretch;
    padding: 0.8rem 0.85rem;
  }

  .app-nav__brand {
    justify-content: center;
  }

  .app-nav__links {
    justify-content: stretch;
  }

  .app-nav__link {
    flex: 1;
    text-align: center;
  }
}
</style>
