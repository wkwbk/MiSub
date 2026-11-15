<script setup>
    import { computed, ref, watch } from 'vue';
    import { FilePlus2, Layers } from 'lucide-vue-next';
    import Modal from '../forms/Modal.vue';
    import GroupSelector from '../ui/GroupSelector.vue';
    import { useDataStore } from '../../stores/useDataStore.js';
    import { extractAirportGroupNames } from '../../composables/useSubscriptionBulkImport.js';
    import { useI18n } from '@/i18n/index.js';

    const { t } = useI18n();
    const dataStore = useDataStore();

    const props = defineProps({
        show: Boolean,
    });

    const emit = defineEmits(['update:show', 'import']);

    const importText = ref('');
    const selectedGroup = ref('');
    const urlFocused = ref(false);

    const airportGroupNames = computed(() =>
        extractAirportGroupNames(dataStore.subscriptions || [])
    );

    watch(
        () => props.show,
        (visible) => {
            if (!visible) {
                importText.value = '';
                selectedGroup.value = '';
            }
        }
    );

    const handleConfirm = () => {
        if (!importText.value.trim()) return;
        emit('import', importText.value, selectedGroup.value.trim());
        importText.value = '';
        selectedGroup.value = '';
        emit('update:show', false);
    };
</script>

<template>
    <Modal
        :show="show"
        @update:show="emit('update:show', $event)"
        @confirm="handleConfirm"
        size="2xl"
    >
        <template #title>
            <div class="flex items-center gap-3">
                <Layers class="h-5 w-5 text-zinc-400 shrink-0" />
                <div>
                    <h3 class="text-base font-semibold text-zinc-100">
                        {{ t('subscriptionBulkImport.title') }}
                    </h3>
                    <p class="mt-0.5 text-xs text-zinc-400">
                        {{ t('subscriptionBulkImport.description') }}
                    </p>
                </div>
            </div>
        </template>

        <template #footer>
            <button
                @click="emit('update:show', false)"
                class="px-4 py-2 border border-zinc-800 bg-transparent hover:bg-zinc-900 text-zinc-300 hover:text-zinc-100 font-medium text-xs rounded-md transition-colors"
            >
                {{ t('actions.cancel') }}
            </button>
            <button
                @click="handleConfirm"
                :disabled="!importText.trim()"
                class="px-4 py-2 bg-zinc-100 hover:bg-white disabled:opacity-50 disabled:pointer-events-none text-zinc-900 font-semibold text-xs rounded-md transition-colors"
            >
                {{ t('actions.confirm') }}
            </button>
        </template>

        <template #body>
            <div class="space-y-5">
                <!-- Airport Group Selector -->
                <div class="relative">
                    <div class="flex flex-col gap-1.5">
                        <label
                            for="subscription-import-group"
                            class="text-xs font-semibold text-zinc-400 mb-1"
                        >
                            {{ t('subscriptionBulkImport.groupLabel') }}
                        </label>
                        <GroupSelector
                            v-model="selectedGroup"
                            :groups="airportGroupNames"
                            :placeholder="t('subscriptionBulkImport.groupPlaceholder')"
                        />
                    </div>
                </div>

                <!-- Subscription URLs Textarea -->
                <div class="relative group space-y-1.5">
                    <div
                        class="relative border rounded-md transition-colors overflow-hidden bg-[#131515]"
                        :class="[
                            urlFocused
                                ? 'border-zinc-600'
                                : 'border-zinc-800 hover:border-zinc-700',
                        ]"
                    >
                        <div class="flex h-full">
                            <div
                                class="py-3 pl-3 flex items-start text-zinc-500 group-focus-within:text-zinc-300 transition-colors pointer-events-none"
                            >
                                <FilePlus2 class="h-4 w-4 mt-0.5" />
                            </div>
                            <textarea
                                v-model="importText"
                                rows="8"
                                @focus="urlFocused = true"
                                @blur="urlFocused = false"
                                class="flex-1 w-full bg-transparent border-0 focus-visible:ring-0 text-zinc-100 placeholder-zinc-600 text-xs font-mono resize-none py-3 px-3 min-h-[160px] outline-none"
                                placeholder="https://example.com/api/v1/client/subscribe?token=...&#10;http://sub.example.com/link/..."
                            ></textarea>
                        </div>
                    </div>
                    <p class="text-xs text-zinc-500">
                        {{ t('subscriptionBulkImport.helper') }}
                    </p>
                </div>
            </div>
        </template>
    </Modal>
</template>

