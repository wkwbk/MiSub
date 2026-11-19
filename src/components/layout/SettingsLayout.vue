<script setup>
    // SettingsLayout.vue
    // 统一的设置界面布局容器，供独立设置页与悬浮模态框复用：
    // - 独立页面：桌面端采用分栏吸顶侧边栏卡片 + 主内容卡片流；移动端采用顶部吸顶单行导航栏 + 避让底部主导航的悬浮保存栏
    // - 悬浮模态框：适配弹窗内滚动容器的紧凑分栏布局
    defineProps({
        hideFooter: {
            type: Boolean,
            default: false,
        },
        inModal: {
            type: Boolean,
            default: false,
        },
    });
</script>

<template>
    <div
        :class="
            inModal
                ? 'h-full w-full flex flex-col md:flex-row relative'
                : 'w-full flex flex-col md:flex-row md:items-start md:gap-4 relative'
        "
    >
        <!-- Sidebar / Mobile Sticky Top Bar -->
        <aside
            :class="
                inModal
                    ? 'sticky top-0 z-20 px-3 py-2 bg-elevated/95 backdrop-blur-md border-b border-line md:static md:w-60 lg:w-64 shrink-0 md:border-b-0 md:border-r md:p-3 md:bg-transparent md:backdrop-blur-none'
                    : 'sticky top-14 z-30 will-change-transform -mx-4 sm:-mx-6 px-4 sm:px-6 py-2 bg-canvas border-b border-line mb-4 md:mx-0 md:mb-0 md:w-64 lg:w-68 shrink-0 md:top-20 md:z-20 md:rounded-lg md:border md:border-line md:bg-surface md:p-2.5 md:shadow-[var(--shadow-card)]'
            "
        >
            <div
                class="no-scrollbar"
                :class="
                    inModal
                        ? 'md:sticky md:top-3 md:max-h-[calc(85vh-160px)] md:overflow-y-auto'
                        : 'md:max-h-[calc(100vh-6.5rem)] md:overflow-y-auto'
                "
            >
                <slot name="sidebar"></slot>
            </div>
        </aside>

        <!-- Main Content Area -->
        <main
            class="flex-1 flex flex-col min-w-0 w-full relative"
            :class="inModal ? 'min-h-[480px]' : ''"
        >
            <!-- Content -->
            <div class="flex-1" :class="inModal ? 'p-4 md:p-6' : '[contain:layout_style]'">
                <slot></slot>
            </div>

            <!-- Sticky / Floating Footer Area -->
            <!-- 独立设置页使用 Teleport 挂载到 body，避免路由过渡动画（route-fade）的 transform 临时接管 fixed 定位基准导致按钮位置跳动 -->
            <Teleport to="body" :disabled="inModal">
                <div
                    v-if="!hideFooter"
                    data-testid="settings-footer"
                    :class="
                        inModal
                            ? 'modal-chrome-footer shrink-0 px-4 md:px-6 py-3 flex items-center justify-end gap-3 sticky bottom-0 z-10 backdrop-blur-sm'
                            : 'fixed inset-x-4 bottom-24 sm:inset-x-auto sm:right-4 md:bottom-8 md:right-8 z-50 will-change-transform flex items-center justify-end gap-2 pointer-events-none'
                    "
                >
                    <slot name="footer"></slot>
                </div>
            </Teleport>
        </main>
    </div>
</template>
