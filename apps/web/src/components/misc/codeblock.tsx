export default function LabeledArrayCodeBlock({ label, value, className}: { label: string; value: string, className?: string }) {
  return (
    <div className="mb-4">
      <strong>
        {label}
      </strong>
      <code className={(className ?? "") + " block p-2 rounded whitespace-pre overflow-y-auto bg-secondary"}>
        {value}
      </code>
    </div>
  );
}
