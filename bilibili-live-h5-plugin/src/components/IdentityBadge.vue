<script setup lang="ts">
import { computed } from 'vue'
import { resolveIdentityBadge } from '../lib/identity'

const props = defineProps<{
  identity?: unknown
}>()

const badge = computed(() => resolveIdentityBadge(props.identity))
</script>

<template>
  <span
    v-if="badge"
    class="id-badge"
    :data-role="badge.role"
    :style="{ '--id-accent': badge.accent }"
  >{{ badge.label }}</span>
</template>

<style scoped>
.id-badge {
  display: inline-block;
  margin-right: 4px;
  padding: 0 5px;
  border-radius: 999px;
  border: 1px solid var(--id-accent, currentColor);
  color: var(--id-accent, #fff);
  background: rgba(0, 0, 0, 0.28);
  font-size: 10px;
  font-weight: 700;
  line-height: 1.55;
  letter-spacing: 0.04em;
  vertical-align: 1px;
}
.id-badge[data-role='member'] {
  font-weight: 600;
  background: transparent;
}
</style>
