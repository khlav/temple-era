export default function LabeledArrayCodeBlock({ label, value }: { label: string; value: any }) {
  return (
    <div className="mb-4">
      <strong>
        {label}{ value.length ? ` (${value.length})` : ""}:
      </strong>
      <code className="block bg-gray-100 p-2 rounded">
        {JSON.stringify(value, null, 2)}
      </code>
    </div>
  );
}
