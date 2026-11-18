<script setup>
    import { computed, markRaw, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
    import {
        Check,
        FileText,
        Globe,
        Home,
        LayoutGrid,
        Server,
        Settings,
        Zap,
    } from '@lucide/vue';
    import { useI18n } from '@/i18n/index.js';

    const { t } = useI18n();

    const props = defineProps({
        activeTab: {
            type: String,
            required: true,
        },
        inModal: {
            type: Boolean,
            default: false,
        },
    });

    const emit = defineEmits(['update:activeTab']);

    // 分组结构：按「站点展示 / 数据与集成 / 系统维护」三组归类，
    // 桌面端提供分组标题与副标题说明，移动端提供单行横向标签栏 + 全部分类速查面板。
    const tabGroups = [
        {
            id: 'site',
            labelKey: 'settings.groups.site',
            tabs: [
                {
                    id: 'basic',
                    labelKey: 'settings.tabs.basic',
                    descKey: 'settings.tabDescriptions.basic',
                    icon: markRaw(Settings),
                },
                {
                    id: 'home',
                    labelKey: 'settings.tabs.home',
                    descKey: 'settings.tabDescriptions.home',
                    icon: markRaw(Home),
                },
                {
                    id: 'custom-page',
                    labelKey: 'settings.tabs.customPage',
                    descKey: 'settings.tabDescriptions.customPage',
                    icon: markRaw(FileText),
                },
            ],
        },
        {
            id: 'data',
            labelKey: 'settings.groups.data',
            tabs: [
                {
                    id: 'global',
                    labelKey: 'settings.tabs.global',
                    descKey: 'settings.tabDescriptions.global',
                    icon: markRaw(Globe),
                },
                {
                    id: 'service',
                    labelKey: 'settings.tabs.service',
                    descKey: 'settings.tabDescriptions.service',
                    icon: markRaw(Zap),
                },
            ],
        },
        {
            id: 'maintenance',
            labelKey: 'settings.groups.maintenance',
            tabs: [
                {
                    id: 'system',
                    labelKey: 'settings.tabs.system',
                    descKey: 'settings.tabDescriptions.system',
                    icon: markRaw(Server),
                },
            ],
        },
    ];

    const flatTabs = computed(() => tabGroups.flatMap((group) => group.tabs));

    const desktopNavRef = ref(null);
    const mobileBarRef = ref(null);
    const mobileScrollRef = ref(null);
    const isMobileMenuOpen = ref(false);
    const canScrollLeft = ref(false);
    const canScrollRight = ref(false);

    let resizeObserver = null;

    function selectTab(tabId) {
        isMobileMenuOpen.value = false;
        if (tabId !== props.activeTab) {
            emit('update:activeTab', tabId);
        }
    }

    function updateScrollIndicators() {
        const el = mobileScrollRef.value;
        if (!el) return;
        const maxScrollLeft = el.scrollWidth - el.clientWidth;
        canScrollLeft.value = el.scrollLeft > 4;
        canScrollRight.value = maxScrollLeft - el.scrollLeft > 4;
    }

    function centerActiveMobileTab(behavior = 'smooth') {
        const container = mobileScrollRef.value;
        if (!container) return;
        const target = container.querySelector(`[data-mobile-tab="${props.activeTab}"]`);
        if (!target) return;

        const targetCenter = target.offsetLeft - (container.clientWidth - target.offsetWidth) / 2;
        const nextLeft = Math.max(
            0,
            Math.min(targetCenter, container.scrollWidth - container.clientWidth)
        );
        if (typeof container.scrollTo === 'function') {
            container.scrollTo({ left: nextLeft, behavior });
        } else {
            container.scrollLeft = nextLeft;
        }
        updateScrollIndicators();
    }

    function handleDesktopKeydown(event, currentId) {
        const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
        if (!keys.includes(event.key)) return;
        event.preventDefault();

        const tabs = flatTabs.value;
        const currentIndex = tabs.findIndex((item) => item.id === currentId);
        if (currentIndex === -1) return;

        let nextIndex = currentIndex;
        if (event.key === 'ArrowDown') {
            nextIndex = (currentIndex + 1) % tabs.length;
        } else if (event.key === 'ArrowUp') {
            nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        } else if (event.key === 'Home') {
            nextIndex = 0;
        } else if (event.key === 'End') {
            nextIndex = tabs.length - 1;
        }

        const nextTab = tabs[nextIndex];
        if (!nextTab) return;
        selectTab(nextTab.id);
        nextTick(() => {
            const btn = desktopNavRef.value?.querySelector(`[data-desktop-tab="${nextTab.id}"]`);
            btn?.focus?.();
        });
    }

    function handleMobileKeydown(event, currentId) {
        const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
        if (!keys.includes(event.key)) return;
        event.preventDefault();

        const tabs = flatTabs.value;
        const currentIndex = tabs.findIndex((item) => item.id === currentId);
        if (currentIndex === -1) return;

        let nextIndex = currentIndex;
        if (event.key === 'ArrowRight') {
            nextIndex = (currentIndex + 1) % tabs.length;
        } else if (event.key === 'ArrowLeft') {
            nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        } else if (event.key === 'Home') {
            nextIndex = 0;
        } else if (event.key === 'End') {
            nextIndex = tabs.length - 1;
        }

        const nextTab = tabs[nextIndex];
        if (!nextTab) return;
        selectTab(nextTab.id);
        nextTick(() => {
            const btn = mobileScrollRef.value?.querySelector(`[data-mobile-tab="${nextTab.id}"]`);
            btn?.focus?.();
        });
    }

    function handleDocumentPointerDown(event) {
        if (!isMobileMenuOpen.value) return;
        if (mobileBarRef.value && !mobileBarRef.value.contains(event.target)) {
            isMobileMenuOpen.value = false;
        }
    }

    function handleDocumentKeydown(event) {
        if (event.key === 'Escape' && isMobileMenuOpen.value) {
            isMobileMenuOpen.value = false;
        }
    }

    watch(
        () => props.activeTab,
        () => {
            nextTick(() => centerActiveMobileTab('smooth'));
        }
    );

    onMounted(() => {
        nextTick(() => {
            centerActiveMobileTab('auto');
            updateScrollIndicators();
        });

        if (typeof ResizeObserver !== 'undefined' && mobileScrollRef.value) {
            resizeObserver = new ResizeObserver(() => updateScrollIndicators());
            resizeObserver.observe(mobileScrollRef.value);
        }

        if (typeof document !== 'undefined') {
            document.addEventListener('pointerdown', handleDocumentPointerDown);
            document.addEventListener('keydown', handleDocumentKeydown);
        }
    });

    onUnmounted(() => {
        resizeObserver?.disconnect?.();
        if (typeof document !== 'undefined') {
            document.removeEventListener('pointerdown', handleDocumentPointerDown);
            document.removeEventListener('keydown', handleDocumentKeydown);
        }
    });
</script>

<template>
    <!-- 移动端：单行吸顶横向滑动标签栏 + 全部分类速查浮层（告别多行堆叠挤压） -->
    <div ref="mobileBarRef" class="md:hidden relative flex items-center gap-1.5">
        <div class="relative flex-1 min-w-0">
            <div
                v-show="canScrollLeft"
                aria-hidden="true"
                class="pointer-events-none absolute inset-y-0 left-0 z-10 w-5 bg-gradient-to-r to-transparent"
                :class="
                    inModal
                        ? 'from-white dark:from-[#171717]'
                        : 'from-zinc-50 dark:from-[#131515]'
                "
            ></div>

            <nav
                ref="mobileScrollRef"
                role="tablist"
                aria-orientation="horizontal"
                :aria-label="t('settings.navLabel')"
                data-testid="settings-mobile-tablist"
                class="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5"
                @scroll.passive="updateScrollIndicators"
            >
                <button
                    v-for="tab in flatTabs"
                    :key="tab.id"
                    type="button"
                    role="tab"
                    :data-mobile-tab="tab.id"
                    :aria-selected="activeTab === tab.id"
                    :tabindex="activeTab === tab.id ? 0 : -1"
                    class="shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors touch-target-min"
                    :class="
                        activeTab === tab.id
                            ? 'bg-zinc-100 text-zinc-900 font-semibold border-zinc-100 shadow-none'
                            : 'text-zinc-400 border-transparent hover:bg-zinc-900 hover:text-zinc-100'
                    "
                    @click="selectTab(tab.id)"
                    @keydown="handleMobileKeydown($event, tab.id)"
                >
                    <component
                        :is="tab.icon"
                        class="h-3.5 w-3.5 shrink-0"
                        :class="activeTab === tab.id ? 'text-current' : 'text-zinc-500'"
                    />
                    <span>{{ t(tab.labelKey) }}</span>
                </button>
            </nav>

            <div
                v-show="canScrollRight"
                aria-hidden="true"
                class="pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-gradient-to-l to-transparent"
                :class="
                    inModal
                        ? 'from-white dark:from-[#171717]'
                        : 'from-zinc-50 dark:from-[#131515]'
                "
            ></div>
        </div>

        <!-- 移动端全部分类速查按钮 -->
        <div class="shrink-0 pl-1.5 border-l border-zinc-800/80">
            <button
                type="button"
                data-testid="settings-mobile-menu-trigger"
                :aria-label="t('settings.allSections')"
                :title="t('settings.allSections')"
                :aria-expanded="isMobileMenuOpen"
                class="inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors touch-target-min"
                :class="
                    isMobileMenuOpen
                        ? 'bg-zinc-100 text-zinc-900 border-zinc-100'
                        : 'border-zinc-800 bg-transparent text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100'
                "
                @click="isMobileMenuOpen = !isMobileMenuOpen"
            >
                <LayoutGrid class="h-3.5 w-3.5" />
            </button>
        </div>

        <!-- 分组速查下拉面板 -->
        <Transition name="fade">
            <div
                v-if="isMobileMenuOpen"
                data-testid="settings-mobile-menu"
                class="absolute left-0 right-0 top-full mt-2 z-40 rounded-lg border border-zinc-800 bg-[#171717] p-2 shadow-[0_12px_32px_rgba(0,0,0,0.22)] dark:shadow-[0_16px_36px_rgba(0,0,0,0.6)] max-h-[70vh] overflow-y-auto"
            >
                <div
                    v-for="(group, groupIndex) in tabGroups"
                    :key="group.id"
                    :class="groupIndex > 0 ? 'mt-2 pt-2 border-t border-zinc-800/80' : ''"
                >
                    <p
                        class="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500"
                    >
                        {{ t(group.labelKey) }}
                    </p>
                    <div class="space-y-0.5">
                        <button
                            v-for="tab in group.tabs"
                            :key="tab.id"
                            type="button"
                            class="w-full flex items-center justify-between gap-3 px-2.5 py-2 rounded-md text-left transition-colors"
                            :class="
                                activeTab === tab.id
                                    ? 'bg-zinc-100 text-zinc-900 border border-zinc-100'
                                    : 'text-zinc-200 border border-transparent hover:bg-zinc-900'
                            "
                            @click="selectTab(tab.id)"
                        >
                            <span class="flex items-start gap-2.5 min-w-0">
                                <component
                                    :is="tab.icon"
                                    class="h-4 w-4 mt-0.5 shrink-0"
                                    :class="activeTab === tab.id ? 'text-current' : 'text-zinc-400'"
                                />
                                <span class="min-w-0">
                                    <span class="block text-xs font-semibold leading-4 truncate">
                                        {{ t(tab.labelKey) }}
                                    </span>
                                    <span
                                        class="block mt-0.5 text-[11px] leading-snug truncate"
                                        :class="
                                            activeTab === tab.id
                                                ? 'text-current opacity-75'
                                                : 'text-zinc-500'
                                        "
                                    >
                                        {{ t(tab.descKey) }}
                                    </span>
                                </span>
                            </span>
                            <Check
                                v-if="activeTab === tab.id"
                                class="h-3.5 w-3.5 shrink-0 text-current"
                            />
                        </button>
                    </div>
                </div>
            </div>
        </Transition>
    </div>

    <!-- 桌面端：分组垂直导航栏（带功能摘要与键盘方向键导航） -->
    <nav
        ref="desktopNavRef"
        role="tablist"
        aria-orientation="vertical"
        :aria-label="t('settings.navLabel')"
        data-testid="settings-desktop-tablist"
        class="hidden md:flex md:flex-col md:space-y-0.5"
    >
        <template v-for="(group, groupIndex) in tabGroups" :key="group.id">
            <p
                class="px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500"
                :class="
                    groupIndex > 0 ? 'mt-3.5 pt-3 border-t border-zinc-800/80' : 'pt-1'
                "
            >
                {{ t(group.labelKey) }}
            </p>
            <button
                v-for="tab in group.tabs"
                :key="tab.id"
                type="button"
                role="tab"
                :data-desktop-tab="tab.id"
                :aria-selected="activeTab === tab.id"
                :tabindex="activeTab === tab.id ? 0 : -1"
                class="group relative w-full flex items-start gap-2.5 px-2.5 py-2 text-left rounded-md border transition-colors"
                :class="
                    activeTab === tab.id
                        ? 'bg-zinc-100 text-zinc-900 border-zinc-100 shadow-none'
                        : 'text-zinc-300 border-transparent hover:bg-zinc-900 hover:text-zinc-100'
                "
                @click="selectTab(tab.id)"
                @keydown="handleDesktopKeydown($event, tab.id)"
            >
                <component
                    :is="tab.icon"
                    class="mt-0.5 h-4 w-4 shrink-0 transition-colors"
                    :class="
                        activeTab === tab.id
                            ? 'text-current'
                            : 'text-zinc-500 group-hover:text-zinc-300'
                    "
                />
                <span class="min-w-0 flex-1">
                    <span class="block text-xs font-semibold leading-4 truncate">
                        {{ t(tab.labelKey) }}
                    </span>
                    <span
                        class="block mt-0.5 text-[11px] leading-snug truncate"
                        :class="
                            activeTab === tab.id
                                ? 'text-current opacity-70'
                                : 'text-zinc-500 group-hover:text-zinc-400'
                        "
                    >
                        {{ t(tab.descKey) }}
                    </span>
                </span>
            </button>
        </template>
    </nav>
</template>
