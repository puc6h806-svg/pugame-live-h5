<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import ConnectionStatus from '../components/ConnectionStatus.vue'
import DanmakuWall from '../components/DanmakuWall.vue'
import GiftLayer from '../components/GiftLayer.vue'
import ErrorToast from '../components/ErrorToast.vue'
import { fetchConfig, mergeConfig, saveLocalConfig } from '../lib/config'
import { createEventChannel, type ConnPhase, type EventChannel } from '../lib/eventChannel'
import { mapError } from '../lib/errorMap'
import { isMock } from '../lib/env'
import { DEFAULT_CONFIG, type DanmakuEvent, type GiftEvent, type PluginConfig } from '../lib/types'

const props = defineProps<{
  token?: string
  roomId?: number
}>()

const config = ref<PluginConfig>(structuredClone(DEFAULT_CONFIG))
const danmakuItems = shallowRef<DanmakuEvent[]>([])
const giftQueue = shallowRef<GiftEvent[]>([])
const toast = ref<string | null>(null)
const connPhase = ref<ConnPhase>('hidden')

let channel: EventChannel | null = null
let stopped = false
const LATENCY_BUDGET_MS = 500
const mockMode = isMock()

function pushDanmaku(ev: DanmakuEvent) {
  if (!config.value.danmaku.enabled) return
  const start = performance.now()
  const maxKeep = Math.max(20, (config.value.danmaku.maxLines || 8) * 3)
  const next = danmakuItems.value.concat(ev)
  danmakuItems.value = next.length > maxKeep ? next.slice(-maxKeep) : next
  requestAnimationFrame(() => {
    const elapsed = performance.now() - start
    if (elapsed > LATENCY_BUDGET_MS) {
      console.warn(`[danmaku] wall latency ${elapsed.toFixed(1)}ms > ${LATENCY_BUDGET_MS}ms`)
    }
  })
}

watch(
  () => config.value.danmaku.enabled,
  (enabled) => {
    if (!enabled) danmakuItems.value = []
  },
)

function onConsumedGift(id: string) {
  giftQueue.value = giftQueue.value.filter((g) => g.id !== id)
}

onMounted(async () => {
  config.value = await fetchConfig(props.roomId != null ? { roomId: props.roomId } : undefined)
  if (stopped) return

  channel = createEventChannel(
    (ev) => {
      switch (ev.type) {
        case 'danmaku':
          if (config.value.danmaku.enabled) pushDanmaku(ev)
          break
        case 'gift':
          if (config.value.gift.enabled) {
            giftQueue.value = giftQueue.value.concat(ev)
          }
          break
        case 'config_updated':
          config.value = mergeConfig(config.value, ev.config)
          saveLocalConfig(config.value)
          break
        case 'error':
          toast.value = mapError(ev.code, ev.message)
          break
      }
    },
    {
      token: props.token,
      onStatus: (phase) => {
        connPhase.value = phase
      },
    },
  )
  channel.connect()
})

onBeforeUnmount(() => {
  stopped = true
  channel?.disconnect()
  channel = null
})

function onDevError() {
  channel?.triggerError?.('MSG_TYPE')
}
</script>

<template>
  <div class="runtime">
    <DanmakuWall :items="danmakuItems" :config="config.danmaku" />
    <GiftLayer :queue="giftQueue" :config="config.gift" @consumed="onConsumedGift" />
    <ConnectionStatus :phase="connPhase" />
    <ErrorToast :message="toast" @clear="toast = null" />

    <div v-if="mockMode" class="dev-bar">
      <button type="button" @click="onDevError">触发 error</button>
      <span class="dev-hint">mock 事件中</span>
    </div>
  </div>
</template>

<style scoped>
.runtime {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 240px;
  overflow: hidden;
  background: transparent;
}
.dev-bar {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 8px;
  pointer-events: auto;
}
.dev-bar button {
  appearance: none;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
}
.dev-hint {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.55);
}
</style>
