<script setup>
import { computed } from 'vue';
import { Check, Copy, Eye, FileText, Pencil, QrCode, Trash2 } from '@lucide/vue';
import { getItemTags } from '@/utils/tags.js';
import { useI18n } from '@/i18n/index.js';
import Switch from '@/components/ui/Switch.vue';

const { t } = useI18n();

const props = defineProps({
  profile: {
    type: Object,
    required: true,
  },
  isSorting: {
    type: Boolean,
    default: false,
  },
  isSelectionMode: {
    type: Boolean,
    default: false,
  },
  isSelected: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits([
  'delete',
  'change',
  'edit',
  'open-copy',
  'preview',
  'view-logs',
  'qrcode',
  'filter-tag',
  'toggle-select',
]);

const profileTags = computed(() => getItemTags(props.profile));
const visibleTags = computed(() => profileTags.value.slice(0, 2));
const overflowCount = computed(() => Math.max(0, profileTags.value.length - 2));

const subscriptionCount = computed(() =>
  Array.isArray(props.profile?.subscriptions) ? props.profile.subscriptions.length : 0,
);
const subProfileCount = computed(() =>
  Array.isArray(props.profile?.subProfiles) ? props.profile.subProfiles.length : 0,
);
const manualNodeCount = computed(() =>
  Array.isArray(props.profile?.manualNodes) ? props.profile.manualNodes.length : 0,
);
const isEnabled = computed(() => props.profile?.enabled !== false);
const isPublic = computed(() => props.profile?.isPublic === true);
</script>

<template>
  <div
    :class="[
      isSelectionMode && isSelected ? 'border-line-strong bg-active' : 'border-line bg-surface',
      {
        'opacity-60': !isEnabled && !isSelectionMode,
        'cursor-pointer': isSelectionMode,
      },
    ]"
    class="group flex h-full flex-col rounded-md border p-3.5 hover:-translate-y-0.5 hover:z-10 transition-all duration-200"
    @click="isSelectionMode ? emit('toggle-select') : null"
  >
    <div class="flex items-center justify-between gap-2">
      <div class="flex min-w-0 items-center gap-1.5 overflow-hidden">
        <div v-if="isSelectionMode" class="shrink-0 mr-0.5">
          <div
            :class="isSelected ? 'bg-accent border-accent text-accent-fg' : 'border-line-strong bg-transparent'"
            class="w-4 h-4 rounded-sm border flex items-center justify-center transition-colors"
          >
            <Check v-if="isSelected" class="h-3 w-3" stroke-width="3" />
          </div>
        </div>

        <span
          class="inline-flex h-5 shrink-0 items-center rounded-md border border-line bg-transparent px-2 text-[10px] font-mono leading-none text-fg-muted"
        >
          {{ t('profiles.badge') }}
        </span>

        <div
          v-if="profileTags.length > 0"
          class="flex min-w-0 items-center gap-1.5 overflow-hidden"
          data-testid="profile-card-tags"
        >
          <button
            v-for="tag in visibleTags"
            :key="tag"
            :title="tag"
            class="inline-flex h-5 max-w-[96px] sm:max-w-[110px] shrink-0 items-center rounded-md border border-line bg-transparent px-2 text-[10px] font-medium leading-none text-fg-muted transition-colors hover:bg-hover hover:text-fg cursor-pointer"
            data-testid="profile-tag-badge"
            type="button"
            @click.stop="emit('filter-tag', tag)"
          >
            <span class="truncate">{{ tag }}</span>
          </button>
          <span
            v-if="overflowCount > 0"
            :title="profileTags.join(', ')"
            class="inline-flex h-5 shrink-0 items-center rounded-md border border-line bg-transparent px-2 text-[10px] font-mono leading-none text-fg-subtle"
          >
            +{{ overflowCount }}
          </span>
        </div>

        <span
          v-if="!isEnabled"
          class="inline-flex h-5 items-center gap-1.5 shrink-0 rounded-md border border-line bg-transparent px-2 text-[10px] font-mono leading-none text-fg-muted"
        >
          <span class="h-1.5 w-1.5 rounded-full bg-zinc-500 shrink-0"></span>
          {{ t('profiles.disabled') }}
        </span>
        <span
          v-else-if="isPublic"
          class="inline-flex h-5 items-center gap-1.5 shrink-0 rounded-md border border-line bg-transparent px-2 text-[10px] font-mono leading-none text-fg-muted"
        >
          <span class="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0"></span>
          {{ t('profiles.public') }}
        </span>
      </div>

      <div
        v-if="!isSelectionMode"
        class="shrink-0 flex items-center gap-0.5 opacity-100 md:opacity-65 md:group-hover:opacity-100 md:focus-within:opacity-100 transition-opacity duration-200"
      >
        <button
          :aria-label="t('actions.previewNodes')"
          :title="t('actions.previewNodes')"
          class="flex h-8 w-8 md:h-7 md:w-7 items-center justify-center rounded-md border border-transparent hover:border-line-strong hover:bg-hover text-fg-muted hover:text-fg transition-colors"
          @click.stop="emit('preview')"
        >
          <Eye class="w-4 h-4" />
        </button>
        <button
          :aria-label="t('actions.showQrCode')"
          :title="t('actions.showQrCode')"
          class="flex h-8 w-8 md:h-7 md:w-7 items-center justify-center rounded-md border border-transparent hover:border-line-strong hover:bg-hover text-fg-muted hover:text-fg transition-colors"
          @click.stop="emit('qrcode')"
        >
          <QrCode class="w-4 h-4" stroke-width="1.5" />
        </button>
        <button
          :aria-label="t('actions.edit')"
          :title="t('actions.edit')"
          class="flex h-8 w-8 md:h-7 md:w-7 items-center justify-center rounded-md border border-transparent hover:border-line-strong hover:bg-hover text-fg-muted hover:text-fg transition-colors"
          @click.stop="emit('edit')"
        >
          <Pencil class="w-4 h-4" />
        </button>
        <button
          :aria-label="t('actions.delete')"
          :title="t('actions.delete')"
          class="flex h-8 w-8 md:h-7 md:w-7 items-center justify-center rounded-md border border-transparent hover:border-red-900/60 hover:bg-red-950/40 text-fg-muted hover:text-red-400 transition-colors"
          @click.stop="emit('delete')"
        >
          <Trash2 class="w-4 h-4" />
        </button>
      </div>
    </div>

    <p :title="profile.name" class="mt-2 truncate text-base font-semibold leading-snug text-fg">
      {{ profile.name }}
    </p>

    <p class="mt-1.5 text-xs font-mono text-fg-muted flex flex-wrap items-center gap-x-2 gap-y-1">
      <span>
        {{
          t('profiles.counts', {
            subscriptions: subscriptionCount,
            nodes: manualNodeCount,
          })
        }}
      </span>
      <span aria-hidden="true" class="text-fg-subtle">·</span>
      <span>
        {{ t('profiles.downloadCount', { count: profile.downloadCount || 0 }) }}
      </span>
      <span
        v-if="subProfileCount > 0"
        class="inline-flex items-center px-1.5 py-0.5 rounded-md border border-line bg-transparent text-[11px] font-mono text-fg-muted"
      >
        {{ t('profileModal.subProfilesCountBadge', { count: subProfileCount }) }}
      </span>
    </p>

    <div
      :class="{ 'pointer-events-none': isSelectionMode }"
      class="mt-2.5 mb-3 grid gap-2 rounded-md border border-line bg-transparent px-3 py-2.5 text-xs"
    >
      <div class="flex items-center justify-between gap-3 text-fg-muted">
        <span class="shrink-0">{{ t('profiles.enabledStatus') }}</span>
        <Switch
          :label="t('profiles.enable')"
          :model-value="isEnabled"
          @update:model-value="(val) => $emit('change', { ...profile, enabled: val })"
        />
      </div>
      <div class="flex items-center justify-between gap-3 text-fg-muted">
        <span class="shrink-0">{{ t('profiles.publicAccess') }}</span>
        <Switch
          :label="t('profiles.publicSwitch')"
          :model-value="isPublic"
          @update:model-value="(val) => $emit('change', { ...profile, isPublic: val })"
        />
      </div>
    </div>

    <div
      :class="{ 'pointer-events-none': isSelectionMode }"
      class="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line pt-2.5"
    >
      <div class="flex items-center gap-2 sm:gap-4">
        <button
          class="inline-flex items-center gap-1.5 rounded-md border border-line-strong bg-elevated-card px-3.5 py-1.5 text-xs font-medium text-fg transition-colors hover:bg-hover"
          @click="emit('open-copy')"
        >
          <Copy class="h-3.5 w-3.5" />
          {{ t('profiles.copySubscription') }}
        </button>
      </div>
      <div class="flex items-center gap-1.5 transition-opacity duration-200">
        <button
          :title="t('actions.viewLogs')"
          class="inline-flex items-center gap-1 rounded-md border border-line bg-transparent px-2.5 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:border-line-strong hover:bg-hover hover:text-fg"
          @click.stop="emit('view-logs')"
        >
          <FileText class="h-3.5 w-3.5" />
          {{ t('actions.viewLog') }}
        </button>
      </div>
    </div>
  </div>
</template>
