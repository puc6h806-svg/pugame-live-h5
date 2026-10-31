<script setup lang="ts">
import { computed } from 'vue'
import type { GiftEvent } from '../lib/types'

const props = defineProps<{
  gift: GiftEvent
  hits?: number
  bump?: number
}>()

const hits = computed(() => props.hits ?? 1)
</script>

<template>
  <div class="gift-card" :data-num="gift.num" :data-hits="hits">
    <div class="gift-icon" aria-hidden="true">
      <img
        v-if="gift.giftIcon"
        :src="gift.giftIcon"
        alt=""
        @error="($event.target as HTMLImageElement).style.display = 'none'"
      />
      <span v-else class="gift-fallback">🎁</span>
    </div>
    <div class="gift-meta">
      <div class="gift-line">
        <strong>{{ gift.uname }}</strong>
        投喂
        <em>{{ gift.giftName }}</em>
        <span v-if="hits > 1 || gift.num > 1" class="combo" :key="bump">
          <span v-if="hits > 1" class="combo-tag">连击</span>
          <span v-if="gift.num > 1" class="x">×{{ gift.num }}</span>
        </span>
      </div>
      <div v-if="gift.price > 0" class="gift-price">
        ¥{{ (gift.price / 1000).toFixed(1) }}
      </div>
    </div>
  </div>
</template>

<style scoped>
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
  .combo {
    animation: none;
  }
}
</style>
