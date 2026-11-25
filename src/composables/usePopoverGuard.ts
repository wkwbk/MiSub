import { onBeforeUnmount, watch, type Ref } from 'vue';

export interface UsePopoverGuardOptions {
  isOpen: Ref<boolean>;
  popoverRef: Ref<HTMLElement | null>;
  onClose: () => void;
  onReposition?: () => void;
}

export function usePopoverGuard({ isOpen, popoverRef, onClose, onReposition }: UsePopoverGuardOptions): void {
  let rafId: number | null = null;

  const handleScroll = (event: Event): void => {
    if (!isOpen.value) return;
    // 下拉面板内部列表滚动不关闭，外部页面或容器一滚动立即关闭
    if (event.target instanceof Node && popoverRef.value?.contains(event.target)) return;
    onClose();
  };

  const handleResize = (): void => {
    if (!isOpen.value || !onReposition) return;
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      if (isOpen.value) {
        onReposition();
      }
    });
  };

  const detach = (): void => {
    window.removeEventListener('scroll', handleScroll, true);
    window.removeEventListener('resize', handleResize);
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  watch(isOpen, (val) => {
    if (val) {
      window.addEventListener('scroll', handleScroll, true);
      window.addEventListener('resize', handleResize);
    } else {
      detach();
    }
  });

  onBeforeUnmount(detach);
}
