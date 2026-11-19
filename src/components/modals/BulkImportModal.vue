<script setup>
    import { ref, watch } from 'vue';
    import { Layers } from '@lucide/vue';
    import Modal from '@/components/forms/Modal.vue';
    import TagInput from '@/components/ui/TagInput.vue';
    import LineNumberTextarea from '@/components/ui/LineNumberTextarea.vue';
    import FileImport from '@/components/modals/SubscriptionImport/FileImport.vue';
    import { useManualNodes } from '@/composables/useManualNodes.js';
    import { useDataStore } from '@/stores/useDataStore.js';
    import { useToastStore } from '@/stores/toast.js';
    import { useI18n } from '@/i18n/index.js';
    import { api } from '@/lib/http.js';
    import { generateNodeId } from '@/utils/id.js';
    import { readFilesAsText } from '@/utils/importFile.js';
    import { buildAutoTagName } from '@/utils/auto-tag-name.js';
    import { applyItemTags, normalizeTagList } from '@/utils/tags.js';
    import { cleanNodeUrl } from '@/lib/utils.js';

    const { t } = useI18n();
    const { manualNodeTags } = useManualNodes(useDataStore().markDirty);
    const toastStore = useToastStore();

    const props = defineProps({
        show: Boolean,
    });

    const emit = defineEmits(['update:show', 'import', 'files-imported']);

    const activeTab = ref('text'); // 'text' | 'file'
    const importText = ref('');
    const selectedTags = ref([]);

    const isProcessing = ref(false);
    const parseStatus = ref('');
    const errorMessage = ref('');
    const successMessage = ref('');

    watch(
        () => props.show,
        (visible) => {
            if (!visible) {
                importText.value = '';
                selectedTags.value = [];
                activeTab.value = 'text';
                isProcessing.value = false;
                parseStatus.value = '';
                errorMessage.value = '';
                successMessage.value = '';
            }
        }
    );

    const handleConfirm = () => {
        if (activeTab.value !== 'text') return;
        let tags = normalizeTagList(selectedTags.value);
        if (tags.length === 0) {
            const autoTag = buildAutoTagName();
            tags = autoTag ? [autoTag] : [];
        }
        selectedTags.value = tags;
        emit('import', importText.value, tags);
        importText.value = '';
        selectedTags.value = [];
        setTimeout(() => {
            emit('update:show', false);
        }, 1000);
    };

    const handleFiles = async (fileList) => {
        isProcessing.value = true;
        errorMessage.value = '';
        successMessage.value = '';
        parseStatus.value = t('importNodes.readingFile');

        try {
            let targetTags = normalizeTagList(selectedTags.value);
            if (targetTags.length === 0 && fileList?.length) {
                const autoTag = buildAutoTagName({ fileName: fileList[0].name });
                targetTags = autoTag ? [autoTag] : [];
                selectedTags.value = targetTags;
            }

            const { text, fileCount } = await readFilesAsText(fileList);
            if (!text.trim()) {
                throw new Error(t('importNodes.emptyFile'));
            }

            parseStatus.value = t('importNodes.parsingFiles', { count: fileCount });
            const parseResult = await api.post('/api/parse_subscription', { content: text });

            if (!parseResult.success) {
                throw new Error(parseResult.error || t('importNodes.parseFileFailed'));
            }

            const nodes = (parseResult.data?.nodes || []).map((node) =>
                applyItemTags(
                    {
                        id: generateNodeId(),
                        name: node.name || 'Unknown',
                        url: cleanNodeUrl(node.url),
                        enabled: true,
                        protocol: node.protocol || 'unknown',
                        source: 'import',
                    },
                    targetTags
                )
            );

            if (nodes.length === 0) {
                parseStatus.value = '';
                throw new Error(t('importNodes.noValidNodesFromFile'));
            }

            const uniqueNodes = nodes.filter(
                (node, index, self) => index === self.findIndex((n) => n.url === node.url)
            );
            const duplicateCount = nodes.length - uniqueNodes.length;

            parseStatus.value = '';
            emit('files-imported', uniqueNodes, targetTags);

            const msg =
                t('importNodes.addedNodes', { count: uniqueNodes.length }) +
                (targetTags.length > 0
                    ? t('importNodes.addedWithTags', { tags: targetTags.join(', ') })
                    : '') +
                (duplicateCount > 0
                    ? t('importNodes.dedupedSuffix', { count: duplicateCount })
                    : '');
            successMessage.value = msg;
            toastStore.showToast(msg, 'success');

            setTimeout(() => {
                emit('update:show', false);
            }, 2000);
        } catch (error) {
            console.error('批量文件导入失败:', error);
            parseStatus.value = '';
            errorMessage.value = error.message || t('importNodes.failed');
            toastStore.showToast(
                t('importNodes.failedWithMessage', { message: error.message }),
                'error'
            );
        } finally {
            isProcessing.value = false;
        }
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
                <Layers class="h-5 w-5 text-fg-muted shrink-0" />
                <div>
                    <h3 class="text-base font-semibold text-fg">
                        {{ t('bulkImport.title') }}
                    </h3>
                    <p class="mt-0.5 text-xs text-fg-muted">
                        {{ t('bulkImport.description') }}
                    </p>
                </div>
            </div>
        </template>

        <template #footer>
            <button
                @click="emit('update:show', false)"
                class="px-4 py-2 border border-line bg-transparent hover:bg-hover text-fg-muted hover:text-fg font-medium text-xs rounded-md transition-colors"
            >
                {{ t('actions.cancel') }}
            </button>
            <button
                v-if="activeTab === 'text'"
                @click="handleConfirm"
                class="px-4 py-2 bg-accent hover:opacity-90 text-accent-fg font-semibold text-xs rounded-md transition-colors"
            >
                {{ t('actions.confirm') }}
            </button>
        </template>

        <template #body>
            <div class="space-y-5">
                <div
                    class="grid grid-cols-2 divide-x divide-line-subtle border border-line rounded-md overflow-hidden bg-inset"
                >
                    <button
                        type="button"
                        class="py-1.5 text-xs font-medium transition-colors"
                        :class="
                            activeTab === 'text'
                                ? 'bg-accent text-accent-fg font-semibold'
                                : 'text-fg-muted hover:bg-hover hover:text-fg'
                        "
                        @click="activeTab = 'text'"
                    >
                        {{ t('importNodes.tabPaste') }}
                    </button>
                    <button
                        type="button"
                        class="py-1.5 text-xs font-medium transition-colors"
                        :class="
                            activeTab === 'file'
                                ? 'bg-accent text-accent-fg font-semibold'
                                : 'text-fg-muted hover:bg-hover hover:text-fg'
                        "
                        @click="activeTab = 'file'"
                    >
                        {{ t('importNodes.tabFile') }}
                    </button>
                </div>

                <div class="relative">
                    <div class="flex flex-col gap-1.5">
                        <label class="text-xs font-semibold text-fg-muted mb-1">
                            {{ t('bulkImport.tagsLabel') }}
                        </label>
                        <TagInput
                            v-model="selectedTags"
                            :suggestions="manualNodeTags"
                            :placeholder="t('manualNodes.tagsPlaceholder')"
                        />
                    </div>
                </div>

                <div v-if="activeTab === 'text'" class="relative group space-y-1.5">
                    <LineNumberTextarea
                        v-model="importText"
                        :rows="8"
                        placeholder="http://...&#10;https://...&#10;vmess://...&#10;vless://...&#10;trojan://..."
                    />
                    <p class="text-xs text-fg-subtle">
                        {{ t('bulkImport.helper') }}
                    </p>
                </div>

                <FileImport
                    v-else
                    :is-processing="isProcessing"
                    :parse-status="parseStatus"
                    :error-message="errorMessage"
                    :success-message="successMessage"
                    @files="handleFiles"
                />
            </div>
        </template>
    </Modal>
</template>
