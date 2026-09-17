import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { CreateEventForm } from "./CreateEventForm";
import { getActingUser } from "@/lib/supabase/actingUser";

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

// Círculo de color + glifo blanco por estado — mismo criterio de color que
// ya insinuaba STATUS_EMOJI (✅🤔❌), ahora con peso visual real. "yes"/"no"
// reusan verde/rojo crudos de Tailwind (sin agregar tokens nuevos a
// globals.css, mismo criterio que ya usa el resto del repo para rojo:
// mensajes de error, borde de la cancha en TeamBuilderModal); "maybe" reusa
// el token --color-amber que ya existe.
const STATUS_STYLES: Record<
  "yes" | "maybe" | "no",
  { bg: string; text: string; glyph: string }
> = {
  yes: { bg: "bg-green-600 dark:bg-green-500", text: "text-white", glyph: "✓" },
  maybe: { bg: "bg-amber", text: "text-amber-ink", glyph: "?" },
  no: { bg: "bg-red-600 dark:bg-red-500", text: "text-white", glyph: "✕" },
};

function StatusBadge({
  status,
  size = "md",
  title,
}: {
  status: "yes" | "maybe" | "no";
  size?: "sm" | "md";
  title?: string;
}) {
  const { bg, text, glyph } = STATUS_STYLES[status];
  const sizeClasses = size === "sm" ? "h-7 w-7 text-sm" : "h-9 w-9 text-base";
  return (
    <span
      title={title}
      className={`flex shrink-0 items-center justify-center rounded-full font-bold ${bg} ${text} ${sizeClasses}`}
    >
      {glyph}
    </span>
  );
}

function StatItem({
  status,
  value,
  label,
}: {
  status: "yes" | "maybe" | "no";
  value: number;
  label: string;
}) {
  return (
    <div className="flex flex-1 items-center gap-2 px-2 first:pl-0 last:pr-0">
      <StatusBadge status={status} />
      <div>
        <p className="text-base font-medium leading-none text-foreground">
          {value}
        </p>
        <p className="text-[10px] text-foreground/50">{label}</p>
      </div>
    </div>
  );
}

function PeopleIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      className="h-4 w-4 shrink-0 text-eventos"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.5 10.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.5 18.5c0-2.5 2-4 5-4s5 1.5 5 4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 6.5a2.2 2.2 0 1 1 0 4.4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.5 14.7c1.9.3 3.5 1.6 3.5 3.8" />
    </svg>
  );
}

