import React, { useEffect, useRef } from 'react';
import { Dialog as NdlDialog } from '@neo4j-ndl/react';

type DialogProps = React.ComponentProps<typeof NdlDialog>;

/**
 * The design system's dialog, which also closes on a click on its backdrop (NDL's ignores those
 * clicks, and its handlers can't be replaced through props). As in NDL's modal, the press and the
 * release must both be on the backdrop, so selecting text in the dialog and letting go outside it
 * doesn't close it. Dialogs without onClose (a decision is needed) stay open.
 */
const BackdropClosingDialog = ({ isOpen, onClose, ref, ...props }: DialogProps) => {
  const dialog = useRef<HTMLDivElement | null>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const closable = Boolean(onClose);

  useEffect(() => {
    // The dialog's parent is NDL's full-window root, the part of it that shows as the backdrop.
    const root = dialog.current?.parentElement;
    if (!isOpen || !closable || !root) {
      return;
    }
    let pressedOnBackdrop = false;
    const onMouseDown = (event: MouseEvent) => {
      pressedOnBackdrop = event.target === root;
    };
    const onClick = (event: MouseEvent) => {
      if (pressedOnBackdrop && event.target === root) {
        close.current?.(event as unknown as React.MouseEvent<HTMLElement>);
      }
      pressedOnBackdrop = false;
    };
    root.addEventListener('mousedown', onMouseDown);
    root.addEventListener('click', onClick);
    return () => {
      root.removeEventListener('mousedown', onMouseDown);
      root.removeEventListener('click', onClick);
    };
  }, [isOpen, closable]);

  const setRef = (element: HTMLDivElement | null) => {
    dialog.current = element;
    if (typeof ref === 'function') {
      ref(element);
    } else if (ref) {
      ref.current = element;
    }
  };
  return <NdlDialog isOpen={isOpen} onClose={onClose} ref={setRef} {...props} />;
};

/** Use instead of NDL's Dialog (enforced by lint); Dialog.Header, .Content, .Actions etc. are NDL's. */
export const Dialog = Object.assign(BackdropClosingDialog, NdlDialog);
