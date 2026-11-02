export default function GlassInput({
  label, hint, error, id, className = "", ...props
}) {
  const inputId = id || props.name;
  return (
    <div className={`glass-field ${className}`}>
      {label && <label className="glass-field__label" htmlFor={inputId}>{label}</label>}
      <input id={inputId} className={`glass-input ${error ? "is-invalid" : ""}`} aria-invalid={Boolean(error)} aria-describedby={hint || error ? `${inputId}-message` : undefined} {...props} />
      {(hint || error) && <small id={`${inputId}-message`} className={`glass-field__message ${error ? "is-error" : ""}`}>{error || hint}</small>}
    </div>
  );
}
