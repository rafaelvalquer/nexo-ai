import type { SelectHTMLAttributes } from "react";

export type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> & {
  variant?: "default" | "ghost";
  size?: "sm" | "md" | "lg";
  state?: "default" | "error";
};

/** Native select primitive: retains platform keyboard and screen-reader behavior. */
export function Select({ variant = "default", size = "md", state = "default", className = "", ...props }: SelectProps) {
  return (
    <select
      {...props}
      className={`uiSelect ${className}`.trim()}
      data-variant={variant}
      data-size={size}
      data-state={state}
    />
  );
}
