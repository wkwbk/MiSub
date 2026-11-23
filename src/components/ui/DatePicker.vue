<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { Calendar, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, X } from '@lucide/vue';
import { usePopoverGuard } from '@/composables/usePopoverGuard.js';
import { useI18n } from '@/i18n/index.js';

const { locale, t } = useI18n();

const props = defineProps({
  modelValue: {
    type: String,
    default: '',
  },
  placeholder: {
    type: String,
    default: '',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  clearable: {
    type: Boolean,
    default: true,
  },
  size: {
    type: String,
    default: 'md',
    validator: (value) => ['xs', 'sm', 'md', 'lg'].includes(value),
  },
  min: {
    type: String,
    default: '',
  },
  max: {
    type: String,
    default: '',
  },
  presets: {
    type: Array,
    default: () => [],
  },
  triggerClass: {
    type: String,
    default: '',
  },
  popoverClass: {
    type: String,
    default: '',
  },
  id: {
    type: String,
    default: undefined,
  },
  ariaLabel: {
    type: String,
    default: undefined,
  },
});

const emit = defineEmits(['update:modelValue', 'change']);

const isOpen = ref(false);
const viewMode = ref('days'); // 'days' | 'months' | 'years'
const triggerRef = ref(null);
const popoverRef = ref(null);
const placement = ref('bottom');
const popoverStyle = ref({});

const sizeClasses = {
  xs: 'h-7 px-2 text-xs rounded-md gap-1.5',
  sm: 'h-8 px-2.5 text-xs rounded-md gap-2',
  md: 'h-9 px-3 text-sm rounded-md gap-2',
  lg: 'h-10 px-3.5 text-sm rounded-md gap-2',
};

const currentSizeClass = computed(() => sizeClasses[props.size] || sizeClasses.md);

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad2 = (n) => String(n).padStart(2, '0');

const formatDateStr = (year, month, day) => `${year}-${pad2(month)}-${pad2(day)}`;

const parseDateStr = (value) => {
  if (!value || typeof value !== 'string') return null;
  const match = DATE_RE.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return { year, month, day };
};

const getTodayParts = () => {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  };
};

const todayStr = computed(() => {
  const { year, month, day } = getTodayParts();
  return formatDateStr(year, month, day);
});

const parsedValue = computed(() => parseDateStr(props.modelValue));
const initialParts = parsedValue.value || getTodayParts();
const viewYear = ref(initialParts.year);
const viewMonth = ref(initialParts.month); // 1 - 12

const isZh = computed(() => String(locale.value || '').startsWith('zh'));

const weekdayLabels = computed(() =>
  isZh.value ? ['一', '二', '三', '四', '五', '六', '日'] : ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
);

const monthLabels = computed(() =>
  isZh.value
    ? ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
    : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
);

const headerTitle = computed(() => {
  if (viewMode.value === 'years') {
    const start = yearGridStart.value;
    return `${start} - ${start + 11}`;
  }
  if (viewMode.value === 'months') {
    return isZh.value ? `${viewYear.value}年` : String(viewYear.value);
  }
  if (isZh.value) {
    return `${viewYear.value}年 ${viewMonth.value}月`;
  }
  return `${monthLabels.value[viewMonth.value - 1]} ${viewYear.value}`;
});

const yearGridStart = computed(() => Math.floor(viewYear.value / 12) * 12);

const yearGrid = computed(() => {
  const start = yearGridStart.value;
  return Array.from({ length: 12 }, (_, idx) => start + idx);
});

const isDateDisabled = (dateStr) => {
  if (props.min && dateStr < props.min) return true;
  if (props.max && dateStr > props.max) return true;
  return false;
};

