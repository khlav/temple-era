export default function LabeledArrayCodeBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-4">
      <strong>
        {label}
      </strong>
      <code className="block p-2 rounded whitespace-pre overflow-auto bg-secondary">
        {value}
      </code>
    </div>
  );
}
