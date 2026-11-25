export function useBackdropDismiss(
  onDismiss: (event: MouseEvent) => void,
  canDismiss: () => boolean = () => true,
) {
  let pointerDownStartedOnBackdrop = false;

  const handleBackdropPointerDown = (event: PointerEvent | MouseEvent): void => {
    pointerDownStartedOnBackdrop = event.target === event.currentTarget;
  };

  const handleBackdropClick = (event: MouseEvent): void => {
    const shouldDismiss = pointerDownStartedOnBackdrop && event.target === event.currentTarget;
    pointerDownStartedOnBackdrop = false;

    if (shouldDismiss && canDismiss()) {
      onDismiss(event);
    }
  };

  return {
    handleBackdropPointerDown,
    handleBackdropClick,
  };
}
