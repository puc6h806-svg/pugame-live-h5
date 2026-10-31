<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'

const props = defineProps<{
  message: string | null
  durationMs?: number
}>()

const emit = defineEmits<{ clear: [] }>()
const visible = ref(false)
let timer: number | undefined

function show(msg: string) {
  visible.value = true
  if (timer) clearTimeout(timer)
  timer = window.setTimeout(() => {
    visible.value = false
    emit('clear')
  }, props.durationMs ?? 3200)
  void msg
}

watch(
  () => props.message,
  (m) => {
    if (m) show(m)
  },
)

onMounted(() => {
  if (props.message) show(props.message)
})
</script>

<template>
  <Transition name="toast">
    <div v-if="visible && message" class="error-toast" role="alert">
      {{ message }}
    </div>
  </Transition>
</template>

<style scoped>
.error-toast {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  z-index: 10000;
  max-width: min(90vw, 420px);
  padding: 10px 16px;
  border-radius: 8px;
  background: rgba(20, 20, 28, 0.92);
  color: #fff;
  font-size: 13px;
  line-height: 1.4;
  text-align: center;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.35);
  pointer-events: none;
}
.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}
</style>
