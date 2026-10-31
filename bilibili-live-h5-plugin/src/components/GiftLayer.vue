<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import GiftCard from './GiftCard.vue'
import { createGiftShow, type GiftCard as GiftCardState } from '../lib/giftShow'
import type { GiftEvent, PluginConfig } from '../lib/types'

const props = defineProps<{
  queue: GiftEvent[]
  config: PluginConfig['gift']
}>()

const emit = defineEmits<{ consumed: [id: string] }>()

const active = ref<GiftCardState<GiftEvent> | null>(null)
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
      <GiftCard
        v-if="active"
        :key="active.key"
        :gift="active.gift"
        :hits="active.hits"
        :bump="active.bump"
      />
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
  padding:
    calc(16px + var(--safe-top))
    calc(16px + var(--safe-right))
    calc(16px + var(--safe-bottom))
    calc(16px + var(--safe-left));
  box-sizing: border-box;
}
.gift-layer :deep(.gift-enter-active) {
  transition: opacity 0.22s ease, transform 0.22s ease;
}
.gift-layer :deep(.gift-leave-active) {
  transition: opacity 0.28s ease, transform 0.28s ease;
}
.gift-layer :deep(.gift-enter-from) {
  opacity: 0;
  transform: scale(0.85) translateY(12px);
}
.gift-layer :deep(.gift-leave-to) {
  opacity: 0;
  transform: scale(1.05) translateY(-8px);
}
@media (prefers-reduced-motion: reduce) {
  .gift-layer :deep(.gift-enter-active),
  .gift-layer :deep(.gift-leave-active) {
    transition: none;
  }
}
</style>
