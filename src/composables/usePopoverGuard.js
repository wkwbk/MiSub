import { onBeforeUnmount, watch } from 'vue';

export function isTriggerObscured(triggerEl) {
    if (!triggerEl) return true;
    const rect = triggerEl.getBoundingClientRect();
    if (rect.bottom <= 0 || rect.top >= window.innerHeight) {
        return true;
    }

    const isInsideModal = Boolean(triggerEl.closest('[role="dialog"][aria-modal="true"]'));
    if (!isInsideModal) {
        const navBars = document.querySelectorAll('.app-nav-bar');
        for (const nav of navBars) {
            const navRect = nav.getBoundingClientRect();
            if (navRect.height > 0 && navRect.bottom > 0 && rect.top < navRect.bottom - 2) {
                return true;
            }
        }
    }

    return false;
}

export function usePopoverGuard({ isOpen, triggerRef, popoverRef, onObscured, onReposition }) {
    let rafId = null;

    const handleViewportChange = (event) => {
        if (!isOpen.value) return;
        if (event?.type === 'scroll' && popoverRef.value?.contains(event.target)) {
            return;
        }
        if (rafId !== null) return;
        rafId = requestAnimationFrame(() => {
            rafId = null;
            if (!isOpen.value) return;
            if (isTriggerObscured(triggerRef.value)) {
                onObscured();
                return;
            }
            onReposition?.();
        });
    };

    const detach = () => {
        window.removeEventListener('scroll', handleViewportChange, true);
        window.removeEventListener('resize', handleViewportChange);
        if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
    };

    watch(isOpen, (val) => {
        if (val) {
            window.addEventListener('scroll', handleViewportChange, true);
            window.addEventListener('resize', handleViewportChange);
        } else {
            detach();
        }
    });

    onBeforeUnmount(detach);
}

