<script setup>
    import { computed, ref, watch } from 'vue';
    import {
        ChevronDown,
        ChevronUp,
        Cpu,
        ExternalLink,
        Loader2,
        SquarePen,
        Trash2,
        Upload,
    } from '@lucide/vue';
    import { useI18n } from '@/i18n/index.js';
    import { useToastStore } from '@/stores/toast.js';
    import Modal from '@/components/forms/Modal.vue';
    import Switch from '@/components/ui/Switch.vue';
    import Textarea from '@/components/ui/Textarea.vue';
    import SectionHeader from '@/components/settings/SectionHeader.vue';
    import { api } from '@/lib/http.js';
    import {
        DEFAULT_PUBLIC_CORES,
        normalizeCoreTags,
        normalizePublicCoresConfig,
        PUBLIC_CORE_CATEGORIES,
        resolvePublicCoreIcon,
    } from '@/constants/default-public-cores.js';

    const props = defineProps({
        settings: {
            type: Object,
            required: true,
        },
    });

    const { t } = useI18n();
    const { showToast } = useToastStore();

    const ensurePublicCores = () => {
        if (!props.settings) return;
        if (
            !props.settings.publicCores ||
            !Array.isArray(props.settings.publicCores.items)
        ) {
            props.settings.publicCores = normalizePublicCoresConfig(props.settings.publicCores);
        }
    };

    ensurePublicCores();

    watch(
        () => props.settings?.publicCores,
        (val) => {
            if (!val || !Array.isArray(val.items)) {
                ensurePublicCores();
            }
        }
    );

    const publicCoresConfig = computed(() => {
        ensurePublicCores();
        return props.settings.publicCores;
    });

    const activeCategory = ref('all');
    const showEditModal = ref(false);
    const showResetConfirm = ref(false);
    const showDeleteConfirm = ref(false);
    const coreToDeleteId = ref(null);
    const isNew = ref(false);
    const saving = ref(false);
    const iconFileInput = ref(null);
    const uploadingIcon = ref(false);
    const tagsInput = ref('');

    const editingCore = ref({
        id: '',
        name: '',
        category: 'multipurpose',
        tags: [],
        description: '',
        url: '',
        icon: '',
        enabled: true,
    });

    const isDataIcon = computed(() => {
        const icon = editingCore.value?.icon;
        return typeof icon === 'string' && icon.startsWith('data:');
    });

    const iconInputValue = computed({
        get() {
            const icon = editingCore.value?.icon;
            if (!icon || (typeof icon === 'string' && icon.startsWith('data:'))) return '';
            return icon;
        },
        set(value) {
            editingCore.value = {
                ...editingCore.value,
                icon: value,
            };
        },
    });

    const categoryTabs = computed(() => [
        { value: 'all', label: t('publicProfiles.allCategories') },
        ...PUBLIC_CORE_CATEGORIES.map((cat) => ({
            value: cat.value,
            label: t(cat.labelKey),
        })),
    ]);

    const filteredCores = computed(() => {
        const items = publicCoresConfig.value.items || [];
        if (activeCategory.value === 'all') return items;
        return items.filter((item) => item.category === activeCategory.value);
    });

    const getCategoryLabel = (category) => {
        const found = PUBLIC_CORE_CATEGORIES.find((c) => c.value === category);
        return found ? t(found.labelKey) : category || t('publicCores.categories.other');
    };

    const getHostname = (rawUrl) => {
        try {
            return new URL(rawUrl).hostname.replace(/^www\./, '');
        } catch {
            return rawUrl || '';
        }
    };

    const normalizeCoreUrl = (rawUrl) => {
        const trimmed = String(rawUrl || '').trim();
        if (!trimmed) return '';
        if (/^https?:\/\//i.test(trimmed)) return trimmed;
        return `https://${trimmed}`;
    };

    const persistPublicCoresSilently = async () => {
        try {
            await api.post(
                '/api/settings',
                { publicCores: props.settings.publicCores },
                { headers: { 'X-MiSub-Save-Scope': 'preferences' } }
            );
        } catch {
            // Silent background persistence; user can still save via main Save button
        }
    };

    const handleEnabledToggle = async () => {
        await persistPublicCoresSilently();
    };

    const handleIconFileSelect = (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const allowedTypes = [
            'image/svg+xml',
            'image/png',
            'image/jpeg',
            'image/gif',
            'image/webp',
            'image/x-icon',
            'image/vnd.microsoft.icon',
        ];
        if (!allowedTypes.includes(file.type)) {
            showToast(t('settings.clientIconInvalidType'), 'error');
            return;
        }

        const maxSize = 200 * 1024;
        if (file.size > maxSize) {
            showToast(t('settings.clientIconTooLarge'), 'error');
            return;
        }

        uploadingIcon.value = true;
        const reader = new FileReader();
        reader.onload = (e) => {
            const result = e.target?.result;
            if (result) {
                editingCore.value = {
                    ...editingCore.value,
                    icon: result,
                };
            }
            uploadingIcon.value = false;
        };
        reader.onerror = () => {
            showToast(t('settings.clientIconReadFailed'), 'error');
            uploadingIcon.value = false;
        };
        reader.readAsDataURL(file);
        event.target.value = '';
    };

    const triggerIconFileSelect = () => {
        iconFileInput.value?.click();
    };

    const clearIcon = () => {
        editingCore.value = {
            ...editingCore.value,
            icon: '',
        };
    };

    const handleAdd = () => {
        isNew.value = true;
        editingCore.value = {
            id: '',
            name: '',
            category: activeCategory.value === 'all' ? 'multipurpose' : activeCategory.value,
            tags: [],
            description: '',
            url: '',
            icon: '',
            enabled: true,
        };
        tagsInput.value = '';
        showEditModal.value = true;
    };

    const handleEdit = (core) => {
        isNew.value = false;
        editingCore.value = JSON.parse(JSON.stringify(core));
        if (!editingCore.value.category) editingCore.value.category = 'other';
        tagsInput.value = normalizeCoreTags(editingCore.value.tags).join(', ');
        showEditModal.value = true;
    };

    const handleSaveCore = async () => {
        const name = String(editingCore.value.name || '').trim();
        if (!name) {
            showToast(t('publicCores.nameRequired'), 'error');
            return;
        }

        const normalizedUrl = normalizeCoreUrl(editingCore.value.url);
        if (!normalizedUrl) {
            showToast(t('publicCores.urlRequired'), 'error');
            return;
        }

        try {
            const parsed = new URL(normalizedUrl);
            if (!['http:', 'https:'].includes(parsed.protocol)) {
                showToast(t('publicCores.invalidUrl'), 'error');
                return;
            }
        } catch {
            showToast(t('publicCores.invalidUrl'), 'error');
            return;
        }

        saving.value = true;
        try {
            const nextItem = {
                ...editingCore.value,
                id:
                    editingCore.value.id ||
                    `core-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                name,
                category: editingCore.value.category || 'other',
                tags: normalizeCoreTags(tagsInput.value),
                description: String(editingCore.value.description || '').trim(),
                url: normalizedUrl,
                icon: String(editingCore.value.icon || '').trim(),
                enabled: editingCore.value.enabled !== false,
            };

            const list = [...(publicCoresConfig.value.items || [])];
            const existingIdx = list.findIndex((item) => item.id === nextItem.id);
            if (existingIdx !== -1) {
                list[existingIdx] = nextItem;
            } else {
                list.push(nextItem);
            }

            props.settings.publicCores = {
                ...publicCoresConfig.value,
                items: list,
            };

            await persistPublicCoresSilently();
            showEditModal.value = false;
            showToast(t('settings.clientSaveSuccess'), 'success');
        } finally {
            saving.value = false;
        }
    };

    const moveCore = async (coreId, direction) => {
        const fullList = [...(publicCoresConfig.value.items || [])];
        const currentVisList = filteredCores.value;
        const visIdx = currentVisList.findIndex((item) => item.id === coreId);
        const targetVisIdx = visIdx + direction;
        if (visIdx === -1 || targetVisIdx < 0 || targetVisIdx >= currentVisList.length) return;

        const itemA = currentVisList[visIdx];
        const itemB = currentVisList[targetVisIdx];
        const fullIdxA = fullList.findIndex((item) => item.id === itemA.id);
        const fullIdxB = fullList.findIndex((item) => item.id === itemB.id);
        if (fullIdxA === -1 || fullIdxB === -1) return;

        const temp = fullList[fullIdxA];
        fullList[fullIdxA] = fullList[fullIdxB];
        fullList[fullIdxB] = temp;

        props.settings.publicCores = {
            ...publicCoresConfig.value,
            items: fullList,
        };
        await persistPublicCoresSilently();
        showToast(t('settings.clientOrderSaved'), 'success');
    };

    const handleDelete = (id) => {
        coreToDeleteId.value = id;
        showDeleteConfirm.value = true;
    };

    const executeDelete = async () => {
        if (!coreToDeleteId.value) return;
        const nextItems = (publicCoresConfig.value.items || []).filter(
            (item) => item.id !== coreToDeleteId.value
        );
        props.settings.publicCores = {
            ...publicCoresConfig.value,
            items: nextItems,
        };
        showDeleteConfirm.value = false;
        coreToDeleteId.value = null;
        await persistPublicCoresSilently();
        showToast(t('settings.clientDeleted'), 'success');
    };

    const executeReset = async () => {
        props.settings.publicCores = {
            enabled: publicCoresConfig.value.enabled !== false,
            items: DEFAULT_PUBLIC_CORES.map((item) => ({ ...item, tags: [...(item.tags || [])] })),
        };
        showResetConfirm.value = false;
        await persistPublicCoresSilently();
        showToast(t('settings.clientResetSuccess'), 'success');
    };
</script>

<template>
    <section class="rounded-lg border border-zinc-800 bg-[#171717] p-6">
        <SectionHeader
            :title="t('publicCores.managerTitle')"
            :description="t('publicCores.managerDesc')"
            :no-margin="!publicCoresConfig.enabled"
            tone="emerald"
        >
            <template #icon>
                <Cpu class="h-4 w-4" />
            </template>
            <template #actions>
                <div class="flex flex-wrap items-center gap-2">
                    <Switch
                        v-model="publicCoresConfig.enabled"
                        @change="handleEnabledToggle"
                    />
                    <template v-if="publicCoresConfig.enabled">
                        <button
                            type="button"
                            @click="showResetConfirm = true"
                            class="px-3 py-1.5 text-center text-xs font-medium text-zinc-300 bg-transparent hover:bg-zinc-900 hover:text-zinc-100 rounded-md border border-zinc-800"
                        >
                            {{ t('publicCores.resetDefault') }}
                        </button>
                        <button
                            type="button"
                            @click="handleAdd"
                            class="px-3.5 py-1.5 text-center text-xs font-semibold text-zinc-900 bg-zinc-100 hover:bg-white rounded-md border border-zinc-100 shadow-none"
                        >
                            {{ t('publicCores.addCore') }}
                        </button>
                    </template>
                </div>
            </template>
        </SectionHeader>

        <div v-if="publicCoresConfig.enabled" class="space-y-4">
            <!-- Category Filter Tabs -->
            <div class="flex flex-wrap items-center gap-2 pb-2 border-b border-zinc-800/80">
                <button
                    v-for="tab in categoryTabs"
                    :key="tab.value"
                    type="button"
                    @click="activeCategory = tab.value"
                    class="px-3 py-1.5 text-xs font-medium rounded-md transition-colors border"
                    :class="
                        activeCategory === tab.value
                            ? 'bg-zinc-100 text-zinc-900 border-zinc-100 font-semibold'
                            : 'bg-transparent text-zinc-400 border-zinc-800 hover:bg-zinc-900 hover:text-zinc-200'
                    "
                >
                    {{ tab.label }}
                </button>
            </div>

            <div
                v-if="filteredCores.length === 0"
                class="py-8 text-center text-xs text-zinc-500 border border-dashed border-zinc-800 rounded-md"
            >
                {{ t('publicCores.emptyCategory') }}
            </div>

            <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div
                    v-for="(core, index) in filteredCores"
                    :key="core.id"
                    class="relative bg-transparent border border-zinc-800/80 rounded-md p-4 shadow-none transition-colors hover:border-zinc-700 group"
                >
                    <div class="flex items-start gap-3 min-w-0">
                        <div
                            class="h-11 w-11 rounded-md flex items-center justify-center text-lg shrink-0 bg-transparent text-zinc-300 overflow-hidden border border-zinc-800"
                        >
                            <img
                                v-if="
                                    resolvePublicCoreIcon(core) &&
                                    (resolvePublicCoreIcon(core).includes('/') ||
                                        resolvePublicCoreIcon(core).startsWith('data:') ||
                                        resolvePublicCoreIcon(core).startsWith('http'))
                                "
                                :src="resolvePublicCoreIcon(core)"
                                :alt="core.name"
                                class="w-full h-full object-contain rounded-md p-1"
                            />
                            <span v-else>{{ core.icon || core.name?.slice(0, 1) || '⚙️' }}</span>
                        </div>

                        <div class="min-w-0 flex-1">
                            <div class="flex items-center gap-2">
                                <h4 class="text-sm font-semibold text-zinc-100 truncate">
                                    {{ core.name }}
                                </h4>
                                <span
                                    class="px-1.5 py-0.5 text-[10px] rounded-md border border-zinc-800 bg-transparent text-zinc-400 font-mono shrink-0"
                                >
                                    {{ getCategoryLabel(core.category) }}
                                </span>
                            </div>
                            <div
                                v-if="core.tags && core.tags.length > 0"
                                class="flex flex-wrap gap-1 mt-1.5"
                            >
                                <span
                                    v-for="tag in core.tags"
                                    :key="tag"
                                    class="px-1.5 py-0.5 text-[10px] rounded-md border border-zinc-800/80 bg-zinc-900/50 text-zinc-400 font-mono"
                                >
                                    {{ tag }}
                                </span>
                            </div>
                            <p class="text-xs text-zinc-400 truncate mt-1">
                                {{ core.description }}
                            </p>
                            <a
                                :href="core.url"
                                target="_blank"
                                rel="noopener noreferrer"
                                class="inline-flex items-center gap-1 text-[11px] font-mono text-zinc-500 hover:text-zinc-300 mt-1.5 truncate max-w-full"
                            >
                                <span class="truncate">{{ getHostname(core.url) }}</span>
                                <ExternalLink class="w-3 h-3 shrink-0" />
                            </a>
                        </div>
                    </div>

                    <div
                        class="mt-4 grid grid-cols-2 sm:flex sm:flex-wrap gap-2 border-t border-zinc-800 pt-3"
                    >
                        <button
                            type="button"
                            @click.stop="moveCore(core.id, -1)"
                            :disabled="index === 0"
                            class="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs bg-transparent border border-zinc-800 text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 rounded-md transition-colors disabled:opacity-40"
                        >
                            <ChevronUp class="w-3.5 h-3.5" />
                            <span>{{ t('actions.moveUp') }}</span>
                        </button>
                        <button
                            type="button"
                            @click.stop="moveCore(core.id, 1)"
                            :disabled="index === filteredCores.length - 1"
                            class="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs bg-transparent border border-zinc-800 text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 rounded-md transition-colors disabled:opacity-40"
                        >
                            <ChevronDown class="w-3.5 h-3.5" />
                            <span>{{ t('actions.moveDown') }}</span>
                        </button>
                        <button
                            type="button"
                            @click.stop="handleEdit(core)"
                            class="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs bg-transparent border border-zinc-800 text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 rounded-md transition-colors"
                        >
                            <SquarePen class="w-3.5 h-3.5" />
                            <span>{{ t('actions.edit') }}</span>
                        </button>
                        <button
                            type="button"
                            @click.stop="handleDelete(core.id)"
                            class="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs bg-transparent border border-zinc-800 text-red-400 hover:border-red-900/60 hover:bg-red-950/40 rounded-md transition-colors"
                        >
                            <Trash2 class="w-3.5 h-3.5" />
                            <span>{{ t('actions.delete') }}</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Add / Edit Core Modal -->
        <Modal
            v-model:show="showEditModal"
            :title="isNew ? t('publicCores.addModalTitle') : t('publicCores.editModalTitle')"
            size="4xl"
        >
            <template #body>
                <div class="grid grid-cols-1 md:grid-cols-12 gap-8">
                    <!-- Left Column: Icon -->
                    <div class="md:col-span-5 lg:col-span-4">
                        <div
                            class="bg-transparent rounded-md p-6 flex flex-col items-center gap-6 h-full border border-zinc-800"
                        >
                            <div class="text-center space-y-3 w-full">
                                <label class="block text-xs font-medium text-zinc-300">{{
                                    t('settings.clientIconPreview')
                                }}</label>
                                <div
                                    class="aspect-square w-full max-w-[140px] mx-auto rounded-md flex items-center justify-center text-5xl bg-[#131515] text-zinc-400 border border-zinc-800 overflow-hidden shadow-none"
                                >
                                    <img
                                        v-if="
                                            resolvePublicCoreIcon(editingCore) &&
                                            (resolvePublicCoreIcon(editingCore).includes('/') ||
                                                resolvePublicCoreIcon(editingCore).startsWith(
                                                    'data:'
                                                ) ||
                                                resolvePublicCoreIcon(editingCore).startsWith(
                                                    'http'
                                                ))
                                        "
                                        :src="resolvePublicCoreIcon(editingCore)"
                                        :alt="editingCore.name"
                                        class="w-full h-full object-contain rounded-md p-3"
                                    />
                                    <span v-else>{{
                                        editingCore.icon || editingCore.name?.slice(0, 1) || '⚙️'
                                    }}</span>
                                </div>
                            </div>

                            <div class="w-full space-y-4">
                                <div class="space-y-2">
                                    <label class="block text-xs font-medium text-zinc-300">{{
                                        t('settings.clientLocalIcon')
                                    }}</label>
                                    <input
                                        ref="iconFileInput"
                                        type="file"
                                        accept="image/svg+xml,image/png,image/jpeg,image/gif,image/webp,image/x-icon"
                                        class="hidden"
                                        @change="handleIconFileSelect"
                                    />
                                    <div class="flex gap-2 justify-center">
                                        <button
                                            @click="triggerIconFileSelect"
                                            type="button"
                                            class="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-300 bg-transparent border border-zinc-800 rounded-md hover:bg-zinc-900 hover:text-zinc-100 transition-colors"
                                            :disabled="uploadingIcon"
                                        >
                                            <Upload v-if="!uploadingIcon" class="w-3.5 h-3.5" />
                                            <Loader2 v-else class="w-3.5 h-3.5 animate-spin" />
                                            <span>{{
                                                uploadingIcon
                                                    ? t('settings.clientUploading')
                                                    : t('settings.clientUploadImage')
                                            }}</span>
                                        </button>
                                        <button
                                            v-if="editingCore.icon"
                                            @click="clearIcon"
                                            type="button"
                                            class="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-400 bg-transparent border border-zinc-800 rounded-md hover:border-red-900/60 hover:bg-red-950/40 transition-colors"
                                        >
                                            <Trash2 class="w-3.5 h-3.5" />
                                            <span>{{ t('actions.clearAll') }}</span>
                                        </button>
                                    </div>
                                    <p v-if="isDataIcon" class="text-xs text-center text-zinc-400">
                                        {{ t('settings.clientUsingLocalIcon') }}
                                    </p>
                                </div>

                                <div class="space-y-2">
                                    <label class="block text-xs font-medium text-zinc-300"
                                        >URL / Emoji</label
                                    >
                                    <input
                                        v-model="iconInputValue"
                                        type="text"
                                        :placeholder="t('publicCores.iconPlaceholder')"
                                        class="block w-full px-3 py-2 rounded-md border border-zinc-800 bg-[#131515] text-zinc-100 font-mono focus:border-zinc-500 focus-visible:ring-1 focus-visible:ring-zinc-500 sm:text-xs"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Right Column: Form Details -->
                    <div class="md:col-span-7 lg:col-span-8 flex flex-col gap-5">
                        <div>
                            <label class="block text-xs font-medium text-zinc-300">
                                {{ t('publicCores.nameLabel') }}
                                <span class="text-red-400">*</span>
                            </label>
                            <input
                                v-model="editingCore.name"
                                type="text"
                                class="mt-1 block w-full rounded-md border border-zinc-800 bg-[#131515] text-zinc-100 shadow-none focus:border-zinc-500 focus-visible:ring-1 focus-visible:ring-zinc-500 sm:text-sm px-3 py-2 font-medium"
                                :placeholder="t('publicCores.namePlaceholder')"
                            />
                        </div>

                        <div>
                            <label class="block text-xs font-medium text-zinc-300 mb-2">
                                {{ t('publicCores.categoryLabel') }}
                            </label>
                            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                <button
                                    v-for="cat in PUBLIC_CORE_CATEGORIES"
                                    :key="cat.value"
                                    type="button"
                                    @click="editingCore.category = cat.value"
                                    class="p-2 rounded-md border text-xs font-medium transition-colors text-center"
                                    :class="
                                        editingCore.category === cat.value
                                            ? 'bg-zinc-900 border-zinc-500 text-zinc-100'
                                            : 'bg-transparent border-zinc-800 text-zinc-500 hover:bg-zinc-900/50 hover:text-zinc-300'
                                    "
                                >
                                    {{ t(cat.labelKey) }}
                                </button>
                            </div>
                        </div>

                        <div>
                            <label class="block text-xs font-medium text-zinc-300">
                                {{ t('publicCores.tagsLabel') }}
                            </label>
                            <input
                                v-model="tagsInput"
                                type="text"
                                class="mt-1 block w-full rounded-md border border-zinc-800 bg-[#131515] text-zinc-100 font-mono shadow-none focus:border-zinc-500 focus-visible:ring-1 focus-visible:ring-zinc-500 sm:text-xs px-3 py-2"
                                :placeholder="t('publicCores.tagsPlaceholder')"
                            />
                        </div>

                        <div>
                            <label class="block text-xs font-medium text-zinc-300">
                                {{ t('publicCores.urlLabel') }}
                                <span class="text-red-400">*</span>
                            </label>
                            <div class="mt-1 flex rounded-md shadow-none">
                                <span
                                    class="inline-flex items-center px-2.5 rounded-l-md border border-r-0 border-zinc-800 bg-zinc-900 text-zinc-500 font-mono text-xs"
                                    >URL</span
                                >
                                <input
                                    v-model="editingCore.url"
                                    type="text"
                                    class="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-md border border-zinc-800 bg-[#131515] text-zinc-100 font-mono focus:border-zinc-500 focus-visible:ring-1 focus-visible:ring-zinc-500 sm:text-xs"
                                    :placeholder="t('publicCores.urlPlaceholder')"
                                />
                            </div>
                        </div>

                        <div>
                            <label class="block text-xs font-medium text-zinc-300">
                                {{ t('publicCores.descriptionLabel') }}
                            </label>
                            <Textarea
                                v-model="editingCore.description"
                                rows="3"
                                wrapperClass="mt-1"
                                class="sm:text-sm px-3 py-2 resize-none"
                                :placeholder="t('publicCores.descriptionPlaceholder')"
                            />
                        </div>
                    </div>
                </div>
            </template>
            <template #footer>
                <div class="flex justify-end gap-2">
                    <button
                        type="button"
                        @click="showEditModal = false"
                        class="px-4 py-1.5 text-xs font-medium text-zinc-300 bg-transparent border border-zinc-800 rounded-md hover:bg-zinc-900 hover:text-zinc-100"
                    >
                        {{ t('actions.cancel') }}
                    </button>
                    <button
                        type="button"
                        @click="handleSaveCore"
                        :disabled="saving"
                        class="px-4 py-1.5 text-xs font-semibold text-zinc-900 bg-zinc-100 border border-zinc-100 rounded-md hover:bg-white disabled:opacity-50"
                    >
                        {{ saving ? t('settings.saving') : t('actions.save') }}
                    </button>
                </div>
            </template>
        </Modal>

        <!-- Reset Confirmation Modal -->
        <Modal
            v-model:show="showResetConfirm"
            @confirm="executeReset"
            :title="t('settings.clientResetConfirmTitle')"
            :confirmText="t('settings.clientResetConfirmAction')"
            :cancelText="t('actions.cancel')"
            size="sm"
        >
            <template #body>
                <div class="space-y-3">
                    <div
                        class="flex items-center gap-2.5 text-zinc-200 bg-transparent p-3 rounded-md border border-zinc-800"
                    >
                        <span class="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0"></span>
                        <p class="text-xs font-medium">{{ t('settings.clientDangerWarning') }}</p>
                    </div>
                    <p class="text-xs text-zinc-400">
                        {{ t('publicCores.resetConfirmQuestion') }}
                        <br />
                        {{ t('publicCores.resetConfirmDesc') }}
                    </p>
                </div>
            </template>
        </Modal>

        <!-- Delete Confirmation Modal -->
        <Modal
            v-model:show="showDeleteConfirm"
            @confirm="executeDelete"
            :title="t('settings.clientDeleteConfirmTitle')"
            :confirmText="t('settings.clientDeleteConfirmAction')"
            :cancelText="t('actions.cancel')"
            size="sm"
        >
            <template #body>
                <div class="space-y-3">
                    <div
                        class="flex items-center gap-2.5 text-zinc-200 bg-transparent p-3 rounded-md border border-zinc-800"
                    >
                        <span class="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0"></span>
                        <p class="text-xs font-medium">{{ t('settings.clientDangerWarning') }}</p>
                    </div>
                    <p class="text-xs text-zinc-400">
                        {{ t('publicCores.deleteConfirmQuestion') }}
                    </p>
                </div>
            </template>
        </Modal>
    </section>
</template>
