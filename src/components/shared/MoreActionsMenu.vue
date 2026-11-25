<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue';
import type { CSSProperties } from 'vue';
import { MoreHorizontal } from '@lucide/vue';
import { usePopoverGuard } from '@/composables/usePopoverGuard.js';
import { t } from '@/i18n/index.js';

const props = withDefaults(
  defineProps<{
    teleportToBody?: boolean;
    menuWidthClass?: string;
  }>(),
  {
    teleportToBody: true,
    menuWidthClass: 'w-36',
  },
);

const isOpen = ref(false);
const triggerRef = ref<HTMLDivElement | null>(null);
const menuRef = ref<HTMLDivElement | null>(null);
const menuStyle = ref<CSSProperties>({});
const menuId = `more-actions-menu-${Math.random().toString(36).slice(2, 10)}`;

const FOCUSABLE = ['button:not([disabled])', 'a[href]', '[tabindex]:not([tabindex="-1"])'].join(', ');

function updatePosition() {
  if (!props.teleportToBody || !triggerRef.value) {
    menuStyle.value = {};
    return;
  }

  const buttonRect = triggerRef.value.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const viewportPadding = 8;
  const gap = 8;

  const menuWidth = menuRef.value?.offsetWidth || 144;
  const menuHeight = menuRef.value?.offsetHeight || 200;

  const spaceBelow = viewportHeight - buttonRect.bottom - viewportPadding;
  const spaceAbove = buttonRect.top - viewportPadding;
  const openUpward = spaceBelow < menuHeight + gap && spaceAbove > spaceBelow;

  const idealLeft = buttonRect.right - menuWidth;
  const maxLeft = Math.max(viewportPadding, viewportWidth - menuWidth - viewportPadding);
  const left = Math.min(Math.max(viewportPadding, idealLeft), maxLeft);

  const isInsideModal = Boolean(triggerRef.value.closest('[role="dialog"][aria-modal="true"]'));

  const availableHeight = openUpward ? Math.max(80, spaceAbove - gap) : Math.max(80, spaceBelow - gap);

  menuStyle.value = {
    left: `${left}px`,
    maxHeight: `${availableHeight}px`,
    zIndex: isInsideModal ? 'var(--z-modal-popover)' : 'var(--z-popover)',
    ...(openUpward
      ? { bottom: `${viewportHeight - buttonRect.top + gap}px` }
      : { top: `${buttonRect.bottom + gap}px` }),
  };
}

function getFocusableItems(): HTMLElement[] {
  return menuRef.value ? Array.from(menuRef.value.querySelectorAll<HTMLElement>(FOCUSABLE)) : [];
}

async function openMenu() {
  isOpen.value = true;
  await nextTick();
  updatePosition();
  const [firstItem] = getFocusableItems();
  firstItem?.focus();
}

function toggleMenu() {
  if (isOpen.value) {
    closeMenu({ restoreFocus: true });
  } else {
    openMenu();
  }
}

function closeMenu(options: { restoreFocus?: boolean } = {}) {
  const { restoreFocus = false } = options;
  isOpen.value = false;
  if (restoreFocus) {
    triggerRef.value?.querySelector('button')?.focus();
  }
}

function handleClickOutside(event: MouseEvent) {
  const target = event.target as Node | null;
  const isClickInTrigger = triggerRef.value && triggerRef.value.contains(target);
  const isClickInMenu = menuRef.value && menuRef.value.contains(target);

  if (!isClickInTrigger && !isClickInMenu) {
    closeMenu();
  }
}

function handleTriggerKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    toggleMenu();
    return;
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    if (!isOpen.value) {
      openMenu();
      return;
    }

    const [firstItem] = getFocusableItems();
    firstItem?.focus();
  }
}

function handleMenuKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeMenu({ restoreFocus: true });
  }
}

usePopoverGuard({
  isOpen,
  popoverRef: menuRef,
  onClose: () => closeMenu(),
  onReposition: updatePosition,
});

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});
</script>

<template>
  <div ref="triggerRef" class="relative shrink-0">
    <button
      :aria-controls="menuId"
      :aria-expanded="isOpen"
      :aria-label="t('actions.bulkActions')"
      aria-haspopup="menu"
      class="group p-2 rounded-md border border-line bg-transparent text-fg-muted hover:text-fg hover:bg-hover hover:border-line-strong transition-colors"
      @click="toggleMenu"
      @keydown="handleTriggerKeydown"
    >
      <MoreHorizontal class="h-4 w-4" />
    </button>

    <Transition name="slide-fade-sm">
      <div
        v-if="!teleportToBody && isOpen"
        :id="menuId"
        ref="menuRef"
        :class="['popover-surface absolute right-0 mt-2 p-1 rounded-md z-10', menuWidthClass]"
        role="menu"
        @keydown="handleMenuKeydown"
      >
        <slot :close="closeMenu" name="menu" />
      </div>
    </Transition>

    <Teleport v-if="teleportToBody" to="body">
      <Transition name="slide-fade-sm">
        <div
          v-if="isOpen"
          :id="menuId"
          ref="menuRef"
          :class="['popover-surface fixed overflow-y-auto p-1 rounded-md', menuWidthClass]"
          :style="menuStyle"
          role="menu"
          @keydown="handleMenuKeydown"
          @click.stop
        >
          <slot :close="closeMenu" name="menu" />
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.slide-fade-sm-enter-active,
.slide-fade-sm-leave-active {
  transition:
    transform 0.2s ease-out,
    opacity 0.2s ease-out;
}

.slide-fade-sm-enter-from,
.slide-fade-sm-leave-to {
  transform: translateY(-10px);
  opacity: 0;
}
</style>
