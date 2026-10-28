"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import {
  formatMoneyCompact,
  formatMoneyCompactSigned,
  formatPercent,
} from "@/lib/analytics/format";
import {
  nextSort,
  sortMemberRows,
  type MemberSort,
  type MemberSortKey,
  type MemberTableRow,
} from "@/lib/analytics/memberTable";

const COLUMNS: { key: MemberSortKey; label: string }[] = [
  { key: "ratio", label: "Asistencia" },
  { key: "paid", label: "Puso" },
  { key: "consumed", label: "Le tocó" },
  { key: "net", label: "Neto" },
  { key: "mvp", label: "MVP" },
];

// Único componente de cliente de Analytics: ordenar por columna sin un viaje al
// servidor (son ~16 filas ya cargadas). El criterio de orden está en
// `lib/analytics/memberTable.ts`, con tests.
export function MembersTable({ rows }: { rows: MemberTableRow[] }) {
  const [sort, setSort] = useState<MemberSort>({ key: "ratio", dir: "desc" });
  const sorted = useMemo(() => sortMemberRows(rows, sort), [rows, sort]);

  const ariaSort = (key: MemberSortKey) =>
    sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none";
  const arrow = (key: MemberSortKey) =>
    sort.key === key ? (sort.dir === "asc" ? "▲" : "▼") : "";

  const headerClass = "whitespace-nowrap px-2.5 py-2 text-right text-xs font-medium text-foreground/50";

  return (
    <div className="overflow-x-auto rounded-xl border border-surface-border bg-surface">
      <table className="w-full min-w-[30rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-surface-border">
            <th
              scope="col"
              aria-sort={ariaSort("name")}
              className="sticky left-0 z-10 bg-surface px-2.5 py-2 text-left text-xs font-medium text-foreground/50"
            >
              <button
                type="button"
                onClick={() => setSort(nextSort(sort, "name"))}
                className="inline-flex items-center gap-1 hover:text-foreground"
              >
                Miembro <span aria-hidden="true" className="text-[9px]">{arrow("name")}</span>
              </button>
            </th>
            {COLUMNS.map((column) => (
              <th key={column.key} scope="col" aria-sort={ariaSort(column.key)} className={headerClass}>
                <button
                  type="button"
                  onClick={() => setSort(nextSort(sort, column.key))}
                  className="inline-flex items-center gap-1 hover:text-foreground"
                >
                  {column.label}{" "}
                  <span aria-hidden="true" className="inline-block w-2 text-[9px]">
                    {arrow(column.key)}
                  </span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.id} className="border-b border-surface-border last:border-b-0">
              <td className="sticky left-0 z-10 bg-surface px-2.5 py-2">
                <Link
                  href={`/analytics/miembros/${row.id}`}
                  className="flex max-w-[7.5rem] items-center gap-2 hover:underline"
                >
                  <Avatar src={row.avatarUrl} name={row.name} size="sm" />
                  <span className="truncate font-medium">{row.name}</span>
                </Link>
              </td>
              <td className="whitespace-nowrap px-2.5 py-2 text-right tabular-nums">
                {row.ratio === null ? (
                  <span className="text-foreground/40">—</span>
                ) : (
                  <>
                    {formatPercent(row.ratio)}
                    <span className="block text-[11px] text-foreground/50">
                      {row.attended}/{row.counted}
                    </span>
                  </>
                )}
              </td>
              <td className="whitespace-nowrap px-2.5 py-2 text-right tabular-nums">{formatMoneyCompact(row.paid)}</td>
              <td className="whitespace-nowrap px-2.5 py-2 text-right tabular-nums">{formatMoneyCompact(row.consumed)}</td>
              <td className="whitespace-nowrap px-2.5 py-2 text-right tabular-nums">{formatMoneyCompactSigned(row.net)}</td>
              <td className="whitespace-nowrap px-2.5 py-2 text-right tabular-nums">{row.mvp > 0 ? row.mvp : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
