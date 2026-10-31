<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import IdentityBadge from './IdentityBadge.vue'
import { isHighlighted } from '../lib/highlight'
import { resolveIdentityBadge } from '../lib/identity'
import type { DanmakuEvent, PluginConfig } from '../lib/types'

const props = withDefaults(
  defineProps<{
    items: DanmakuEvent[]
    config: PluginConfig['danmaku']
    /** Full-viewport wall clears notches. Off inside the settings preview. */
    safeInset?: boolean
    /** overlay fills the viewport; flow stacks every line in document flow. */
    layout?: 'overlay' | 'flow'
  }>(),
  { safeInset: true, layout: 'overlay' },
)

const listEl = ref<HTMLElement | null>(null)

function roleOf(identity: DanmakuEvent['identity']): string | undefined {
  return resolveIdentityBadge(identity)?.role
}

function accentOf(identity: DanmakuEvent['identity']): string | undefined {
  return resolveIdentityBadge(identity)?.accent
}

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
  <div
    class="danmaku-wall"
    :class="{ disabled: !config.enabled, 'safe-inset': safeInset && layout === 'overlay', flow: layout === 'flow' }"
  >
    <div ref="listEl" class="danmaku-list">
      <div
        v-for="d in visible"
        :key="d.id"
        class="danmaku-item"
        :class="{ 'is-highlight': isHighlighted(d) }"
        :data-identity="roleOf(d.identity)"
        :style="accentOf(d.identity) ? { '--id-accent': accentOf(d.identity) } : undefined"
      >
        <span
          v-if="config.showAvatar"
          class="avatar"
          :style="d.avatar ? { backgroundImage: `url(${d.avatar})` } : undefined"
          aria-hidden="true"
        >{{ d.avatar ? '' : (d.uname.slice(0, 1) || '?') }}</span>
        <span class="body">
          <span class="uname"><IdentityBadge :identity="d.identity" />{{ d.uname }}</span>
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
.danmaku-wall.safe-inset {
  padding:
    calc(12px + var(--safe-top))
    calc(12px + var(--safe-right))
    calc(14px + var(--safe-bottom))
    calc(12px + var(--safe-left));
}
.danmaku-wall.flow {
  position: relative;
  inset: auto;
  width: 100%;
  height: auto;
  justify-content: flex-start;
  padding: 4px 12px 12px;
}
.danmaku-wall.flow .danmaku-list {
  overflow: visible;
  max-height: none;
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
.danmaku-item[data-identity] {
  border-left: 3px solid var(--id-accent, rgba(255, 255, 255, 0.16));
}
.danmaku-item.is-highlight {
  background: linear-gradient(100deg, rgba(255, 196, 0, 0.46), rgba(6, 8, 14, 0.9) 48%);
  box-shadow:
    0 0 0 1px rgba(255, 210, 60, 0.95),
    0 4px 18px rgba(255, 180, 0, 0.32);
}
.danmaku-item.is-highlight .text {
  color: #ffe7a3;
  font-weight: 700;
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
