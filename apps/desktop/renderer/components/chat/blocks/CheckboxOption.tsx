import type { ClarificationOption } from "@nexo/shared";

export function CheckboxOption({ option, checked, disabled, onChange }: {
  option: ClarificationOption;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return <label className={`clarificationCheckbox${checked ? " selected" : ""}`}>
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={event => onChange(event.currentTarget.checked)}
    />
    <span>{option.label}</span>
    {option.description ? <small>{option.description}</small> : null}
  </label>;
}
