import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import type { AttendanceGrid as GridModel, GridCell } from "@/lib/analytics/grid";
import { formatDayShort, plural } from "@/lib/analytics/format";

// Cada respuesta tiene su propia forma además de su color: círculo lleno (fue),
// lleno amarillo (tal vez), vacío (dijo que no), punto (sin respuesta) y guion
// (todavía no era miembro). Así se lee igual sin distinguir colores.
const CELLS: Record<GridCell, { label: string; mark: string }> = {
  yes: { label: "Fue", mark: "h-3 w-3 rounded-full bg-eventos" },
  maybe: { label: "Tal vez", mark: "h-3 w-3 rounded-full bg-amber" },
  no: { label: "Dijo que no", mark: "h-3 w-3 rounded-full border-2 border-foreground/35" },
  none: { label: "Sin respuesta", mark: "h-1.5 w-1.5 rounded-full bg-foreground/30" },
  na: { label: "Todavía no era miembro", mark: "h-px w-2.5 bg-foreground/20" },
};

const LEGEND: GridCell[] = ["yes", "maybe", "no", "none", "na"];

function Mark({ cell }: { cell: GridCell }) {
  return (
    <span className="flex h-7 items-center justify-center">
      <span aria-hidden="true" className={`block ${CELLS[cell].mark}`} />
      <span className="sr-only">{CELLS[cell].label}</span>
    </span>
  );
}

// «¿Quién fue a qué?»: una fila por persona y una columna por evento (los últimos
// que entran), del más fiel al que menos viene. Se desliza de costado en pantallas
// muy angostas, con la columna de nombres fija.
export function AttendanceGrid({ grid }: { grid: GridModel }) {
  return (
    <Card className="p-4">
      <h3 className="font-heading text-lg font-semibold text-foreground">¿Quién fue a qué?</h3>
      <p className="mt-0.5 text-xs text-foreground/50">
        Últimos {plural(grid.events.length, "evento", "eventos")}; el más nuevo, a la derecha.
        {grid.hidden > 0 &&
          ` Hay ${plural(grid.hidden, "evento anterior", "eventos anteriores")} que no se muestran.`}
      </p>

      <div className="-mx-4 mt-3 overflow-x-auto px-4">
        <table className="w-full min-w-max border-collapse text-xs">
          <caption className="sr-only">Respuesta de cada persona a los últimos eventos</caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-surface pb-1.5 pr-2 text-left font-medium text-foreground/50">
                Persona
              </th>
              {grid.events.map((event) => (
                <th key={event.id} scope="col" className="min-w-8 px-0.5 pb-1.5 text-center text-[11px] font-normal">
                  <Link
                    href={`/analytics/eventos/${event.id}`}
                    title={event.name}
                    className="tabular-nums text-foreground/60 hover:text-foreground hover:underline"
                  >
                    {formatDayShort(event.eventDate)}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.rows.map((row) => (
              <tr key={row.userId} className="border-t border-surface-border">
                <th scope="row" className="sticky left-0 z-10 bg-surface py-0.5 pr-2 text-left font-normal">
                  <Link
                    href={`/analytics/miembros/${row.userId}`}
                    className="flex w-[6.5rem] items-center gap-1.5 hover:underline sm:w-[10rem]"
                  >
                    <Avatar src={row.avatarUrl} name={row.name} size="sm" className="ring-1 ring-surface-border" />
                    <span className="truncate text-[13px] font-medium text-foreground">{row.name}</span>
                  </Link>
                </th>
                {row.cells.map((cell, i) => (
                  <td key={grid.events[i].id} className="px-0.5">
                    <Mark cell={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-foreground/60">
        {LEGEND.map((cell) => (
          <li key={cell} className="flex items-center gap-1.5">
            <span className="flex h-3 w-3 items-center justify-center">
              <span aria-hidden="true" className={`block ${CELLS[cell].mark}`} />
            </span>
            {CELLS[cell].label}
          </li>
        ))}
      </ul>
    </Card>
  );
}
