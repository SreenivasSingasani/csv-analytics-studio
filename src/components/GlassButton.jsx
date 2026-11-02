import { forwardRef } from "react";

const GlassButton = forwardRef(function GlassButton({
  children, variant = "secondary", size = "md", className = "", ...props
}, ref) {
  return (
    <button ref={ref} className={`glass-button glass-button--${variant} glass-button--${size} ${className}`} {...props}>
      {children}
    </button>
  );
});

export default GlassButton;
