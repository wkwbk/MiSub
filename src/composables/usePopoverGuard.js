import { onBeforeUnmount, watch } from 'vue';

export function usePopoverGuard({ isOpen, popoverRef, onClose, onReposition }) {
    let rafId = null;

    const handleScroll = (event) => {
        if (!isOpen.value) return;
        // 下拉面板内部列表滚动不关闭，外部页面或容器一滚动立即关闭
        if (popoverRef.value?.contains(event.target)) return;
        onClose();
    };

    const handleResize = () => {
        if (!isOpen.value || !onReposition) return;
        if (rafId !== null) return;
        rafId = requestAnimationFrame(() => {
            rafId = null;
            if (isOpen.value) {
                onReposition();
            }
        });
    };

    const detach = () => {
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
