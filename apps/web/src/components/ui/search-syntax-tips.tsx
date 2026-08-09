// Shared "how to search" bullets for TableSearchTips, kept identical everywhere so the
// syntax reads the same on every filter box in the app. See ~/lib/table-search for the
// matching logic these bullets describe.
export function SearchSyntaxTips() {
  return (
    <ul className="list-disc space-y-1 pl-4">
      <li>Multiple terms are ANDed together (all must match)</li>
      <li>
        Use <span className="font-mono text-chart-3">term1|term2</span> for OR
      </li>
      <li>
        Use <span className="font-mono text-chart-3">-term</span> to exclude
      </li>
      <li>
        Use <span className="font-mono text-chart-3">-(term1 term2)</span> to exclude multiple
      </li>
    </ul>
  );
}
