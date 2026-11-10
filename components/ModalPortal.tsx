import { createPortal } from 'react-dom';
import { Children, ReactNode, useLayoutEffect, useRef } from 'react';
import { useSurfacePresence } from './motion';

interface ModalPortalProps {
  children: ReactNode;
  motion?: boolean;
}

// Portal that renders modals directly to document.body
// This bypasses any transform or overflow constraints from parent elements
const ModalPortal = ({ children, motion = true }: ModalPortalProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const open = Children.toArray(children).length > 0;
  const last = useRef(children);
  if (open) last.current = children;
  // Capture before the portal commits: a child autoFocus has already run by
  // the time layout effects execute.
  const focusOrigin = typeof document === 'undefined' ? null : document.activeElement;
  const restoreFocus = useRef<(() => void) | null>(null);
  const present = useSurfacePresence(open, ref, 'modal');
  useLayoutEffect(() => {
    if (!open || !motion) {
      restoreFocus.current?.();
      restoreFocus.current = null;
      return;
    }
    const node = ref.current;
    if (!node || !(focusOrigin instanceof HTMLElement) || node.contains(focusOrigin)) return;
    restoreFocus.current = () => {
      const active = document.activeElement;
      if (focusOrigin.isConnected && !focusOrigin.closest('[inert]') &&
        (active === document.body || node.contains(active))) {
        focusOrigin.focus({preventScroll:true});
      }
    };
  }, [open, motion]);
  useLayoutEffect(() => () => restoreFocus.current?.(), []);
  if (typeof document === 'undefined') return null;
  if (!motion) return createPortal(children, document.body);
  return present ? createPortal(<div ref={ref} className="hk-modal-presence"
    data-exiting={!open} inert={!open} aria-hidden={!open || undefined}>
    {open ? children : last.current}
  </div>, document.body) : null;
};

export default ModalPortal;
