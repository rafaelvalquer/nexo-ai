import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motionTokens } from "../../design/motion";
import { registerModalLayer } from "./focus-trap";

type NexoDrawerProps = {
  open: boolean;
  title: string;
  eyebrow?: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  side?: "left" | "right";
  closeLabel?: string;
};

export function NexoDrawer({ open, title, eyebrow, onClose, children, className = "", side = "right", closeLabel = "Fechar painel" }: NexoDrawerProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const closeHandler = useRef(onClose);
  const reducedMotion = useReducedMotion();
  closeHandler.current = onClose;

  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    if (!panel) return;
    const unregister = registerModalLayer(panel, () => closeHandler.current());
    closeRef.current?.focus();
    return () => {
      const wasTopLayer = unregister();
      const previouslyFocused = previouslyFocusedRef.current;
      previouslyFocusedRef.current = null;
      if (wasTopLayer && previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [open]);

  const transition = reducedMotion ? { duration: 0 } : motionTokens.spring.normal;
  return createPortal(<AnimatePresence>
    {open && <motion.div className="nexoDrawerOverlay" role="presentation" key="overlay"
      initial={reducedMotion ? false : { opacity: 0, backdropFilter: "blur(0px)" }} animate={{ opacity: 1, backdropFilter: `blur(${motionTokens.blur.backdrop}px)` }} exit={reducedMotion ? { opacity: 0 } : { opacity: 0, backdropFilter: "blur(0px)" }} transition={{ duration: reducedMotion ? 0 : motionTokens.duration.fast / 1000, ease: motionTokens.ease.out }}
      onMouseDown={event => { if (event.target === event.currentTarget) closeHandler.current(); }}>
      <motion.aside ref={panelRef} className={`nexoDrawerPanel nexoDrawerPanel-${side} ${className}`.trim()} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        initial={reducedMotion ? false : { opacity: 0, x: side === "right" ? motionTokens.distance.panel : -motionTokens.distance.panel }}
        animate={{ opacity: 1, x: 0 }} exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: side === "right" ? motionTokens.distance.panel : -motionTokens.distance.panel }} transition={transition}>
        <header className="nexoDrawerHeader">
          <div>{eyebrow && <small>{eyebrow}</small>}<h2 id={titleId}>{title}</h2></div>
          <button ref={closeRef} type="button" onClick={() => closeHandler.current()} aria-label={closeLabel}><X size={18} aria-hidden="true" /></button>
        </header>
        <div className="nexoDrawerContent">{children}</div>
      </motion.aside>
    </motion.div>}
  </AnimatePresence>, document.body);
}
