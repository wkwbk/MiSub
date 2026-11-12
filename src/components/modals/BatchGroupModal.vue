<script setup>
    import { ref, watch } from 'vue';
    import Modal from '../forms/Modal.vue';
    import GroupSelector from '../ui/GroupSelector.vue'; // New import
    import { useI18n } from '../../i18n/index.js';

    const props = defineProps({
        show: Boolean,
        groups: {
            type: Array,
            default: () => [],
        },
    });

    const emit = defineEmits(['update:show', 'confirm']);
    const { t } = useI18n();

    const groupName = ref('');

    // Reset input when modal opens
    watch(
        () => props.show,
        (newVal) => {
            if (newVal) {
                groupName.value = '';
            }
        }
    );

    const handleConfirm = () => {
        emit('confirm', groupName.value);
        emit('update:show', false);
    };
</script>

<template>
    <Modal
        :show="show"
        size="lg"
        @update:show="emit('update:show', $event)"
        @confirm="handleConfirm"
    >
        <template #title>
            <div class="flex items-center gap-2">
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-4 w-4 text-zinc-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    stroke-width="2"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                    />
                </svg>
                <h3 class="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                    {{ t('manualNodes.batchMoveGroupTitle') }}
                </h3>
            </div>
        </template>

        <template #body>
            <div class="space-y-4 py-2">
                <p class="text-xs text-zinc-500">
                    {{ t('manualNodes.batchMoveGroupDesc') }}
                </p>

                <div class="relative">
                    <div class="flex flex-col">
                        <label
                            class="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5"
                        >
                            {{ t('manualNodes.groupName') }}
                        </label>
                        <GroupSelector
                            v-model="groupName"
                            :groups="groups"
                            :placeholder="t('manualNodes.groupPlaceholder')"
                        />
                    </div>
                </div>
            </div>
        </template>
    </Modal>
</template>
