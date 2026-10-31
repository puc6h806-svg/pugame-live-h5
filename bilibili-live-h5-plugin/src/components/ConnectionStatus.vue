<script setup lang="ts">
import { computed } from 'vue'
import type { ConnPhase } from '../lib/eventChannel'

const props = defineProps<{
  phase: ConnPhase
}>()

const LABEL: Record<Exclude<ConnPhase, 'hidden'>, string> = {
  connecting: '连接中',
  reconnecting: '已断开重连中',
  recovered: '已恢复',
}

const label = computed(() => (props.phase === 'hidden' ? '' : LABEL[props.phase]))
</script>

<template>
  <div class="conn-anchor">
    <Transition name="conn">
      <div v-if="label" class="conn-status" :data-phase="phase" role="status">
        {{ label }}
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.conn-anchor {
  position: absolute;
  top: calc(10px + var(--safe-top));
  padding-left: var(--safe-left);
  padding-right: var(--safe-right);
  left: 0;
  right: 0;
  z-index: 40;
  display: flex;
  justify-content: center;
  pointer-events: none;
}
.conn-status {
  padding: 4px 12px;
  border-radius: 999px;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  letter-spacing: 0.02em;
  white-space: nowrap;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.28);
}
.conn-status[data-phase='connecting'] {
  background: rgba(0, 92, 158, 0.92);
}
.conn-status[data-phase='reconnecting'] {
  background: rgba(168, 86, 0, 0.94);
}
.conn-status[data-phase='recovered'] {
  background: rgba(18, 122, 72, 0.94);
}
.conn-enter-active,
.conn-leave-active {
  transition: opacity 0.24s ease, transform 0.24s ease;
}
.conn-enter-from,
.conn-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
@media (prefers-reduced-motion: reduce) {
  .conn-enter-active,
  .conn-leave-active {
    transition: none;
  }
}
</style>