const calendarDays = computed(() => {
  const year = viewYear.value;
  const month = viewMonth.value;
  const firstDayOfMonth = new Date(year, month - 1, 1);
  // Monday = 0 ... Sunday = 6
  const startOffset = (firstDayOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month, 0).getDate();
  const prevMonthDate = new Date(year, month - 1, 0);
  const daysInPrevMonth = prevMonthDate.getDate();
  const prevYear = prevMonthDate.getFullYear();
  const prevMonth = prevMonthDate.getMonth() + 1;

  const nextMonthDate = new Date(year, month, 1);
  const nextYear = nextMonthDate.getFullYear();
  const nextMonth = nextMonthDate.getMonth() + 1;

  const cells = [];

  for (let i = startOffset - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i;
    const value = formatDateStr(prevYear, prevMonth, day);
    cells.push({
      day,
      value,
      inCurrentMonth: false,
      isToday: value === todayStr.value,
      isSelected: value === props.modelValue,
      disabled: isDateDisabled(value),
    });
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const value = formatDateStr(year, month, day);
    cells.push({
      day,
      value,
      inCurrentMonth: true,
      isToday: value === todayStr.value,
      isSelected: value === props.modelValue,
      disabled: isDateDisabled(value),
    });
  }

  const remaining = 42 - cells.length;
  for (let day = 1; day <= remaining; day++) {
    const value = formatDateStr(nextYear, nextMonth, day);
    cells.push({
      day,
      value,
      inCurrentMonth: false,
      isToday: value === todayStr.value,
      isSelected: value === props.modelValue,
      disabled: isDateDisabled(value),
    });
  }

  return cells;
});

const displayPlaceholder = computed(() => props.placeholder || t('datePicker.placeholder'));
const hasValue = computed(() => Boolean(parsedValue.value));

const updatePosition = () => {
  if (!triggerRef.value) return;

  const rect = triggerRef.value.getBoundingClientRect();
  const gap = 6;
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;
  const popoverWidth = Math.min(280, viewportWidth - 16);
  const estimatedHeight = popoverRef.value?.offsetHeight || (props.presets.length > 0 ? 356 : 316);
  const spaceBelow = viewportHeight - rect.bottom;
  const spaceAbove = rect.top;

  const openUpward = spaceBelow < estimatedHeight + gap + 8 && spaceAbove > spaceBelow;
  placement.value = openUpward ? 'top' : 'bottom';

  const left = Math.min(Math.max(8, rect.left), Math.max(8, viewportWidth - popoverWidth - 8));
  const isInsideModal = Boolean(triggerRef.value.closest('[role="dialog"][aria-modal="true"]'));

  popoverStyle.value = {
    position: 'fixed',
    left: `${left}px`,
    width: `${popoverWidth}px`,
    zIndex: isInsideModal ? 'var(--z-modal-popover)' : 'var(--z-popover)',
    ...(openUpward ? { bottom: `${viewportHeight - rect.top + gap}px` } : { top: `${rect.bottom + gap}px` }),
  };
};

const syncViewToValue = () => {
  const target = parsedValue.value || getTodayParts();
  viewYear.value = target.year;
  viewMonth.value = target.month;
  viewMode.value = 'days';
};

const open = async () => {
  if (props.disabled || isOpen.value) return;
  syncViewToValue();
  isOpen.value = true;
  updatePosition();
  await nextTick();
  updatePosition();
};

const close = (restoreFocus = false) => {
  if (!isOpen.value) return;
  isOpen.value = false;
  viewMode.value = 'days';
  if (restoreFocus) {
    nextTick(() => triggerRef.value?.focus());
  }
};

const toggle = () => (isOpen.value ? close() : open());

const emitValue = (value, shouldClose = true) => {
  emit('update:modelValue', value);
  emit('change', value);
  if (shouldClose) {
    close(true);
  }
};

const selectDay = (cell) => {
  if (!cell || cell.disabled) return;
  emitValue(cell.value, true);
};

const selectToday = () => {
  if (isDateDisabled(todayStr.value)) return;
  emitValue(todayStr.value, true);
};

const clearValue = () => {
  if (props.disabled || !props.modelValue) return;
  emit('update:modelValue', '');
  emit('change', '');
  close(false);
};

