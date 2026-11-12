<script setup>
    import { ref, computed, watch } from 'vue';
    import Modal from '../forms/Modal.vue';
    import draggable from 'vuedraggable';
    import { useI18n } from '../../i18n/index.js';
    import { confirmAction } from '../../composables/useConfirm.js';

    const { t } = useI18n();

    const props = defineProps({
        show: Boolean,
        groups: {
            type: Array,
            default: () => [],
        },
    });

    const emit = defineEmits(['close', 'rename', 'delete', 'reorder', 'update:show']);

    // 本地可编辑的分组列表
    const localGroups = ref([]);
    const editingGroupIndex = ref(null);
    const editingGroupName = ref('');

    // 监听 props.groups 变化，同步到本地
    const syncGroups = () => {
        localGroups.value = props.groups.map((g) => ({ name: g, editing: false }));
    };

    // 监听 show 变化，模态框打开时同步分组
    watch(
        () => props.show,
        (newVal) => {
            if (newVal) {
                syncGroups();
            }
        }
    );

    const handleClose = () => {
        editingGroupIndex.value = null;
        editingGroupName.value = '';
        emit('update:show', false);
        emit('close');
    };

    const startEdit = (index) => {
        editingGroupIndex.value = index;
        editingGroupName.value = localGroups.value[index].name;
    };

    const cancelEdit = () => {
        editingGroupIndex.value = null;
        editingGroupName.value = '';
    };

    const confirmEdit = () => {
        const newName = editingGroupName.value.trim();
        if (!newName) {
            cancelEdit();
            return;
        }

        const oldName = localGroups.value[editingGroupIndex.value].name;
        if (newName !== oldName) {
            emit('rename', oldName, newName);
            localGroups.value[editingGroupIndex.value].name = newName;
        }

        cancelEdit();
    };

    const handleDelete = async (groupName) => {
        const confirmed = await confirmAction({
            message: t('subscriptions.deleteGroupConfirm', { name: groupName }),
            variant: 'danger',
        });
        if (!confirmed) return;

        emit('delete', groupName);
        localGroups.value = localGroups.value.filter((g) => g.name !== groupName);
    };

    const handleDragEnd = () => {
        const newOrder = localGroups.value.map((g) => g.name);
        emit('reorder', newOrder);
    };

    const isDraggable = computed(() => localGroups.value.length > 1);
</script>

