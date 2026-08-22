import type { ReactNode } from "react";

export function DataTable<T>({
  columns,
  rows,
}: {
  columns: { key: string; label: string; align?: "right"; render: (row: T) => ReactNode }[];
  rows: T[];
}) {
  return (
    <div className="panel overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            {columns.map((c) => (
              <th
                key={c.key}
                className={`px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground ${
                  c.align === "right" ? "text-right" : "text-left"
                }`}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row, i) => (
            <tr key={i} className="transition-colors hover:bg-surface-2/50">
              {columns.map((c) => (
                <td key={c.key} className={`px-4 py-3 ${c.align === "right" ? "num text-right" : ""}`}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
