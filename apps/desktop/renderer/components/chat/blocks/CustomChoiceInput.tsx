export function CustomChoiceInput({ value, placeholder, disabled, onChange }: {
  value: string;
  placeholder?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return <label className="clarificationCustom">
    <span>Outra pasta</span>
    <input
      type="text"
      value={value}
      placeholder={placeholder ?? "Digite um valor..."}
      disabled={disabled}
      onChange={event => onChange(event.target.value)}
      autoComplete="off"
    />
  </label>;
}
