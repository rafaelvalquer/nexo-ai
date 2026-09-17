import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { motionTokens } from "../../design/motion";

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
  const closeHandler = useRef(onClose);
  const reducedMotion = useReducedMotion();
  closeHandler.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        closeHandler.current();
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>("a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])")]
        .filter(element => !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true");
      if (!focusable.length) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [open]);

  const transition = reducedMotion ? { duration: 0 } : motionTokens.spring.normal;
  return <AnimatePresence>
    {open && <motion.div className="nexoDrawerOverlay" role="presentation" key="overlay"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reducedMotion ? 0 : 0.16 }}
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
  </AnimatePresence>;
}
