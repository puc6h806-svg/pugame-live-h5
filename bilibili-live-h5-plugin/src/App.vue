<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import RuntimeView from './views/RuntimeView.vue'
import SettingsView from './views/SettingsView.vue'
import ErrorToast from './components/ErrorToast.vue'
import { parseQuery } from './lib/query'
import { verifySignature } from './lib/verify'
import { mapError } from './lib/errorMap'
import { endSession } from './lib/session'
import { isMock } from './lib/env'
import type { PlugEnv } from './lib/types'

const plugEnv = ref<PlugEnv>(0)
const verified = ref(false)
const verifying = ref(true)
const token = ref<string | undefined>()
const roomId = ref<number | undefined>()
const bootError = ref<string | null>(null)

onMounted(async () => {
  const q = parseQuery()
  plugEnv.value = q.plug_env

  const result = await verifySignature(q)
  verifying.value = false
  if (!result.ok) {
    bootError.value = mapError(result.code || 'UNAUTHORIZED', result.message)
    return
  }
  token.value = result.token
  roomId.value = result.roomId
  verified.value = true
})

onBeforeUnmount(() => {
  if (!isMock() && token.value) endSession(token.value)
})
</script>

<template>
  <div class="app-root" :data-plug-env="plugEnv">
    <div v-if="verifying" class="boot">正在连接会话…</div>
    <template v-else-if="verified">
      <RuntimeView v-if="plugEnv === 0" :token="token" :room-id="roomId" />
      <SettingsView v-else :token="token" :room-id="roomId" />
    </template>
    <div v-else class="boot fail">
      {{ bootError || '无法启动插件' }}
    </div>
    <ErrorToast :message="bootError && !verified && !verifying ? bootError : null" />
  </div>
</template>

<style scoped>
.app-root {
  width: 100%;
  height: 100%;
  min-height: 100vh;
  min-height: 100dvh;
}
.boot {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  min-height: 100dvh;
  padding: 24px;
  box-sizing: border-box;
  font-size: 14px;
  color: #ddd;
  background: #0e0f14;
  text-align: center;
}
.boot.fail {
  color: #ff8a80;
}
</style>
