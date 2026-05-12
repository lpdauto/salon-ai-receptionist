type PlaceholderTableProps = {
  columns: string[];
  rows: string[][];
};

export function PlaceholderTable({ columns, rows }: PlaceholderTableProps) {
  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="bg-slate-50 text-xs font-black uppercase tracking-[0.16em] text-slate-500">
            <tr>
              {columns.map((column) => (
                <th key={column} className="px-5 py-4">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.join("-")} className="text-slate-700">
                {row.map((cell) => (
                  <td key={cell} className="px-5 py-4">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
