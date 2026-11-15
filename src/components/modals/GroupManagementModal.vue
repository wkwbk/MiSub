<script setup>
    import { ref, computed, watch } from 'vue';
    import { Check, Folder, GripVertical, Pencil, Trash2, X } from 'lucide-vue-next';
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
                <Folder class="h-4 w-4 text-zinc-500" />
                <span class="text-base font-semibold text-zinc-900 dark:text-zinc-100">{{
                    t('actions.manageGroups')
                }}</span>
            </div>
        </template>

        <template #body>
            <div class="space-y-3">
                <div v-if="localGroups.length === 0" class="text-center py-8 text-zinc-500">
                    <Folder class="h-8 w-8 mx-auto mb-2 text-zinc-500" />
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
                            class="flex items-center gap-3 p-3 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#131515] transition-colors"
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
                                <GripVertical class="h-4 w-4" />
                            </button>

                            <!-- 分组名称或编辑输入框 -->
                            <div class="flex-1">
                                <input
                                    v-if="editingGroupIndex === index"
                                    v-model="editingGroupName"
                                    type="text"
                                    class="w-full px-3 py-1.5 text-sm border border-zinc-400 dark:border-zinc-600 rounded-md focus-visible:outline-none bg-white dark:bg-[#171717] text-zinc-900 dark:text-zinc-100"
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
                                        <Check class="h-4 w-4" />
                                    </button>
                                    <button
                                        @click="cancelEdit"
                                        class="p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-md transition-colors touch-target"
                                        :title="t('actions.cancel')"
                                        :aria-label="t('actions.cancel')"
                                    >
                                        <X class="h-4 w-4" />
                                    </button>
                                </template>
                                <template v-else>
                                    <button
                                        @click="startEdit(index)"
                                        class="p-1.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-md transition-colors touch-target"
                                        :title="t('subscriptions.renameGroup')"
                                        :aria-label="t('subscriptions.renameGroup')"
                                    >
                                        <Pencil class="h-4 w-4" />
                                    </button>
                                    <button
                                        @click="handleDelete(element.name)"
                                        class="p-1.5 text-zinc-500 hover:text-red-500 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-md transition-colors touch-target"
                                        :title="t('actions.delete')"
                                        :aria-label="t('actions.delete')"
                                    >
                                        <Trash2 class="h-4 w-4" />
                                    </button>
                                </template>
                            </div>
                        </div>
                    </template>
                </draggable>

                <div
                    v-if="isDraggable"
                    class="mt-3 p-3 bg-transparent border border-zinc-200 dark:border-zinc-800 rounded-md"
                >
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
