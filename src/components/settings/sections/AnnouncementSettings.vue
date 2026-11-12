<script setup>
    import { computed, watch } from 'vue';
    import DOMPurify from 'dompurify';
    import Switch from '../../ui/Switch.vue';
    import { useI18n } from '../../../i18n/index.js';

    const { t } = useI18n();

    const props = defineProps({
        settings: {
            type: Object,
            required: true,
        },
    });

    const defaultAnnouncement = {
        enabled: false,
        title: '',
        content: '',
        type: 'info', // info, warning, success
        dismissible: true,
        updatedAt: null,
    };

    const ensureAnnouncement = () => {
        if (!props.settings.announcement) {
            props.settings.announcement = { ...defaultAnnouncement };
        }
    };

    ensureAnnouncement();

    watch(
        () => props.settings.announcement,
        (val) => {
            if (!val) ensureAnnouncement();
        }
    );

    // 确保 announcement 对象存在
    const announcement = computed(() => props.settings.announcement || defaultAnnouncement);

    const allowedContentTags = ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'li'];
    const allowedContentAttrs = ['href', 'target', 'rel'];

    const sanitizedContent = computed(() =>
        DOMPurify.sanitize(announcement.value.content || '', {
            ALLOWED_TAGS: allowedContentTags,
            ALLOWED_ATTR: allowedContentAttrs,
        })
    );

    const handleContentUpdate = () => {
        announcement.value.updatedAt = new Date().toISOString();
    };
</script>

<template>
    <div class="space-y-6">
        <!-- 头部说明 -->
        <div
            class="bg-transparent rounded-md p-5 space-y-5 border border-zinc-800 shadow-none animate-fade-in-down"
        >
            <div class="flex items-start gap-3">
                <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-transparent text-zinc-300">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"
                        />
                    </svg>
                </div>
                <div class="space-y-0.5">
                    <h3 class="text-sm font-semibold text-zinc-100">
                        {{ t('settings.announcementTitle') }}
                    </h3>
                    <p class="text-xs text-zinc-400">
                        {{ t('settings.announcementDesc') }}
                    </p>
                </div>
            </div>

            <div
                class="flex items-center justify-between p-4 bg-transparent border border-zinc-800 rounded-md"
            >
                <div>
                    <p class="text-sm font-medium text-zinc-100">
                        {{ t('settings.announcementEnable') }}
                    </p>
                    <p class="text-xs text-zinc-400 mt-0.5">
                        {{ t('settings.announcementEnableDesc') }}
                    </p>
                </div>
                <Switch v-model="announcement.enabled" @change="handleContentUpdate" />
            </div>
        </div>

        <!-- 内容编辑 -->
        <div
            v-if="announcement.enabled"
            class="bg-transparent rounded-md p-5 space-y-5 border border-zinc-800 shadow-none animate-fade-in-down"
        >
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <!-- 标题 -->
                <div>
                    <label
                        class="block text-xs font-medium text-zinc-300 mb-1.5"
                        >{{ t('settings.announcementFieldTitle') }}</label
                    >
                    <input
                        type="text"
                        v-model="announcement.title"
                        @input="handleContentUpdate"
                        :placeholder="t('settings.announcementTitlePlaceholder')"
                        class="block w-full px-3 py-2 bg-[#09090b] border border-zinc-800 rounded-md shadow-none focus-visible:ring-1 focus-visible:ring-zinc-500 focus:border-zinc-500 sm:text-sm text-zinc-100 transition-colors"
                    />
                </div>

                <!-- 类型 -->
                <div>
                    <label
                        class="block text-xs font-medium text-zinc-300 mb-1.5"
                        >{{ t('settings.announcementType') }}</label
                    >
                    <select
                        v-model="announcement.type"
                        @change="handleContentUpdate"
                        class="block w-full px-3 py-2 bg-[#09090b] border border-zinc-800 rounded-md shadow-none focus-visible:ring-1 focus-visible:ring-zinc-500 focus:border-zinc-500 sm:text-sm text-zinc-100 transition-colors"
                    >
                        <option value="info">{{ t('settings.announcementInfo') }}</option>
                        <option value="success">{{ t('settings.announcementSuccess') }}</option>
                        <option value="warning">{{ t('settings.announcementWarning') }}</option>
                        <option value="error">{{ t('settings.announcementError') }}</option>
                    </select>
                </div>
            </div>

            <!-- 内容 -->
            <div>
                <label class="block text-xs font-medium text-zinc-300 mb-1.5">{{
                    t('settings.announcementContent')
                }}</label>
                <div class="relative">
                    <textarea
                        v-model="announcement.content"
                        @input="handleContentUpdate"
                        rows="6"
                        :placeholder="t('settings.announcementContentPlaceholder')"
                        class="block w-full px-3 py-2 bg-[#09090b] border border-zinc-800 rounded-md shadow-none focus-visible:ring-1 focus-visible:ring-zinc-500 focus:border-zinc-500 sm:text-sm text-zinc-100 transition-colors font-mono"
                    ></textarea>
                    <div class="absolute bottom-2 right-2 text-xs text-zinc-500 font-mono">
                        {{ t('settings.announcementHtmlSupported') }}
                    </div>
                </div>
                <p class="mt-2 text-xs text-zinc-500">
                    {{ t('settings.announcementHtmlHint') }}
                </p>
            </div>

            <!-- 选项 -->
            <div class="flex items-center gap-4">
                <label class="flex items-center gap-2 cursor-pointer">
                    <input
                        type="checkbox"
                        v-model="announcement.dismissible"
                        @change="handleContentUpdate"
                        class="rounded border-zinc-700 bg-zinc-900 text-zinc-100 shadow-none focus:border-zinc-500"
                    />
                    <span class="text-sm text-zinc-300">{{
                        t('settings.announcementDismissible')
                    }}</span>
                </label>
            </div>

            <!-- 预览区域 (可选) -->
            <div
                class="mt-4 p-4 border border-zinc-800 rounded-md bg-transparent"
            >
                <h4 class="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                    {{ t('settings.announcementPreview') }}
                </h4>
                <div
                    class="bg-[#09090b] rounded-md shadow-none border border-zinc-800 p-4"
                >
                    <div class="flex items-start gap-2.5">
                        <span
                            class="h-1.5 w-1.5 rounded-full shrink-0 mt-1.5"
                            :class="{
                                'bg-sky-500': announcement.type === 'info',
                                'bg-emerald-500': announcement.type === 'success',
                                'bg-amber-500': announcement.type === 'warning',
                                'bg-red-500': announcement.type === 'error',
                            }"
                        ></span>
                        <div class="flex-1">
                            <h3
                                class="text-sm font-semibold text-zinc-100"
                                v-if="announcement.title"
                            >
                                {{ announcement.title }}
                            </h3>
                            <div
                                class="text-xs text-zinc-300 mt-1 prose prose-sm prose-invert max-w-none"
                                v-html="sanitizedContent"
                            ></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
    /* Toggle Switch CSS - Reused */

    .animate-fade-in-down {
        animation: fadeInDown 0.3s ease-out;
    }

    @keyframes fadeInDown {
        from {
            opacity: 0;
            transform: translateY(-5px);
        }

        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
</style>
