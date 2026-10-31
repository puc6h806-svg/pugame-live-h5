<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import type { GiftEvent, PluginConfig } from '../lib/types'

interface ActiveGift {
  key: string
  event: GiftEvent
  objectUrl?: string
}

const props = defineProps<{
  queue: GiftEvent[]
  config: PluginConfig['gift']
}>()

const emit = defineEmits<{ consumed: [id: string] }>()

const active = ref<ActiveGift[]>([])
const timers = new Map<string, number>()

function cleanupOne(key: string) {
  const t = timers.get(key)
  if (t) clearTimeout(t)
  timers.delete(key)
  const idx = active.value.findIndex((g) => g.key === key)
  if (idx >= 0) {
    const item = active.value[idx]!
    if (item.objectUrl) URL.revokeObjectURL(item.objectUrl)
    const id = item.event.id
    active.value.splice(idx, 1)
    emit('consumed', id)
  }
}

function mountGift(ev: GiftEvent) {
  if (!props.config.enabled) {
    emit('consumed', ev.id)
    return
  }
  if (ev.price < (props.config.minPrice ?? 0)) {
    emit('consumed', ev.id)
    return
  }
  const key = ev.id
  // Avoid duplicate mounts
  if (active.value.some((g) => g.key === key)) return

  const entry: ActiveGift = { key, event: ev }
  active.value.push(entry)

  const duration = Math.max(800, props.config.durationMs || 3000)
  const tid = window.setTimeout(() => cleanupOne(key), duration)
  timers.set(key, tid)
}

watch(
  () => props.queue,
  (q) => {
    for (const ev of q) {
      if (!active.value.some((g) => g.key === ev.id)) {
        mountGift(ev)
      }
    }
  },
  { deep: true, immediate: true },
)

onBeforeUnmount(() => {
  for (const key of [...timers.keys()]) cleanupOne(key)
  active.value = []
})
</script>

<template>
  <div class="gift-layer" aria-live="polite">
    <TransitionGroup name="gift">
      <div
        v-for="g in active"
        :key="g.key"
        class="gift-card"
      >
        <div class="gift-icon" aria-hidden="true">
          <img v-if="g.event.giftIcon" :src="g.event.giftIcon" alt="" @error="($event.target as HTMLImageElement).style.display='none'" />
          <span v-else class="gift-fallback">🎁</span>
        </div>
        <div class="gift-meta">
          <div class="gift-line">
            <strong>{{ g.event.uname }}</strong>
            投喂
            <em>{{ g.event.giftName }}</em>
            <span v-if="g.event.num > 1" class="x">×{{ g.event.num }}</span>
          </div>
          <div v-if="g.event.price > 0" class="gift-price">¥{{ (g.event.price / 1000).toFixed(1) }}</div>
        </div>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.gift-layer {
  position: absolute;
  inset: 0;
  z-index: 10; /* higher than danmaku wall */
  pointer-events: none;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 10px;
  padding: 16px;
  box-sizing: border-box;
}
.gift-card {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 200px;
  max-width: min(92vw, 360px);
  padding: 12px 16px;
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(255, 102, 153, 0.92), rgba(255, 60, 100, 0.88));
  color: #fff;
  box-shadow: 0 8px 28px rgba(255, 40, 80, 0.35);
  will-change: transform, opacity;
}
.gift-icon {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}
.gift-icon img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.gift-fallback {
  font-size: 28px;
  line-height: 1;
}
.gift-meta {
  min-width: 0;
}
.gift-line {
  font-size: 14px;
  line-height: 1.35;
  word-break: break-word;
}
.gift-line strong {
  font-weight: 700;
}
.gift-line em {
  font-style: normal;
  font-weight: 700;
  margin: 0 2px;
}
.gift-line .x {
  margin-left: 4px;
  font-weight: 700;
  color: #ffe082;
}
.gift-price {
  margin-top: 2px;
  font-size: 11px;
  opacity: 0.85;
}
.gift-enter-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}
.gift-leave-active {
  transition: opacity 0.28s ease, transform 0.28s ease;
}
.gift-enter-from {
  opacity: 0;
  transform: scale(0.85) translateY(12px);
}
.gift-leave-to {
  opacity: 0;
  transform: scale(1.05) translateY(-8px);
}
</style>
