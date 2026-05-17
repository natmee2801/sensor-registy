<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <nav class="app-nav">
    <RouterLink to="/" class="app-nav__brand">
      <span class="app-nav__brand-mark" aria-hidden="true">◐</span>
      <span class="app-nav__brand-text">Sensor Registry</span>
    </RouterLink>
    <div class="app-nav__links">
      <RouterLink to="/" class="app-nav__link" exact-active-class="app-nav__link--active">
        อุปกรณ์ทั้งหมด
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
  padding: 0.75rem 1rem;
  border-radius: 999px;
  background: var(--surface);
  border: 1px solid var(--stroke);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  margin-bottom: 1.5rem;
}

.app-nav__brand {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  text-decoration: none;
  color: var(--text);
  font-weight: 700;
  font-size: 0.95rem;
}

.app-nav__brand-mark {
  display: inline-grid;
  place-items: center;
  width: 1.85rem;
  height: 1.85rem;
  border-radius: 50%;
  background: linear-gradient(140deg, var(--accent), var(--accent-2));
  color: #07111f;
  font-size: 1rem;
  box-shadow: 0 8px 22px rgba(56, 189, 248, 0.3);
}

.app-nav__brand-text {
  letter-spacing: -0.01em;
}

.app-nav__links {
  display: flex;
  gap: 0.35rem;
}

.app-nav__link {
  padding: 0.5rem 0.85rem;
  border-radius: 999px;
  text-decoration: none;
  font-size: 0.84rem;
  font-weight: 600;
  color: rgba(226, 232, 240, 0.75);
  transition:
    background 0.2s ease,
    color 0.2s ease;
}

.app-nav__link:hover {
  color: var(--text);
  background: rgba(255, 255, 255, 0.05);
}

.app-nav__link--active {
  color: var(--text);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.06));
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.12) inset,
    0 8px 22px rgba(0, 0, 0, 0.35);
}

@media (max-width: 480px) {
  .app-nav {
    flex-direction: column;
    border-radius: var(--radius-lg);
    align-items: stretch;
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