const resolvePresetValue = (preset) => {
  if (!preset) return '';
  if (typeof preset.value === 'function') return preset.value();
  if (typeof preset.value === 'string') return preset.value;
  const now = new Date();
  if (typeof preset.days === 'number') {
    now.setDate(now.getDate() + preset.days);
  } else if (typeof preset.months === 'number') {
    now.setMonth(now.getMonth() + preset.months);
  } else if (typeof preset.years === 'number') {
    now.setFullYear(now.getFullYear() + preset.years);
  }
  return formatDateStr(now.getFullYear(), now.getMonth() + 1, now.getDate());
};

const selectPreset = (preset) => {
  const value = resolvePresetValue(preset);
  if (!value || isDateDisabled(value)) return;
  emitValue(value, true);
};

const shiftMonth = (delta) => {
  const next = new Date(viewYear.value, viewMonth.value - 1 + delta, 1);
  viewYear.value = next.getFullYear();
  viewMonth.value = next.getMonth() + 1;
};

const shiftYear = (delta) => {
  viewYear.value += delta;
};

const handlePrevPrimary = () => {
  if (viewMode.value === 'days') shiftMonth(-1);
  else if (viewMode.value === 'months') shiftYear(-1);
  else shiftYear(-12);
};

const handleNextPrimary = () => {
  if (viewMode.value === 'days') shiftMonth(1);
  else if (viewMode.value === 'months') shiftYear(1);
  else shiftYear(12);
};

const handleHeaderTitleClick = () => {
  if (viewMode.value === 'days') viewMode.value = 'months';
  else if (viewMode.value === 'months') viewMode.value = 'years';
};

const selectMonth = (monthIndex) => {
  viewMonth.value = monthIndex + 1;
  viewMode.value = 'days';
};

const selectYear = (year) => {
  viewYear.value = year;
  viewMode.value = 'months';
};

const handleTriggerKeydown = (event) => {
  if (props.disabled) return;
  if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
    event.preventDefault();
    if (!isOpen.value) open();
  } else if (event.key === 'Tab' && isOpen.value) {
    close();
  }
};

const handleDocumentPointerDown = (event) => {
  if (!isOpen.value) return;
  if (!triggerRef.value?.contains(event.target) && !popoverRef.value?.contains(event.target)) {
    close();
  }
};

const handleDocumentKeydown = (event) => {
  if (!isOpen.value || event.key !== 'Escape') return;
  event.preventDefault();
  event.stopPropagation();
  close(true);
};

const detachDocumentListeners = () => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
  document.removeEventListener('keydown', handleDocumentKeydown, true);
};

watch(isOpen, (val) => {
  if (val) {
    document.addEventListener('pointerdown', handleDocumentPointerDown, true);
    document.addEventListener('keydown', handleDocumentKeydown, true);
  } else {
    detachDocumentListeners();
  }
});

onBeforeUnmount(detachDocumentListeners);

usePopoverGuard({
  isOpen,
  popoverRef,
  onClose: () => close(),
  onReposition: updatePosition,
});

const getDayCellClasses = (cell) => {
  if (cell.disabled) {
    return 'cursor-not-allowed opacity-30 text-fg-subtle';
  }
  if (cell.isSelected) {
    return 'bg-accent text-accent-fg font-semibold shadow-xs';
  }
  if (cell.isToday) {
    return 'ring-1 ring-inset ring-line-strong text-fg font-semibold hover:bg-hover';
  }
  if (!cell.inCurrentMonth) {
    return 'text-fg-subtle/45 hover:bg-hover/60 hover:text-fg-muted';
  }
  return 'text-fg hover:bg-hover';
};
</script>

