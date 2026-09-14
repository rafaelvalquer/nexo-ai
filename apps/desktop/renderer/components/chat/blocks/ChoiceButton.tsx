import type { ClarificationOption } from "@nexo/shared";

export function ChoiceButton({ option, selected, disabled, onSelect }: {
  option: ClarificationOption;
  selected: boolean;
  disabled?: boolean;
  onSelect: (option: ClarificationOption) => void;
}) {
  return <button
    type="button"
    className={`clarificationChoice${selected ? " selected" : ""}`}
    aria-pressed={selected}
    disabled={disabled}
    onClick={() => onSelect(option)}
  >
    <span className="clarificationChoiceMark" aria-hidden="true">{selected ? "✓" : ""}</span>
    <span>{option.label}</span>
  </button>;
}
