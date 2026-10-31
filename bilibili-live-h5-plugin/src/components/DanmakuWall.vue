<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { DanmakuEvent, PluginConfig } from '../lib/types'

const props = defineProps<{
  items: DanmakuEvent[]
  config: PluginConfig['danmaku']
}>()

const listEl = ref<HTMLElement | null>(null)

const visible = computed(() => {
  if (!props.config.enabled) return []
  const max = Math.max(1, props.config.maxLines || 8)
  return props.items.slice(-max)
})

watch(
  () => visible.value.length,
  async () => {
    await nextTick()
    const el = listEl.value
    if (el) el.scrollTop = el.scrollHeight
  },
)
</script>

<template>
  <div class="danmaku-wall" :class="{ disabled: !config.enabled }">
    <div ref="listEl" class="danmaku-list">
      <div
        v-for="d in visible"
        :key="d.id"
        class="danmaku-item"
      >
        <span
          v-if="config.showAvatar"
          class="avatar"
          :style="d.avatar ? { backgroundImage: `url(${d.avatar})` } : undefined"
          aria-hidden="true"
        >{{ d.avatar ? '' : (d.uname.slice(0, 1) || '?') }}</span>
        <span class="uname">{{ d.uname }}</span>
        <span class="text">{{ d.msg }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.danmaku-wall {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 12px;
  box-sizing: border-box;
}
.danmaku-wall.disabled {
  opacity: 0.35;
}
.danmaku-list {
  max-height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.danmaku-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  max-width: 100%;
  padding: 4px 10px 4px 4px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  font-size: 13px;
  line-height: 1.3;
  animation: fade-in 0.18s ease-out;
  will-change: transform, opacity;
}
.avatar {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #3a3a4a center/cover no-repeat;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: #ddd;
}
.uname {
  color: #7ec8ff;
  font-weight: 600;
  white-space: nowrap;
}
.uname::after {
  content: '：';
  color: rgba(255, 255, 255, 0.55);
  font-weight: 400;
}
.text {
  word-break: break-word;
}
@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
