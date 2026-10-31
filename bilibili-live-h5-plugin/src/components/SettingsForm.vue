<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import type { PluginConfig } from '../lib/types'

const props = defineProps<{
  modelValue: PluginConfig
  saving?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [PluginConfig]
  save: []
}>()

const form = reactive({
  danmaku: { ...props.modelValue.danmaku },
  gift: { ...props.modelValue.gift },
  openedMsgTypes: { ...props.modelValue.openedMsgTypes },
})

watch(
  () => props.modelValue,
  (v) => {
    Object.assign(form.danmaku, v.danmaku)
    Object.assign(form.gift, v.gift)
    Object.assign(form.openedMsgTypes ?? {}, v.openedMsgTypes ?? {})
  },
  { deep: true },
)

const danmakuLocked = computed(() => form.openedMsgTypes?.danmaku === false)
const giftLocked = computed(() => form.openedMsgTypes?.gift === false)

function syncOut() {
  emit('update:modelValue', {
    danmaku: { ...form.danmaku },
    gift: { ...form.gift },
    openedMsgTypes: { ...form.openedMsgTypes },
  })
}

function onSave() {
  syncOut()
  emit('save')
}
</script>

<template>
  <form class="settings-form" @submit.prevent="onSave">
    <section class="block" :class="{ locked: danmakuLocked }">
      <header class="block-head">
        <h3>弹幕墙</h3>
        <span v-if="danmakuLocked" class="badge">未开通消息类型</span>
      </header>
      <p v-if="danmakuLocked" class="hint">danmaku 消息类型未开通，请在开放平台开通后再启用。</p>
      <label class="row">
        <span>启用弹幕</span>
        <input
          v-model="form.danmaku.enabled"
          type="checkbox"
          :disabled="danmakuLocked"
          @change="syncOut"
        />
      </label>
      <label class="row">
        <span>最大行数</span>
        <input
          v-model.number="form.danmaku.maxLines"
          type="number"
          min="1"
          max="30"
          :disabled="danmakuLocked"
          @change="syncOut"
        />
      </label>
      <label class="row">
        <span>显示头像</span>
        <input
          v-model="form.danmaku.showAvatar"
          type="checkbox"
          :disabled="danmakuLocked"
          @change="syncOut"
        />
      </label>
    </section>

    <section class="block" :class="{ locked: giftLocked }">
      <header class="block-head">
        <h3>礼物特效</h3>
        <span v-if="giftLocked" class="badge">未开通消息类型</span>
      </header>
      <p v-if="giftLocked" class="hint">gift 消息类型未开通，请在开放平台开通后再启用。</p>
      <label class="row">
        <span>启用礼物</span>
        <input
          v-model="form.gift.enabled"
          type="checkbox"
          :disabled="giftLocked"
          @change="syncOut"
        />
      </label>
      <label class="row">
        <span>最低价格（厘）</span>
        <input
          v-model.number="form.gift.minPrice"
          type="number"
          min="0"
          step="100"
          :disabled="giftLocked"
          @change="syncOut"
        />
      </label>
      <label class="row">
        <span>展示时长（ms）</span>
        <input
          v-model.number="form.gift.durationMs"
          type="number"
          min="800"
          step="100"
          :disabled="giftLocked"
          @change="syncOut"
        />
      </label>
    </section>

    <button class="save-btn" type="submit" :disabled="saving">
      {{ saving ? '保存中…' : '保存配置' }}
    </button>
  </form>
</template>

<style scoped>
.settings-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.block {
  padding: 14px;
  border-radius: 10px;
  background: #1a1b24;
  border: 1px solid #2a2b36;
}
.block.locked {
  opacity: 0.72;
  filter: grayscale(0.35);
}
.block-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.block-head h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 650;
  color: #f2f3f7;
}
.badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background: #4a3020;
  color: #ffb074;
}
.hint {
  margin: 0 0 10px;
  font-size: 12px;
  color: #c9a27a;
  line-height: 1.4;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  font-size: 13px;
  color: #c8cad4;
  border-top: 1px solid #262733;
}
.row input[type='number'] {
  width: 96px;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid #353645;
  background: #12131a;
  color: #eee;
}
.row input[type='checkbox'] {
  width: 18px;
  height: 18px;
  accent-color: #00a1d6;
}
.save-btn {
  appearance: none;
  border: none;
  border-radius: 8px;
  padding: 12px 16px;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  background: linear-gradient(90deg, #00a1d6, #00b5e5);
  cursor: pointer;
}
.save-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