<template>
    <Modal :show="show" @close="handleClose" max-width="max-w-2xl">
        <template #title>
            <div class="flex items-center gap-2">
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-4 w-4 text-zinc-500"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                >
                    <path
                        d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"
                    />
                </svg>
                <span class="text-base font-semibold text-zinc-900 dark:text-zinc-100">{{ t('actions.manageGroups') }}</span>
            </div>
        </template>

        <template #body>
            <div class="space-y-3">
                <div
                    v-if="localGroups.length === 0"
                    class="text-center py-8 text-zinc-500"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-8 w-8 mx-auto mb-2 text-zinc-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="1.5"
                            d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                        />
                    </svg>
                    <p class="text-sm">{{ t('subscriptions.noGroups') }}</p>
                </div>

                <draggable
                    v-else
                    v-model="localGroups"
                    item-key="name"
                    @end="handleDragEnd"
                    :disabled="!isDraggable"
                    handle=".drag-handle"
                    animation="200"
                    class="space-y-2"
                >
                    <template #item="{ element, index }">
                        <div
                            class="flex items-center gap-3 p-3 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#09090b] transition-colors"
                            :class="
                                editingGroupIndex === index
                                    ? 'border-zinc-500 dark:border-zinc-500'
                                    : 'hover:border-zinc-300 dark:hover:border-zinc-700'
                            "
                        >
                            <!-- 拖拽手柄 -->
                            <button
                                v-if="isDraggable"
                                class="drag-handle cursor-move text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                                :title="t('common.dragToSort')"
                                :aria-label="t('common.dragToSort')"
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    class="h-4 w-4"
                                    viewBox="0 0 20 20"
                                    fill="currentColor"
                                >
                                    <path
                                        d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z"
                                    />
                                </svg>
                            </button>

                            <!-- 分组名称或编辑输入框 -->
                            <div class="flex-1">
                                <input
                                    v-if="editingGroupIndex === index"
                                    v-model="editingGroupName"
                                    type="text"
                                    class="w-full px-3 py-1.5 text-sm border border-zinc-400 dark:border-zinc-600 rounded-md focus-visible:outline-none bg-white dark:bg-[#0c0c0e] text-zinc-900 dark:text-zinc-100"
                                    @keyup.enter="confirmEdit"
                                    @keyup.esc="cancelEdit"
                                    ref="editInput"
                                    autofocus
                                    :aria-label="t('subscriptions.renameGroup')"
                                />
                                <div v-else class="flex items-center gap-2">
                                    <span
                                        class="text-sm font-medium text-zinc-900 dark:text-zinc-100"
                                        >{{ element.name }}</span
                                    >
                                </div>
                            </div>

                            <!-- 操作按钮 -->
                            <div class="flex items-center gap-1">
                                <template v-if="editingGroupIndex === index">
                                    <button
                                        @click="confirmEdit"
                                        class="p-1.5 text-emerald-500 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-md transition-colors touch-target"
                                        :title="t('actions.confirm')"
                                        :aria-label="t('actions.confirm')"
                                    >
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            class="h-4 w-4"
                                            viewBox="0 0 20 20"
                                            fill="currentColor"
                                        >
                                            <path
                                                fill-rule="evenodd"
                                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                                clip-rule="evenodd"
                                            />
                                        </svg>
                                    </button>
                                    <button
                                        @click="cancelEdit"
                                        class="p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-md transition-colors touch-target"
                                        :title="t('actions.cancel')"
                                        :aria-label="t('actions.cancel')"
                                    >
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            class="h-4 w-4"
                                            viewBox="0 0 20 20"
                                            fill="currentColor"
                                        >
                                            <path
                                                fill-rule="evenodd"
                                                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                                                clip-rule="evenodd"
                                            />
                                        </svg>
                                    </button>
                                </template>
                                <template v-else>
                                    <button
                                        @click="startEdit(index)"
                                        class="p-1.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-md transition-colors touch-target"
                                        :title="t('subscriptions.renameGroup')"
                                        :aria-label="t('subscriptions.renameGroup')"
                                    >
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            class="h-4 w-4"
                                            viewBox="0 0 20 20"
                                            fill="currentColor"
                                        >
                                            <path
                                                d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"
                                            />
                                        </svg>
                                    </button>
                                    <button
                                        @click="handleDelete(element.name)"
                                        class="p-1.5 text-zinc-500 hover:text-red-500 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-md transition-colors touch-target"
                                        :title="t('actions.delete')"
                                        :aria-label="t('actions.delete')"
                                    >
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            class="h-4 w-4"
                                            viewBox="0 0 20 20"
                                            fill="currentColor"
                                        >
                                            <path
                                                fill-rule="evenodd"
                                                d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                                                clip-rule="evenodd"
                                            />
                                        </svg>
                                    </button>
                                </template>
                            </div>
                        </div>
                    </template>
                </draggable>

                <div v-if="isDraggable" class="mt-3 p-3 bg-transparent border border-zinc-200 dark:border-zinc-800 rounded-md">
                    <p class="text-xs text-zinc-500 flex items-center gap-2">
                        <span class="h-1.5 w-1.5 rounded-full bg-zinc-400 shrink-0"></span>
                        <span>{{ t('subscriptions.dragToReorder') }}</span>
                    </p>
                </div>
            </div>
        </template>

        <template #footer>
            <button
                @click="handleClose"
                class="w-full rounded-md border border-zinc-300 dark:border-zinc-800 bg-transparent px-4 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-900"
            >
                {{ t('common.close') }}
            </button>
        </template>
    </Modal>
</template>
