<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { createGiftShow, type GiftCard } from '../lib/giftShow'
import type { GiftEvent, PluginConfig } from '../lib/types'

const props = defineProps<{
  queue: GiftEvent[]
  config: PluginConfig['gift']
}>()

const emit = defineEmits<{ consumed: [id: string] }>()

const active = ref<GiftCard<GiftEvent> | null>(null)
const seen = new Set<string>()
let alive = true
let leaveFallback = 0

function clearLeaveFallback() {
  if (leaveFallback) {
    clearTimeout(leaveFallback)
    leaveFallback = 0
  }
}

function emitConsumed(ids: string[]) {
  for (const id of ids) emit('consumed', id)
}

const show = createGiftShow<GiftEvent>({
  now: () => Date.now(),
  durationMs: () => props.config.durationMs,
  later: (ms, fn) => {
    const id = window.setTimeout(fn, ms)
    return () => clearTimeout(id)
  },
  onShow: (card) => {
    const was = active.value
    active.value = card
    if (!card && was && alive) {
      clearLeaveFallback()
      leaveFallback = window.setTimeout(() => show.release(), 420)
    }
  },
  onConsumed: (ids) => emitConsumed(ids),
})

function ingest(ev: GiftEvent) {
  if (seen.has(ev.id)) return
  seen.add(ev.id)
  if (!props.config.enabled || ev.price < (props.config.minPrice ?? 0)) {
    emit('consumed', ev.id)
    return
  }
  show.push(ev)
}

watch(
  () => props.queue,
  (q) => {
    for (const ev of q) ingest(ev)
  },
  { immediate: true },
)

watch(
  () => props.config.enabled,
  (enabled) => {
    if (!enabled) {
      clearLeaveFallback()
      show.clear()
    }
  },
)

function onAfterLeave() {
  clearLeaveFallback()
  show.release()
}

onBeforeUnmount(() => {
  alive = false
  clearLeaveFallback()
  show.clear()
})
</script>

<template>
  <div class="gift-layer" aria-live="polite">
    <Transition name="gift" @after-leave="onAfterLeave">
      <div
        v-if="active"
        :key="active.key"
        class="gift-card"
        :data-num="active.gift.num"
        :data-hits="active.hits"
      >
        <div class="gift-icon" aria-hidden="true">
          <img
            v-if="active.gift.giftIcon"
            :src="active.gift.giftIcon"
            alt=""
            @error="($event.target as HTMLImageElement).style.display = 'none'"
          />
          <span v-else class="gift-fallback">🎁</span>
        </div>
        <div class="gift-meta">
          <div class="gift-line">
            <strong>{{ active.gift.uname }}</strong>
            投喂
            <em>{{ active.gift.giftName }}</em>
            <span v-if="active.hits > 1 || active.gift.num > 1" class="combo" :key="active.bump">
              <span v-if="active.hits > 1" class="combo-tag">连击</span>
              <span v-if="active.gift.num > 1" class="x">×{{ active.gift.num }}</span>
            </span>
          </div>
          <div v-if="active.gift.price > 0" class="gift-price">
            ¥{{ (active.gift.price / 1000).toFixed(1) }}
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.gift-layer {
  position: absolute;
  inset: 0;
  z-index: 10;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
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
.combo {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  margin-left: 4px;
  animation: combo-pop 0.32s cubic-bezier(0.2, 1.6, 0.4, 1);
}
.combo-tag {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  padding: 1px 6px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.28);
}
.x {
  font-weight: 800;
  font-size: 22px;
  line-height: 1;
  color: #ffe082;
  font-variant-numeric: tabular-nums;
  text-shadow: 0 2px 0 rgba(0, 0, 0, 0.18);
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
@keyframes combo-pop {
  0% {
    transform: scale(0.55);
    opacity: 0.35;
  }
  55% {
    transform: scale(1.35);
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .combo,
  .gift-enter-active,
  .gift-leave-active {
    animation: none;
    transition: none;
  }
}
</style>
