export default function LabeledArrayCodeBlock({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="mb-4">
      <strong>{label}</strong>
      <code
        className={
          (className ?? "") +
          " block overflow-y-auto whitespace-pre rounded bg-secondary p-2"
        }
      >
        {value}
      </code>
    </div>
  );
}
