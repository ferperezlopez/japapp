import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { CreateEventForm } from "./CreateEventForm";

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const STATUS_EMOJI: Record<string, string> = {
  yes: "✅",
  maybe: "🤔",
  no: "❌",
};

export default async function EventosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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

  // Solo la confirmación de la juntada (kind="juntada") entra en el resumen
  // de cada card — un evento con fútbol tiene una segunda fila de RSVP por
  // persona (kind="futbol") que no debe sumarse acá ni pisar el emoji de
  // "tu respuesta", que es sobre la juntada, no sobre el fútbol.
  const rsvpsByEvent = new Map<string, { userId: string; status: string }[]>();
  for (const r of rsvps ?? []) {
    if (r.kind !== "juntada") continue;
    const list = rsvpsByEvent.get(r.event_id) ?? [];
    list.push({ userId: r.user_id, status: r.status });
    rsvpsByEvent.set(r.event_id, list);
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
      if (r.userId === user?.id) myStatus = r.status;
    }

    return (
      <Link key={event.id} href={`/eventos/${event.id}`} className="block">
        <Card
          className="animate-reveal px-4 py-3 transition duration-200 hover:-translate-y-0.5 hover:bg-eventos-soft hover:shadow-md"
          style={{ animationDelay: `${index * 60}ms` }}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="font-medium">
                {event.name} {event.has_futbol && <span title="Con fútbol">⚽</span>}
              </p>
              <p className="text-xs text-foreground/50">
                {dateFormatter.format(new Date(event.event_date))}
                {event.location ? ` · ${event.location}` : ""}
              </p>
            </div>
            {myStatus && (
              <span className="text-lg" title="Tu respuesta">
                {STATUS_EMOJI[myStatus]}
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-foreground/50">
            {STATUS_EMOJI.yes} {counts.yes} · {STATUS_EMOJI.maybe}{" "}
            {counts.maybe} · {STATUS_EMOJI.no} {counts.no}
          </p>
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
