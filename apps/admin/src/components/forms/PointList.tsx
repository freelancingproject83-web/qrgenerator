export function PointList({
  label,
  placeholder,
  values,
  onChange,
}: {
  label: string;
  placeholder: string;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <fieldset className="point-list">
      <legend>{label}</legend>
      {values.map((value, index) => (
        <div className="point-row" key={index}>
          <span>{index + 1}</span>
          <input
            required
            value={value}
            maxLength={500}
            placeholder={placeholder}
            onChange={(event) =>
              onChange(
                values.map((item, itemIndex) =>
                  itemIndex === index ? event.target.value : item,
                ),
              )
            }
          />
          {values.length > 1 && (
            <button
              type="button"
              aria-label={`Remove ${label} point`}
              onClick={() =>
                onChange(values.filter((_, itemIndex) => itemIndex !== index))
              }
            >
              ×
            </button>
          )}
        </div>
      ))}
      <button
        className="add-point"
        type="button"
        onClick={() => onChange([...values, ''])}
      >
        ＋ Add another point
      </button>
    </fieldset>
  );
}