export default async function EventosPage() {
  const supabase = await createClient();
  // getActingUser en vez de auth.getUser().user.id directo: si un admin
  // está "actuando como" otro usuario, el emoji de "tu respuesta" debe
  // reflejar el estado de esa persona, no el del admin real.
  const actor = await getActingUser(supabase);

  const [{ data: events }, { data: rsvps }, { data: venues }, { data: members }] =
    await Promise.all([
      supabase
        .from("events")
        .select("id, name, event_date, location, has_futbol")
        .order("event_date", { ascending: true }),
      supabase.from("event_rsvps").select("event_id, user_id, status, kind"),
      supabase.from("venues").select("id, name").order("name"),
      supabase.from("profiles").select("id, name, email").order("name"),
    ]);

  // La confirmación de la juntada (kind="juntada") es la que define el
  // emoji de "tu respuesta" de cada card — el fútbol tiene su propio
  // contador aparte (ver futbolRsvpsByEvent) para no pisar ese emoji ni
  // mezclarse en el resumen principal.
  const rsvpsByEvent = new Map<string, { userId: string; status: string }[]>();
  const futbolRsvpsByEvent = new Map<string, { status: string }[]>();
  for (const r of rsvps ?? []) {
    if (r.kind === "juntada") {
      const list = rsvpsByEvent.get(r.event_id) ?? [];
      list.push({ userId: r.user_id, status: r.status });
      rsvpsByEvent.set(r.event_id, list);
    } else if (r.kind === "futbol") {
      const list = futbolRsvpsByEvent.get(r.event_id) ?? [];
      list.push({ status: r.status });
      futbolRsvpsByEvent.set(r.event_id, list);
    }
  }

  // Route is already forced dynamic by the cookie-based auth call above,
  // so this can't be cached/prerendered stale.
  // eslint-disable-next-line react-hooks/purity -- see comment above
  const now = Date.now();
  const upcoming = (events ?? []).filter(
    (e) => new Date(e.event_date).getTime() >= now,
  );
  const past = (events ?? [])
    .filter((e) => new Date(e.event_date).getTime() < now)
    .reverse();

  const renderEvent = (
    event: {
      id: string;
      name: string;
      event_date: string;
      location: string | null;
      has_futbol: boolean;
    },
    index: number,
  ) => {
    const eventRsvps = rsvpsByEvent.get(event.id) ?? [];
    const counts = { yes: 0, maybe: 0, no: 0 };
    let myStatus: string | undefined;
    for (const r of eventRsvps) {
      counts[r.status as keyof typeof counts]++;
      if (r.userId === actor?.id) myStatus = r.status;
    }

    const futbolCounts = { yes: 0, maybe: 0, no: 0 };
    for (const r of futbolRsvpsByEvent.get(event.id) ?? []) {
      futbolCounts[r.status as keyof typeof futbolCounts]++;
    }

    return (
      <Link key={event.id} href={`/eventos/${event.id}`} className="block">
        <Card
          className="animate-reveal px-4 py-3 transition duration-200 hover:-translate-y-0.5 hover:bg-eventos-soft hover:shadow-md"
          style={{ animationDelay: `${index * 60}ms` }}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="font-medium">{event.name}</p>
              <p className="text-xs text-foreground/50">
                {dateFormatter.format(new Date(event.event_date))}
                {event.location ? ` · ${event.location}` : ""}
              </p>
            </div>
            {myStatus && (
              <StatusBadge
                status={myStatus as "yes" | "maybe" | "no"}
                size="sm"
                title="Tu respuesta"
              />
            )}
          </div>

          <div className="mt-3">
            <div className="flex items-center gap-1.5">
              <PeopleIcon />
              <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground/50">
                Juntada
              </p>
            </div>
            <div className="mt-1.5 flex divide-x divide-surface-border">
              <StatItem status="yes" value={counts.yes} label="confirmados" />
              <StatItem status="maybe" value={counts.maybe} label="en duda" />
              <StatItem status="no" value={counts.no} label="no vienen" />
            </div>
          </div>

          {event.has_futbol && (
            <div className="mt-3 rounded-xl bg-surface p-3">
              <div className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-eventos text-xs text-white"
                >
                  ⚽
                </span>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground/50">
                    Fútbol 5
                  </p>
                  <p className="text-[10px] text-foreground/40">
                    Para los que se suman a jugar
                  </p>
                </div>
              </div>
              <div className="mt-1.5 flex divide-x divide-surface-border">
                <StatItem status="yes" value={futbolCounts.yes} label="juegan" />
                <StatItem status="maybe" value={futbolCounts.maybe} label="en duda" />
                <StatItem status="no" value={futbolCounts.no} label="no juegan" />
              </div>
            </div>
          )}
        </Card>
      </Link>
    );
  };

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-eventos">
        Organizá
      </p>
      <h1 className="mt-1 font-heading text-3xl font-semibold text-foreground">Eventos</h1>
      <p className="mt-2 text-sm text-foreground/60">
        Organizá juntadas y confirmá tu asistencia.
      </p>

      <div className="mt-6">
        <CreateEventForm venues={venues ?? []} members={members ?? []} />
      </div>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-foreground/50">Próximos</h2>
        <div className="mt-2 space-y-2">
          {upcoming.map(renderEvent)}
          {upcoming.length === 0 && (
            <p className="text-sm text-foreground/50">No hay eventos próximos.</p>
          )}
        </div>
      </section>

      {past.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-medium text-foreground/50">Pasados</h2>
          <div className="mt-2 space-y-2">{past.map(renderEvent)}</div>
        </section>
      )}
    </div>
  );
}
