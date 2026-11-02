import { useEffect } from "react";
import { X } from "lucide-react";

export default function GlassDialog({ open, title, description, onClose, children, footer }) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event) => { if (event.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="glass-dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <section className="glass-dialog" role="dialog" aria-modal="true" aria-labelledby="glass-dialog-title">
        <button className="icon-button glass-dialog__close" onClick={onClose} aria-label="Close dialog"><X size={17}/></button>
        <h2 id="glass-dialog-title">{title}</h2>
        {description && <p className="glass-dialog__description">{description}</p>}
        <div className="glass-dialog__body">{children}</div>
        {footer && <div className="glass-dialog__footer">{footer}</div>}
      </section>
    </div>
  );
}
