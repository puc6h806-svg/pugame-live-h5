<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { KEYWORD_MAX, parseKeywordDraft } from '../lib/keywords'
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
  danmaku: {
    ...props.modelValue.danmaku,
    highlightKeywords: [...props.modelValue.danmaku.highlightKeywords],
    blockKeywords: [...props.modelValue.danmaku.blockKeywords],
  },
  gift: { ...props.modelValue.gift },
  openedMsgTypes: { ...props.modelValue.openedMsgTypes },
})

function joinKeywords(list: readonly string[] | undefined): string {
  return (list ?? []).join('\n')
}

const highlightInput = ref(joinKeywords(props.modelValue.danmaku.highlightKeywords))
const blockInput = ref(joinKeywords(props.modelValue.danmaku.blockKeywords))
let appliedHighlight = highlightInput.value
let appliedBlock = blockInput.value

watch(
  () => props.modelValue,
  (v) => {
    Object.assign(form.danmaku, v.danmaku)
    Object.assign(form.gift, v.gift)
    Object.assign(form.openedMsgTypes ?? {}, v.openedMsgTypes ?? {})
    const h = joinKeywords(v.danmaku.highlightKeywords)
    if (h !== appliedHighlight) {
      appliedHighlight = h
      highlightInput.value = h
    }
    const b = joinKeywords(v.danmaku.blockKeywords)
    if (b !== appliedBlock) {
      appliedBlock = b
      blockInput.value = b
    }
  },
  { deep: true },
)

const danmakuLocked = computed(() => form.openedMsgTypes?.danmaku === false)
const giftLocked = computed(() => form.openedMsgTypes?.gift === false)
const highlightDraft = computed(() => parseKeywordDraft(highlightInput.value, '高亮关键词'))
const blockDraft = computed(() => parseKeywordDraft(blockInput.value, '屏蔽关键词'))
const keywordInvalid = computed(() => !!highlightDraft.value.error || !!blockDraft.value.error)

function syncOut() {
  emit('update:modelValue', {
    danmaku: {
      ...form.danmaku,
      highlightKeywords: [...form.danmaku.highlightKeywords],
      blockKeywords: [...form.danmaku.blockKeywords],
    },
    gift: { ...form.gift },
    layout: props.modelValue.layout,
    notice: props.modelValue.notice,
    openedMsgTypes: { ...form.openedMsgTypes },
  })
}

function commitHighlight() {
  const draft = highlightDraft.value
  if (draft.error) return
  const serialized = joinKeywords(draft.keywords)
  if (serialized === appliedHighlight) return
  form.danmaku.highlightKeywords = draft.keywords
  appliedHighlight = serialized
  syncOut()
}

function commitBlock() {
  const draft = blockDraft.value
  if (draft.error) return
  const serialized = joinKeywords(draft.keywords)
  if (serialized === appliedBlock) return
  form.danmaku.blockKeywords = draft.keywords
  appliedBlock = serialized
  syncOut()
}

function onSave() {
  commitHighlight()
  commitBlock()
  if (keywordInvalid.value) return
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
      <label class="stack">
        <span class="stack-label">
          高亮关键词
          <em :class="{ over: highlightDraft.error }">{{ highlightDraft.count }}/{{ KEYWORD_MAX }}</em>
        </span>
        <textarea
          v-model="highlightInput"
          rows="4"
          :disabled="danmakuLocked"
          placeholder="每行一个，也可用逗号分隔，最多 20 个"
          @input="commitHighlight"
        />
        <p v-if="highlightDraft.error" class="field-error" role="alert">{{ highlightDraft.error }}</p>
        <p v-else class="field-hint">不区分大小写，弹幕包含即由服务端标记高亮。示例里有「高能」。</p>
      </label>
      <label class="stack">
        <span class="stack-label">
          屏蔽关键词
          <em :class="{ over: blockDraft.error }">{{ blockDraft.count }}/{{ KEYWORD_MAX }}</em>
        </span>
        <textarea
          v-model="blockInput"
          rows="4"
          :disabled="danmakuLocked"
          placeholder="每行一个，也可用逗号分隔，最多 20 个"
          @input="commitBlock"
        />
        <p v-if="blockDraft.error" class="field-error" role="alert">{{ blockDraft.error }}</p>
        <p v-else class="field-hint">命中后由服务端丢弃，不会推到运行态。预览会按同样规则隐藏示例。示例里有「广告」。</p>
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

    <button class="save-btn" type="submit" :disabled="saving || keywordInvalid">
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
.stack {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 0 4px;
  border-top: 1px solid #262733;
}
.stack-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: #c8cad4;
}
.stack-label em {
  font-style: normal;
  font-size: 11px;
  color: #8b8e9c;
}
.stack-label em.over {
  color: #ff8a80;
}
.stack textarea {
  width: 100%;
  resize: vertical;
  min-height: 72px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid #353645;
  background: #12131a;
  color: #eee;
  font-size: 13px;
  line-height: 1.45;
}
.stack textarea:disabled {
  opacity: 0.6;
}
.field-hint {
  margin: 0;
  font-size: 12px;
  color: #8b8e9c;
  line-height: 1.45;
}
.field-error {
  margin: 0;
  font-size: 12px;
  color: #ff8a80;
  line-height: 1.45;
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
