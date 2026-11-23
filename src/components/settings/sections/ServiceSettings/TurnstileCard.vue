<script setup>
import { computed, ref } from 'vue';
import { Eye, EyeOff, ShieldCheck } from '@lucide/vue';
import SectionHeader from '@/components/settings/SectionHeader.vue';
import Switch from '@/components/ui/Switch.vue';
import { useI18n } from '@/i18n/index.js';

const { t } = useI18n();

const props = defineProps({
  settings: {
    type: Object,
    required: true,
  },
});

const showSecretKey = ref(false);

const turnstileConfig = computed({
  get() {
    if (!props.settings.turnstile || typeof props.settings.turnstile !== 'object') {
      return {
        enabled: false,
        siteKey: '',
        secretKey: '',
        enableForGuestbook: true,
        enableForLogin: false,
        hasSecretKey: false,
        hasEnvKeys: false,
        loginDisabledByEnv: false,
      };
    }
    return props.settings.turnstile;
  },
  set(value) {
    props.settings.turnstile = value;
  },
});

function updateField(key, value) {
  turnstileConfig.value = {
    ...turnstileConfig.value,
    [key]: value,
  };
}
</script>

<template>
  <section class="rounded-lg border border-line bg-surface p-6">
    <SectionHeader :description="t('settings.turnstileDesc')" :title="t('settings.turnstileTitle')" tone="blue">
      <template #icon>
        <ShieldCheck class="h-4 w-4" />
      </template>
      <template #actions>
        <Switch
          :aria-label="t('settings.turnstileEnable')"
          :model-value="Boolean(turnstileConfig.enabled)"
          @update:model-value="updateField('enabled', $event)"
        />
      </template>
    </SectionHeader>

    <div class="space-y-4">
      <p v-if="turnstileConfig.hasEnvKeys" class="text-xs text-fg-muted leading-relaxed">
        {{ t('settings.turnstileEnvKeysDetected') }}
      </p>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label class="block text-xs font-medium text-fg-muted mb-1.5">
            {{ t('settings.turnstileSiteKey') }}
          </label>
          <input
            :placeholder="
              turnstileConfig.hasEnvKeys
                ? t('settings.turnstileEnvFallbackPlaceholder')
                : t('settings.turnstileSiteKeyPlaceholder')
            "
            :value="turnstileConfig.siteKey"
            autocomplete="off"
            class="block w-full px-3 py-2 bg-inset border border-line rounded-md shadow-none focus-visible:ring-1 focus-visible:ring-line-strong focus:border-line-strong text-sm font-mono text-fg transition-colors"
            type="text"
            @input="updateField('siteKey', $event.target.value)"
          />
          <p class="mt-1.5 text-xs text-fg-muted leading-relaxed">
            {{ t('settings.turnstileSiteKeyHint') }}
          </p>
        </div>

        <div>
          <label class="block text-xs font-medium text-fg-muted mb-1.5">
            {{ t('settings.turnstileSecretKey') }}
          </label>
          <div class="relative">
            <input
              :placeholder="
                turnstileConfig.hasSecretKey
                  ? t('settings.turnstileSecretSavedPlaceholder')
                  : turnstileConfig.hasEnvKeys
                    ? t('settings.turnstileEnvFallbackPlaceholder')
                    : t('settings.turnstileSecretPlaceholder')
              "
              :type="showSecretKey ? 'text' : 'password'"
              :value="turnstileConfig.secretKey"
              autocomplete="off"
              class="block w-full pl-3 pr-10 py-2 bg-inset border border-line rounded-md shadow-none focus-visible:ring-1 focus-visible:ring-line-strong focus:border-line-strong text-sm font-mono text-fg transition-colors"
              @input="updateField('secretKey', $event.target.value)"
            />
            <button
              :aria-label="showSecretKey ? t('actions.hide') : t('actions.show')"
              class="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-fg-muted hover:text-fg transition-colors"
              type="button"
              @click="showSecretKey = !showSecretKey"
            >
              <EyeOff v-if="showSecretKey" class="h-4 w-4" />
              <Eye v-else class="h-4 w-4" />
            </button>
          </div>
          <p class="mt-1.5 text-xs text-fg-muted leading-relaxed">
            {{ t('settings.turnstileSecretKeyHint') }}
          </p>
        </div>
      </div>

      <div class="divide-y divide-line-subtle border-t border-line-subtle pt-2">
        <div class="py-3 flex items-center justify-between gap-4">
          <div class="space-y-0.5">
            <p class="text-sm font-medium text-fg">{{ t('settings.turnstileGuestbookTitle') }}</p>
            <p class="text-xs text-fg-muted leading-relaxed">{{ t('settings.turnstileGuestbookDesc') }}</p>
          </div>
          <Switch
            :aria-label="t('settings.turnstileGuestbookTitle')"
            :model-value="turnstileConfig.enableForGuestbook !== false"
            class="shrink-0"
            @update:model-value="updateField('enableForGuestbook', $event)"
          />
        </div>

        <div class="py-3 space-y-2.5">
          <div class="flex items-center justify-between gap-4">
            <div class="space-y-0.5">
              <p class="text-sm font-medium text-fg">{{ t('settings.turnstileLoginTitle') }}</p>
              <p class="text-xs text-fg-muted leading-relaxed">{{ t('settings.turnstileLoginDesc') }}</p>
            </div>
            <Switch
              :aria-label="t('settings.turnstileLoginTitle')"
              :model-value="Boolean(turnstileConfig.enableForLogin)"
              class="shrink-0"
              @update:model-value="updateField('enableForLogin', $event)"
            />
          </div>
          <p v-if="turnstileConfig.enableForLogin" class="callout-warning">
            {{ t('settings.turnstileLoginWarning') }}
          </p>
          <p v-if="turnstileConfig.loginDisabledByEnv" class="callout-warning">
            {{ t('settings.turnstileLoginDisabledByEnvHint') }}
          </p>
        </div>
      </div>
    </div>
  </section>
</template>
