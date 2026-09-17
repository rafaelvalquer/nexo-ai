import { AlertCircle, Check, LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonState = "idle" | "loading" | "success" | "error";
type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "outline" | "danger";
  size?: "sm" | "md" | "lg" | "icon";
  state?: ButtonState;
  loading?: boolean;
  children: ReactNode;
};

export function Button({ variant = "secondary", size = "md", state = "idle", loading = false, className = "", children, disabled, ...props }: Props) {
  const currentState = loading ? "loading" : state;
  const StateIcon = currentState === "loading" ? LoaderCircle : currentState === "success" ? Check : currentState === "error" ? AlertCircle : undefined;
  return <button
    {...props}
    className={`uiButton ${variant} ${size} ${className}`.trim()}
    data-state={currentState}
    disabled={disabled || currentState === "loading"}
    aria-busy={currentState === "loading" || undefined}
  >
    {StateIcon && <StateIcon className={`uiButtonStateIcon ${currentState === "loading" ? "spinning" : ""}`} size={size === "sm" ? 14 : 16} aria-hidden="true" />}
    {children}
  </button>;
}
