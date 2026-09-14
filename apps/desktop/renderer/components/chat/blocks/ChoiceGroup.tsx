import type { ClarificationOption } from "@nexo/shared";
import { ChoiceButton } from "./ChoiceButton";

export function ChoiceGroup({ options, selectedId, disabled, onSelect }: {
  options: ClarificationOption[];
  selectedId?: string;
  disabled?: boolean;
  onSelect: (option: ClarificationOption) => void;
}) {
  return <div className="clarificationChoices" role="radiogroup">
    {options.map(option => <ChoiceButton
      key={option.id}
      option={option}
      selected={selectedId === option.id}
      disabled={disabled}
      onSelect={onSelect}
    />)}
  </div>;
}