<template>
  <div class="relative w-full">
    <div
      :id="id"
      ref="triggerRef"
      :aria-disabled="disabled || undefined"
      :aria-expanded="isOpen"
      :aria-label="ariaLabel || displayPlaceholder"
      :class="[
        currentSizeClass,
        isOpen ? 'border-line-strong' : 'border-line hover:border-line-strong focus-visible:border-line-strong',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        triggerClass,
      ]"
      :tabindex="disabled ? -1 : 0"
      aria-haspopup="dialog"
      class="date-picker-trigger flex w-full items-center justify-between border bg-inset text-left text-fg shadow-none transition-colors duration-200 focus-visible:outline-none select-none"
      role="button"
      @click="toggle"
      @keydown="handleTriggerKeydown"
    >
      <span :class="hasValue ? 'font-mono text-fg tabular-nums' : 'text-fg-subtle'" class="min-w-0 flex-1 truncate">
        {{ hasValue ? modelValue : displayPlaceholder }}
      </span>

      <span class="flex items-center gap-1 shrink-0">
        <button
          v-if="clearable && hasValue && !disabled"
          :aria-label="t('datePicker.clear')"
          :title="t('datePicker.clear')"
          class="flex h-4 w-4 items-center justify-center rounded text-fg-subtle hover:bg-hover hover:text-fg transition-colors"
          type="button"
          @click.stop="clearValue"
        >
          <X class="h-3 w-3" />
        </button>
        <Calendar
          :class="isOpen ? 'text-fg' : 'text-fg-muted'"
          class="h-3.5 w-3.5 shrink-0 transition-colors duration-200"
        />
      </span>
    </div>

    <Teleport to="body">
      <Transition
        enter-active-class="transition duration-150 ease-out"
        enter-from-class="opacity-0 scale-95"
        enter-to-class="opacity-100 scale-100"
        leave-active-class="transition duration-100 ease-in"
        leave-from-class="opacity-100 scale-100"
        leave-to-class="opacity-0 scale-95"
      >
        <div
          v-if="isOpen"
          ref="popoverRef"
          :aria-label="ariaLabel || t('datePicker.dialogLabel')"
          :class="[placement === 'top' ? 'origin-bottom' : 'origin-top', popoverClass]"
          :style="popoverStyle"
          class="popover-surface date-picker-popover rounded-lg p-3 select-none"
          role="dialog"
        >
          <!-- Header -->
          <div class="mb-2.5 flex items-center justify-between gap-1">
            <div class="flex items-center gap-0.5">
              <button
                v-if="viewMode === 'days'"
                :aria-label="t('datePicker.prevYear')"
                class="flex h-7 w-7 items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-fg transition-colors"
                type="button"
                @click="shiftYear(-1)"
              >
                <ChevronsLeft class="h-3.5 w-3.5" />
              </button>
              <button
                :aria-label="viewMode === 'days' ? t('datePicker.prevMonth') : t('datePicker.prevYear')"
                class="flex h-7 w-7 items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-fg transition-colors"
                type="button"
                @click="handlePrevPrimary"
              >
                <ChevronLeft class="h-3.5 w-3.5" />
              </button>
            </div>

            <button
              :class="viewMode === 'years' ? 'cursor-default' : 'hover:bg-hover cursor-pointer'"
              class="rounded-md px-2 py-1 text-xs font-semibold text-fg transition-colors tabular-nums"
              type="button"
              @click="handleHeaderTitleClick"
            >
              {{ headerTitle }}
            </button>

            <div class="flex items-center gap-0.5">
              <button
                :aria-label="viewMode === 'days' ? t('datePicker.nextMonth') : t('datePicker.nextYear')"
                class="flex h-7 w-7 items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-fg transition-colors"
                type="button"
                @click="handleNextPrimary"
              >
                <ChevronRight class="h-3.5 w-3.5" />
              </button>
              <button
                v-if="viewMode === 'days'"
                :aria-label="t('datePicker.nextYear')"
                class="flex h-7 w-7 items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-fg transition-colors"
                type="button"
                @click="shiftYear(1)"
              >
                <ChevronsRight class="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <!-- Days View -->
          <template v-if="viewMode === 'days'">
            <div class="mb-1 grid grid-cols-7 text-center">
              <span v-for="dayName in weekdayLabels" :key="dayName" class="py-1 text-[11px] font-medium text-fg-subtle">
                {{ dayName }}
              </span>
            </div>

            <div class="grid grid-cols-7 gap-0.5">
              <button
                v-for="cell in calendarDays"
                :key="cell.value"
                :aria-current="cell.isToday ? 'date' : undefined"
                :aria-pressed="cell.isSelected"
                :class="getDayCellClasses(cell)"
                :data-date="cell.value"
                :disabled="cell.disabled"
                class="flex h-8 w-full items-center justify-center rounded-md text-xs tabular-nums transition-colors duration-100"
                type="button"
                @click="selectDay(cell)"
              >
                {{ cell.day }}
              </button>
            </div>
          </template>

          <!-- Months View -->
          <div v-else-if="viewMode === 'months'" class="grid grid-cols-3 gap-1.5 py-1">
            <button
              v-for="(label, idx) in monthLabels"
              :key="idx"
              :class="[
                parsedValue && parsedValue.year === viewYear && parsedValue.month === idx + 1
                  ? 'bg-accent text-accent-fg font-semibold'
                  : viewMonth === idx + 1
                    ? 'ring-1 ring-inset ring-line-strong text-fg font-medium hover:bg-hover'
                    : 'text-fg-muted hover:bg-hover hover:text-fg',
              ]"
              class="flex h-9 items-center justify-center rounded-md text-xs transition-colors"
              type="button"
              @click="selectMonth(idx)"
            >
              {{ label }}
            </button>
          </div>

          <!-- Years View -->
          <div v-else class="grid grid-cols-3 gap-1.5 py-1">
            <button
              v-for="year in yearGrid"
              :key="year"
              :class="[
                parsedValue && parsedValue.year === year
                  ? 'bg-accent text-accent-fg font-semibold'
                  : viewYear === year
                    ? 'ring-1 ring-inset ring-line-strong text-fg font-medium hover:bg-hover'
                    : 'text-fg-muted hover:bg-hover hover:text-fg',
              ]"
              class="flex h-9 items-center justify-center rounded-md text-xs tabular-nums transition-colors"
              type="button"
              @click="selectYear(year)"
            >
              {{ year }}
            </button>
          </div>

          <!-- Optional Quick Presets -->
          <div
            v-if="presets.length > 0 && viewMode === 'days'"
            class="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-line-subtle pt-2.5"
          >
            <button
              v-for="(preset, idx) in presets"
              :key="idx"
              class="rounded-md border border-line-subtle bg-hover/50 px-2 py-1 text-[11px] font-medium text-fg-muted hover:border-line hover:bg-active hover:text-fg transition-colors"
              type="button"
              @click="selectPreset(preset)"
            >
              {{ preset.label }}
            </button>
          </div>

          <!-- Footer -->
          <div class="mt-2.5 flex items-center justify-between border-t border-line-subtle pt-2">
            <button
              v-if="clearable"
              :disabled="!hasValue"
              class="rounded-md px-2 py-1 text-xs font-medium text-fg-muted hover:bg-hover hover:text-fg disabled:cursor-not-allowed disabled:opacity-35 transition-colors"
              type="button"
              @click="clearValue"
            >
              {{ t('datePicker.clear') }}
            </button>
            <span v-else />

            <button
              :disabled="isDateDisabled(todayStr)"
              class="rounded-md px-2 py-1 text-xs font-medium text-fg hover:bg-hover disabled:cursor-not-allowed disabled:opacity-35 transition-colors"
              type="button"
              @click="selectToday"
            >
              {{ t('datePicker.today') }}
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style>
.date-picker-trigger {
  box-shadow: none !important;
}
.date-picker-popover,
.date-picker-popover:hover {
  background-color: var(--surface-popover);
  border: 1px solid var(--border-popover);
  box-shadow: var(--shadow-popover);
}
</style>
