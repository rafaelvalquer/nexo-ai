import type { ReactNode } from "react";

type SwitchProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
};

/** Accessible, controlled switch built on the native checkbox interaction model. */
export function Switch({ checked, onCheckedChange, children, disabled = false, className = "" }: SwitchProps) {
  return (
    <label className={`uiSwitchField ${className}`.trim()}>
      <input
        className="uiSwitchInput"
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onCheckedChange(event.currentTarget.checked)}
      />
      <span className="uiSwitchTrack" aria-hidden="true"><span className="uiSwitchThumb" /></span>
      <span className="uiSwitchLabel">{children}</span>
    </label>
  );
}
