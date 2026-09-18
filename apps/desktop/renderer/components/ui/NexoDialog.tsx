import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { motionTokens } from "../../design/motion";
import { registerModalLayer } from "./focus-trap";

type NexoDialogProps = {
  open: boolean;
  title: string;
  eyebrow?: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  closeLabel?: string;
};

export function NexoDialog({ open, title, eyebrow, onClose, children, className = "", closeLabel = "Fechar diálogo" }: NexoDialogProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const closeHandler = useRef(onClose);
  const reducedMotion = useReducedMotion();
  closeHandler.current = onClose;

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    if (!panel) return;
    const unregister = registerModalLayer(panel, () => closeHandler.current());
    closeRef.current?.focus();
    return () => {
      const wasTopLayer = unregister();
      const target = previousFocus.current;
      previousFocus.current = null;
      if (wasTopLayer && target?.isConnected) target.focus();
    };
  }, [open]);

  return createPortal(<AnimatePresence>
    {open && <motion.div className="nexoDialogOverlay" key="overlay" role="presentation"
      initial={reducedMotion ? false : { opacity: 0, backdropFilter: "blur(0px)" }} animate={{ opacity: 1, backdropFilter: `blur(${motionTokens.blur.backdrop}px)` }} exit={reducedMotion ? { opacity: 0 } : { opacity: 0, backdropFilter: "blur(0px)" }}
      transition={{ duration: reducedMotion ? 0 : motionTokens.duration.fast / 1000, ease: motionTokens.ease.out }}
      onMouseDown={event => { if (event.target === event.currentTarget) closeHandler.current(); }}>
      <motion.section ref={panelRef} className={`nexoDialogPanel ${className}`.trim()} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        initial={reducedMotion ? false : { opacity: 0, y: -motionTokens.distance.subtle, scale: motionTokens.scale.popover }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -2, scale: motionTokens.scale.popover }}
        transition={reducedMotion ? { duration: 0 } : motionTokens.spring.normal}>
        <header className="nexoDialogHeader"><div>{eyebrow && <small>{eyebrow}</small>}<h2 id={titleId}>{title}</h2></div><button ref={closeRef} type="button" onClick={() => closeHandler.current()} aria-label={closeLabel}><X size={18} aria-hidden="true" /></button></header>
        <div className="nexoDialogContent">{children}</div>
      </motion.section>
    </motion.div>}
  </AnimatePresence>, document.body);
}
