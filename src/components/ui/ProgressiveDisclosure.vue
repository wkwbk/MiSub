<script setup>
    import { ref, computed } from 'vue';
    import { ChevronDown } from 'lucide-vue-next';
    import { useI18n } from '../../i18n/index.js';

    const { t } = useI18n();

    const props = defineProps({
        title: {
            type: String,
            required: true,
        },
        summary: {
            type: String,
            default: '',
        },
        expanded: {
            type: Boolean,
            default: false,
        },
        collapsible: {
            type: Boolean,
            default: true,
        },
        level: {
            type: Number,
            default: 1,
            validator: (value) => value >= 1 && value <= 3,
        },
    });

    const emit = defineEmits(['toggle']);

    const isExpanded = ref(props.expanded);

    const toggleExpanded = () => {
        if (props.collapsible) {
            isExpanded.value = !isExpanded.value;
            emit('toggle', isExpanded.value);
        }
    };

    const levelClasses = computed(() => {
        const levels = {
            1: {
                title: 'text-base font-semibold text-zinc-900 dark:text-zinc-100',
                container:
                    'bg-white dark:bg-[#171717] border border-zinc-200 dark:border-zinc-800 rounded-md shadow-none',
                padding: 'p-5',
            },
            2: {
                title: 'text-sm font-semibold text-zinc-800 dark:text-zinc-200',
                container: 'bg-zinc-50 dark:bg-[#131515] border border-zinc-200 dark:border-zinc-800 rounded-md shadow-none',
                padding: 'p-4',
            },
            3: {
                title: 'text-xs font-medium text-zinc-700 dark:text-zinc-300',
                container: 'bg-transparent border border-zinc-200 dark:border-zinc-800 rounded-md shadow-none',
                padding: 'p-3',
            },
        };
        return levels[props.level];
    });
</script>

<template>
    <div
        :class="[
            levelClasses.container,
            levelClasses.padding,
            'transition-colors',
        ]"
    >
        <!-- 标题和摘要 -->
        <div
            class="flex items-center justify-between cursor-pointer"
            :class="{ 'mb-4': isExpanded }"
            @click="toggleExpanded"
        >
            <div class="flex-1 min-w-0">
                <h3 :class="levelClasses.title" class="truncate">
                    {{ title }}
                </h3>
                <p v-if="summary" class="text-xs text-zinc-500 mt-1 truncate">
                    {{ summary }}
                </p>
            </div>

            <!-- 展开/收起图标 -->
            <button
                v-if="collapsible"
                class="ml-4 p-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors touch-target"
                :aria-label="t('common.toggleExpand')"
            >
                <ChevronDown
                    class="w-4 h-4 text-zinc-500 transition-transform"
                    :class="{ 'rotate-180': isExpanded }"
                />
            </button>
        </div>

        <!-- 详细内容 -->
        <Transition
            name="disclosure"
            enter-active-class="transition-all duration-300 ease-out"
            leave-active-class="transition-all duration-200 ease-in"
            enter-from-class="opacity-0 -translate-y-2"
            enter-to-class="opacity-100 translate-y-0"
            leave-from-class="opacity-100 translate-y-0"
            leave-to-class="opacity-0 -translate-y-2"
        >
            <div v-if="isExpanded" class="space-y-4">
                <slot name="content" />

                <!-- 操作区域 -->
                <div
                    v-if="$slots.actions"
                    class="pt-4 border-t border-zinc-200 dark:border-zinc-800"
                >
                    <slot name="actions" />
                </div>
            </div>
        </Transition>
    </div>
</template>
