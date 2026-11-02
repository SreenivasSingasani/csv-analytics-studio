import { CheckCircle2, Info, AlertTriangle, X } from "lucide-react";

const icons = { success: CheckCircle2, info: Info, warning: AlertTriangle };
export default function GlassToast({ type = "info", message, onClose }) {
  const Icon = icons[type] || Info;
  return (
    <div className={`glass-toast glass-toast--${type}`} role="status" aria-live="polite">
      <Icon size={17}/>
      <span>{message}</span>
      {onClose && <button className="glass-toast__close" onClick={onClose} aria-label="Dismiss"><X size={15}/></button>}
    </div>
  );
}
