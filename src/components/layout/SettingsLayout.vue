<script setup>
    // SettingsLayout.vue
    // 统一的设置界面布局容器，供页面视图和悬浮模态框复用
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
        class="h-full w-full bg-[#171717] md:shadow-[0_0_13px_rgba(0,0,0,0.11)] md:dark:shadow-[0_0_15px_rgba(0,0,0,0.45)] md:rounded-md md:border border-zinc-800 flex flex-col md:flex-row relative"
    >
        <!-- Sidebar -->
        <aside
            class="md:w-56 shrink-0 border-b md:border-b-0 md:border-r border-zinc-800 p-2 md:p-3"
        >
            <div
                class="md:sticky md:overflow-y-auto"
                :class="
                    inModal
                        ? 'md:top-3 md:max-h-[calc(85vh-160px)]'
                        : 'md:top-[72px] md:max-h-[calc(100vh-96px)]'
                "
            >
                <slot name="sidebar"></slot>
            </div>
        </aside>

        <!-- Main Content Area -->
        <main class="flex-1 flex flex-col min-w-0 min-h-[520px] relative">
            <!-- Scrollable Content -->
            <div class="flex-1 p-5 md:p-8">
                <slot></slot>
            </div>

            <!-- Sticky Footer Area -->
            <div
                v-if="!hideFooter"
                class="shrink-0 px-4 md:px-6 py-3 bg-[#131515]/95 border-t border-zinc-800 flex justify-end sticky bottom-0 z-10 backdrop-blur-sm md:rounded-br-md md:rounded-bl-none"
            >
                <slot name="footer"></slot>
            </div>
        </main>
    </div>
</template>

<style scoped>
    /* Any layout specific styles can go here, relying mostly on utility classes above */
</style>
