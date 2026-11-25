<script setup lang="ts">
import Select from '@/components/ui/Select.vue';
import Switch from '@/components/ui/Switch.vue';
import Textarea from '@/components/ui/Textarea.vue';
import { useI18n } from '@/i18n/index.js';
import type { StoreMisubItem } from '@/queries/useAppDataQueries.js';
import type { EditableSubscriptionForm } from '@/composables/useSubscriptionForms.js';

const { t } = useI18n();

defineProps<{
  editingSubscription: EditableSubscriptionForm | StoreMisubItem;
}>();
</script>

<template>
  <div>
    <label class="block text-xs font-medium text-fg-muted" for="sub-edit-ua">
      {{ t('subscriptions.uaLabel') }}
      <span class="text-xs text-fg-subtle ml-2">{{ t('subscriptions.optionalDefault') }}</span>
    </label>
    <div class="mt-1">
      <Select
        id="sub-edit-ua"
        v-model="editingSubscription.customUserAgent"
        :options="[
          { value: '', label: t('subscriptions.defaultUa') },
          { value: 'MiSub', label: 'MiSub' },
          { value: 'clash-verge/v2.4.3', label: 'Clash Verge' },
          { value: 'clash.meta', label: 'Clash Meta' },
          { value: 'v2rayN/7.23', label: 'v2rayN' },
          { value: 'Shadowrocket/1.9.0', label: 'Shadowrocket' },
          { value: 'Mozilla/5.0', label: 'Mozilla' },
        ]"
        trigger-class="font-mono"
      />
    </div>
    <p v-if="editingSubscription.customUserAgent" class="text-xs font-mono text-fg-subtle mt-1">
      {{ t('subscriptions.currentUa', { ua: editingSubscription.customUserAgent }) }}
    </p>
  </div>

  <!-- 官网 -->
  <div>
    <label class="block text-xs font-medium text-fg-muted" for="sub-edit-website">
      {{ t('subscriptions.websiteLabel') }}
      <span class="text-xs text-fg-subtle ml-2">{{ t('subscriptions.websiteOptional') }}</span>
    </label>
    <input
      id="sub-edit-website"
      v-model="editingSubscription.website"
      class="mt-1 block w-full px-3 py-2 bg-inset border border-line rounded-md text-fg font-mono text-sm focus:outline-hidden focus:border-line-strong"
      inputmode="url"
      placeholder="https://example.com"
      type="url"
    />
    <p class="mt-1 text-xs text-fg-subtle">
      {{ t('subscriptions.websiteHint') }}
    </p>
  </div>

  <!-- 备注 -->
  <div>
    <label class="block text-xs font-medium text-fg-muted">{{ t('subscriptions.notesLabel') }}</label>
    <Textarea
      v-model="editingSubscription.notes"
      :placeholder="t('subscriptions.notesPlaceholder')"
      class="px-3 py-2 text-sm text-fg"
      rows="2"
      wrapperClass="mt-1 bg-inset border-line focus-within:ring-0"
    />
  </div>

  <!-- 开关选项 -->
  <div class="space-y-3 pt-3 border-t border-line">
    <div class="flex items-center justify-between gap-4">
      <div>
        <span class="text-sm font-medium text-fg">{{ t('subscriptions.autoUpdateTitle') }}</span>
        <p class="text-xs text-fg-subtle mt-0.5">
          {{ t('subscriptions.autoUpdateDesc') }}
        </p>
      </div>
      <Switch
        :model-value="editingSubscription.autoUpdate !== false"
        data-testid="subscription-auto-update-switch"
        @update:model-value="editingSubscription.autoUpdate = $event"
      />
    </div>

    <div class="flex items-center justify-between gap-4">
      <div>
        <span class="text-sm font-medium text-fg">{{ t('subscriptions.nodeCacheTitle') }}</span>
        <p class="text-xs text-fg-subtle mt-0.5">
          {{ t('subscriptions.nodeCacheDesc') }}
        </p>
      </div>
      <Switch v-model="editingSubscription.enableNodeCache" />
    </div>

    <div class="flex items-center justify-between gap-4">
      <div>
        <span class="text-sm font-medium text-fg">{{ t('subscriptions.plusAsSpaceTitle') }}</span>
        <p class="text-xs text-fg-subtle mt-0.5">
          {{ t('subscriptions.plusAsSpaceDesc') }}
        </p>
      </div>
      <Switch v-model="editingSubscription.plusAsSpace" />
    </div>

    <div class="flex items-center justify-between gap-4">
      <div>
        <span class="text-sm font-medium text-fg">{{ t('subscriptions.excludeTrafficTitle') }}</span>
        <p class="text-xs text-fg-subtle mt-0.5">
          {{ t('subscriptions.excludeTrafficDesc') }}
        </p>
      </div>
      <Switch v-model="editingSubscription.excludeTraffic" />
    </div>
  </div>
</template>
