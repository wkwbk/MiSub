<script setup>
    import { markRaw } from 'vue';
    import { Settings, Home, FileText, Globe, Zap, Monitor, Server } from 'lucide-vue-next';
    import { useI18n } from '../../i18n/index.js';

    const { t } = useI18n();

    const props = defineProps({
        activeTab: {
            type: String,
            required: true,
        },
    });

    const emit = defineEmits(['update:activeTab']);

    // 分组：原先 7 个 tab 平铺，其中「基础设置 / 全局设置 / 系统设置」三个命名含义高度重叠，
    // 用户难以判断某个设置该去哪一栏找。改为按「站点展示 / 数据与集成 / 系统维护」三组归类，
    // 每组给出小标题，降低查找成本。
    const tabGroups = [
        {
            id: 'site',
            labelKey: 'settings.groups.site',
            tabs: [
                { id: 'basic', labelKey: 'settings.tabs.basic', icon: markRaw(Settings) },
                { id: 'home', labelKey: 'settings.tabs.home', icon: markRaw(Home) },
                { id: 'custom-page', labelKey: 'settings.tabs.customPage', icon: markRaw(FileText) },
            ],
        },
        {
            id: 'data',
            labelKey: 'settings.groups.data',
            tabs: [
                { id: 'global', labelKey: 'settings.tabs.global', icon: markRaw(Globe) },
                { id: 'service', labelKey: 'settings.tabs.service', icon: markRaw(Zap) },
                { id: 'client', labelKey: 'settings.tabs.client', icon: markRaw(Monitor) },
            ],
        },
        {
            id: 'maintenance',
            labelKey: 'settings.groups.maintenance',
            tabs: [{ id: 'system', labelKey: 'settings.tabs.system', icon: markRaw(Server) }],
        },
    ];
</script>

<template>
    <nav class="grid grid-cols-2 gap-2 p-1 md:flex md:flex-col md:space-y-1 md:gap-0 md:p-0">
        <template v-for="(group, groupIndex) in tabGroups" :key="group.id">
            <!-- 分组标题只在桌面端显示；移动端保持两列紧凑网格 -->
            <p
                class="hidden md:block px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500"
                :class="
                    groupIndex > 0
                        ? 'md:mt-4 md:pt-3 md:border-t md:border-zinc-800'
                        : 'md:pt-2'
                "
            >
                {{ t(group.labelKey) }}
            </p>
            <button
                v-for="tab in group.tabs"
                :key="tab.id"
                @click="emit('update:activeTab', tab.id)"
                class="relative flex items-center justify-center md:justify-start px-3 py-2 text-xs font-medium rounded-md transition-colors"
                :class="
                    activeTab === tab.id
                        ? 'bg-zinc-100 text-zinc-900 font-semibold border border-zinc-100 shadow-none'
                        : 'text-zinc-400 border border-transparent hover:bg-zinc-900 hover:text-zinc-100'
                "
            >
                <component
                    :is="tab.icon"
                    class="mr-2 md:mr-2.5 flex-shrink-0 h-4 w-4"
                    :class="activeTab === tab.id ? 'text-current' : 'text-zinc-500'"
                />
                {{ t(tab.labelKey) }}
            </button>
        </template>
    </nav>
</template>
