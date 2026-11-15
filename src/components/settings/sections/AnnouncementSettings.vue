<script setup>
    import { computed, watch } from 'vue';
    import { Megaphone } from 'lucide-vue-next';
    import DOMPurify from 'dompurify';
    import Select from '../../ui/Select.vue';
    import Switch from '../../ui/Switch.vue';
    import SectionHeader from '../SectionHeader.vue';
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
    <section class="rounded-lg border border-zinc-800 bg-[#171717] p-6">
        <!-- 头部说明 & 开关 -->
        <SectionHeader
            :title="t('settings.announcementTitle')"
            :description="t('settings.announcementDesc')"
            :no-margin="!announcement.enabled"
        >
            <template #icon>
                <Megaphone class="h-4 w-4" />
            </template>
            <template #actions>
                <Switch v-model="announcement.enabled" @change="handleContentUpdate" />
            </template>
        </SectionHeader>

        <!-- 内容编辑 -->
        <div
            v-if="announcement.enabled"
            class="space-y-6 animate-fade-in-down"
        >
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <!-- 标题 -->
                <div>
                    <label class="block text-xs font-medium text-zinc-300 mb-1.5">{{
                        t('settings.announcementFieldTitle')
                    }}</label>
                    <input
                        type="text"
                        v-model="announcement.title"
                        @input="handleContentUpdate"
                        :placeholder="t('settings.announcementTitlePlaceholder')"
                        class="block w-full px-3 py-2 bg-[#131515] border border-zinc-800 rounded-md shadow-none focus-visible:ring-1 focus-visible:ring-zinc-500 focus:border-zinc-500 sm:text-sm text-zinc-100 transition-colors"
                    />
                </div>

                <!-- 类型 -->
                <div>
                    <label class="block text-xs font-medium text-zinc-300 mb-1.5">{{
                        t('settings.announcementType')
                    }}</label>
                    <Select
                        v-model="announcement.type"
                        @change="handleContentUpdate"
                        :options="[
                            { value: 'info', label: t('settings.announcementInfo') },
                            { value: 'success', label: t('settings.announcementSuccess') },
                            { value: 'warning', label: t('settings.announcementWarning') },
                            { value: 'error', label: t('settings.announcementError') },
                        ]"
                    />
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
                        class="block w-full px-3 py-2 bg-[#131515] border border-zinc-800 rounded-md shadow-none focus-visible:ring-1 focus-visible:ring-zinc-500 focus:border-zinc-500 sm:text-sm text-zinc-100 transition-colors font-mono"
                    ></textarea>
                    <div class="absolute bottom-2 right-2 text-xs text-zinc-500 font-mono">
                        {{ t('settings.announcementHtmlSupported') }}
                    </div>
                </div>
                <p class="mt-2 text-xs text-zinc-500 leading-relaxed">
                    {{ t('settings.announcementHtmlHint') }}
                </p>
            </div>

            <!-- 选项 -->
            <div class="flex items-center gap-4">
                <label class="flex items-center gap-2.5 cursor-pointer">
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

            <!-- 预览区域 -->
            <div class="pt-6 border-t border-zinc-800/60">
                <h4 class="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
                    {{ t('settings.announcementPreview') }}
                </h4>
                <div class="bg-[#131515]/80 rounded-md border border-zinc-800/80 p-4">
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
    </section>
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
