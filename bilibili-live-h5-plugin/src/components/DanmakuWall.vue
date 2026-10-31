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
  () => visible.value[visible.value.length - 1]?.id,
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
      <div v-for="d in visible" :key="d.id" class="danmaku-item">
        <span
          v-if="config.showAvatar"
          class="avatar"
          :style="d.avatar ? { backgroundImage: `url(${d.avatar})` } : undefined"
          aria-hidden="true"
        >{{ d.avatar ? '' : (d.uname.slice(0, 1) || '?') }}</span>
        <span class="body">
          <span class="uname">{{ d.uname }}</span>
          <span class="text">{{ d.msg }}</span>
        </span>
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
  padding: 12px 12px 14px;
  box-sizing: border-box;
}
.danmaku-wall.disabled .danmaku-list {
  visibility: hidden;
}
.danmaku-list {
  max-height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.danmaku-item {
  display: inline-flex;
  align-items: flex-start;
  gap: 8px;
  align-self: flex-start;
  max-width: min(100%, 34em);
  padding: 6px 12px 6px 6px;
  border-radius: 16px;
  background: rgba(6, 8, 14, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.16);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
  color: #fff;
  line-height: 1.35;
  animation: fade-in 0.16s ease-out;
}
.avatar {
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  margin-top: 1px;
  border-radius: 50%;
  background: #2c3142 center/cover no-repeat;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.28);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  color: #f2f4f8;
}
.body {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  column-gap: 6px;
  row-gap: 1px;
  min-width: 0;
  padding-top: 2px;
}
.uname {
  color: #9ad2ff;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  white-space: nowrap;
}
.uname::after {
  content: '：';
  color: rgba(255, 255, 255, 0.42);
  font-weight: 400;
}
.text {
  color: #fff;
  font-size: 15px;
  font-weight: 500;
  line-height: 1.45;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.55);
  word-break: break-word;
}
@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
@media (prefers-reduced-motion: reduce) {
  .danmaku-item {
    animation: none;
  }
}
</style>
