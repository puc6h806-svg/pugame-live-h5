<script setup lang="ts">
import { onMounted, ref } from 'vue'
import SettingsForm from '../components/SettingsForm.vue'
import ErrorToast from '../components/ErrorToast.vue'
import DanmakuWall from '../components/DanmakuWall.vue'
import { fetchConfig, saveConfig } from '../lib/config'
import { mapError } from '../lib/errorMap'
import { DEFAULT_CONFIG, type DanmakuEvent, type PluginConfig } from '../lib/types'

const props = defineProps<{
  token?: string
  roomId?: number
}>()

const config = ref<PluginConfig>(structuredClone(DEFAULT_CONFIG))
const saving = ref(false)
const toast = ref<string | null>(null)
const showPreview = ref(true)
const previewItems = ref<DanmakuEvent[]>([
  {
    type: 'danmaku',
    id: 'preview-1',
    uid: '0',
    msg: '这是设置态预览弹幕',
    uname: '预览用户',
    ts: Date.now(),
  },
  {
    type: 'danmaku',
    id: 'preview-2',
    uid: '0',
    msg: '保存后运行态会生效',
    uname: '小助手',
    ts: Date.now(),
  },
])

onMounted(async () => {
  config.value = await fetchConfig(
    props.roomId != null ? { roomId: props.roomId } : undefined,
  )
})

async function onSave() {
  saving.value = true
  try {
    config.value = await saveConfig(
      config.value,
      props.roomId != null ? { roomId: props.roomId } : undefined,
    )
    toast.value = '配置已保存'
  } catch (e) {
    const code = e instanceof Error && 'code' in e ? String((e as { code: string }).code) : 'CONFIG_SAVE_FAIL'
    const msg = e instanceof Error ? e.message : undefined
    toast.value = mapError(code, msg)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="settings">
    <header class="head">
      <h1>插件设置</h1>
      <p>弹幕墙 + 礼物特效 · 保存后通过 config_updated 同步运行态</p>
    </header>

    <SettingsForm v-model="config" :saving="saving" @save="onSave" />

    <div class="preview-toggle">
      <label>
        <input v-model="showPreview" type="checkbox" />
        显示预览条
      </label>
    </div>

    <div v-if="showPreview" class="preview-box">
      <div class="preview-label">运行态预览</div>
      <div class="preview-stage">
        <DanmakuWall :items="previewItems" :config="config.danmaku" />
      </div>
    </div>

    <ErrorToast :message="toast" @clear="toast = null" />
  </div>
</template>

<style scoped>
.settings {
  min-height: 100%;
  padding: 20px 16px 32px;
  box-sizing: border-box;
  background: #0e0f14;
  color: #e8e9ef;
}
.head h1 {
  margin: 0 0 4px;
  font-size: 18px;
  font-weight: 700;
}
.head p {
  margin: 0 0 16px;
  font-size: 12px;
  color: #8b8e9c;
}
.preview-toggle {
  margin-top: 16px;
  font-size: 13px;
  color: #aab;
}
.preview-toggle input {
  margin-right: 6px;
  accent-color: #00a1d6;
}
.preview-box {
  margin-top: 10px;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid #2a2b36;
}
.preview-label {
  padding: 6px 10px;
  font-size: 11px;
  color: #889;
  background: #16171f;
}
.preview-stage {
  position: relative;
  height: 140px;
  background: linear-gradient(180deg, #1c2030, #12141c);
}
</style>
