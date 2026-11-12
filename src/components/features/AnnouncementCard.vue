<script setup>
    import { ref, computed, watch } from 'vue';
    import DOMPurify from 'dompurify';
    import { useI18n } from '@/i18n/index.js';
    import { useToastStore } from '@/stores/toast.js';
    import { readRawPreference, writeRawPreference } from '@/utils/local-preference.js';

    const { t } = useI18n();
    const { showToast } = useToastStore();

    const props = defineProps({
        announcement: {
            type: Object,
            required: true,
        },
    });

    const isVisible = ref(true);

    const allowedContentTags = [
        'b',
        'i',
        'em',
        'strong',
        'a',
        'p',
        'br',
        'ul',
        'li',
        'code',
        'pre',
    ];
    const allowedContentAttrs = ['href', 'target', 'rel', 'class'];

    const sanitizedContent = computed(() => {
        const rawContent = props.announcement?.content?.trim()
            ? props.announcement.content
            : t('common.announcementFallbackContent');
        return DOMPurify.sanitize(rawContent, {
            ALLOWED_TAGS: allowedContentTags,
            ALLOWED_ATTR: allowedContentAttrs,
        });
    });

    const dismiss = (e) => {
        e.stopPropagation();
        isVisible.value = false;
        if (props.announcement.updatedAt) {
            // 写失败时必须告知用户：否则下次刷新公告又会出现，看起来像「忽略没生效」。
            const persisted = writeRawPreference(
                `announcement_dismissed_${props.announcement.updatedAt}`,
                'true'
            );
            if (!persisted) showToast(t('errors.preferenceNotSaved'), 'error');
        }
    };

    const checkVisibility = () => {
        if (props.announcement?.dismissible && props.announcement?.updatedAt) {
            const dismissed = readRawPreference(
                `announcement_dismissed_${props.announcement.updatedAt}`
            );
            if (dismissed) {
                isVisible.value = false;
            } else {
                isVisible.value = true;
            }
        } else {
            isVisible.value = true;
        }
    };

    checkVisibility();

    watch(
        () => props.announcement,
        () => {
            checkVisibility();
        },
        { deep: true }
    );

    const typeConfig = computed(() => {
        const types = {
            info: {
                dot: 'bg-zinc-400',
            },
            success: {
                dot: 'bg-emerald-500',
            },
            warning: {
                dot: 'bg-amber-500',
            },
            error: {
                dot: 'bg-red-500',
            },
        };
        return types[props.announcement.type] || types.info;
    });
</script>

<template>
    <Transition name="fade-slide">
        <div
            v-if="isVisible"
            class="group relative overflow-hidden transition-colors rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#171717] shadow-none"
        >
            <div class="relative p-4 sm:p-5 z-10 flex flex-col gap-2">
                <!-- Header Area -->
                <div class="flex items-center justify-between gap-4">
                    <div class="flex items-center gap-2 min-w-0">
                        <span
                            class="h-1.5 w-1.5 rounded-full shrink-0"
                            :class="typeConfig.dot"
                        ></span>
                        <h3
                            class="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate"
                        >
                            {{ announcement.title || t('common.announcementFallbackTitle') }}
                        </h3>
                    </div>
                    <button
                        v-if="announcement.dismissible"
                        @click="dismiss"
                        class="p-1 rounded-md text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors touch-target"
                        :title="t('common.dismissAnnouncement')"
                        :aria-label="t('common.dismissAnnouncement')"
                    >
                        <svg
                            class="h-4 w-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M6 18L18 6M6 6l12 12"
                            />
                        </svg>
                    </button>
                </div>

                <!-- Content Area -->
                <div
                    class="prose prose-sm max-w-none text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed dark:prose-invert pl-3.5"
                    v-html="sanitizedContent"
                ></div>

                <div
                    v-if="announcement.updatedAt"
                    class="pt-1 pl-3.5 text-[11px] font-mono text-zinc-500 flex items-center gap-2"
                >
                    {{
                        t('common.updatedAt', {
                            time: new Date(announcement.updatedAt).toLocaleString(),
                        })
                    }}
                </div>
            </div>
        </div>
    </Transition>
</template>

<style scoped>
    .announcement-glass {
        transition:
            transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
            box-shadow 0.3s ease;
    }

    .announcement-glass:hover {
        transform: translateY(-2px);
        box-shadow: 0 12px 30px -10px rgba(0, 0, 0, 0.15);
    }

    .fade-slide-enter-active,
    .fade-slide-leave-active {
        transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .fade-slide-enter-from,
    .fade-slide-leave-to {
        opacity: 0;
        transform: translateY(-20px) scale(0.95);
        filter: blur(10px);
    }

    :deep(.prose) {
        --tw-prose-body: currentColor;
    }

    :deep(.prose a) {
        color: var(--color-primary-600);
        text-decoration: underline;
        text-underline-offset: 2px;
        font-weight: 600;
    }

    :deep(.prose code) {
        background: rgba(0, 0, 0, 0.05);
        padding: 2px 4px;
        border-radius: 4px;
        font-size: 0.9em;
    }

    .dark :deep(.prose code) {
        background: rgba(255, 255, 255, 0.1);
    }
</style>
