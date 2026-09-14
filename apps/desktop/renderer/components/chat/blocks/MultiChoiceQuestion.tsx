import type { ClarificationOption, ClarificationQuestion } from "@nexo/shared";
import { CheckboxOption } from "./CheckboxOption";

export function MultiChoiceQuestion({ question, selectedIds, disabled, onChange }: {
  question: ClarificationQuestion;
  selectedIds: string[];
  disabled?: boolean;
  onChange: (ids: string[]) => void;
}) {
  function toggle(option: ClarificationOption, checked: boolean) {
    const next = checked
      ? [...new Set([...selectedIds, option.id])]
      : selectedIds.filter(id => id !== option.id);
    onChange(next);
  }

  return <div className="clarificationMultiChoice">
    <div className="clarificationCheckboxes">
      {(question.options ?? []).map(option => <CheckboxOption
        key={option.id}
        option={option}
        checked={selectedIds.includes(option.id)}
        disabled={disabled}
        onChange={checked => toggle(option, checked)}
      />)}
    </div>
    {question.helperText ? <p className="clarificationHelper">{question.helperText}</p> : null}
  </div>;
}
