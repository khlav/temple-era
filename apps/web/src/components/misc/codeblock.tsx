export default function LabeledArrayCodeBlock({ label, value }: { label: string; value: any }) {
  return (
    <div className="mb-4">
      <strong>
        {label}{ value.length ? ` (${value.length})` : ""}:
      </strong>
      <code className="block p-2 rounded whitespace-pre overflow-auto bg-secondary">
        {JSON.stringify(value, null, 2)}
      </code>
    </div>
  );
}
