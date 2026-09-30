import { createClient } from "@/lib/supabase/server";
import { CreateEventForm } from "./CreateEventForm";
import { EventListCard } from "./EventListCard";
import { getActingUser } from "@/lib/supabase/actingUser";

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function EventosPage() {
  const supabase = await createClient();
  // getActingUser en vez de auth.getUser().user.id directo: si un admin
  // está "actuando como" otro usuario, el emoji de "tu respuesta" debe
  // reflejar el estado de esa persona, no el del admin real.
  const actor = await getActingUser(supabase);

  const [{ data: events }, { data: rsvps }, { data: venues }, { data: members }, { data: eventGuests }, { data: photoRows }] =
    await Promise.all([
      supabase
        .from("events")
        .select("id, name, event_date, location, has_futbol")
        .order("event_date", { ascending: true }),
      supabase.from("event_rsvps").select("event_id, user_id, status, kind"),
      supabase.from("venues").select("id, name").order("name"),
      supabase.from("profiles").select("id, name, email").order("name"),
      supabase.from("event_guests").select("event_id, kind"),
      supabase.from("event_media").select("event_id").eq("legacy", false),
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

  // Un invitado ya significa "confirmado que viene" (ver
  // specs/013-invitados-tareas-y-stats.md), así que suma al contador de
  // "confirmados"/"juegan" de cada tipo — mismo criterio que
  // AttendanceSummary en /eventos/[eventId].
  const guestCountByEventKind = new Map<string, number>();
  for (const g of eventGuests ?? []) {
    const key = `${g.event_id}:${g.kind}`;
    guestCountByEventKind.set(key, (guestCountByEventKind.get(key) ?? 0) + 1);
  }

  // Link a /fotos desde cada evento (ver EventListCard) — solo hace
  // falta el conteo, no las fotos en sí.
  const photoCountByEvent = new Map<string, number>();
  for (const p of photoRows ?? []) {
    photoCountByEvent.set(p.event_id, (photoCountByEvent.get(p.event_id) ?? 0) + 1);
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
    let myStatus: "yes" | "maybe" | "no" | undefined;
    for (const r of eventRsvps) {
      counts[r.status as keyof typeof counts]++;
      if (r.userId === actor?.id) myStatus = r.status as "yes" | "maybe" | "no";
    }
    counts.yes += guestCountByEventKind.get(`${event.id}:juntada`) ?? 0;

    const futbolCounts = { yes: 0, maybe: 0, no: 0 };
    for (const r of futbolRsvpsByEvent.get(event.id) ?? []) {
      futbolCounts[r.status as keyof typeof futbolCounts]++;
    }
    futbolCounts.yes += guestCountByEventKind.get(`${event.id}:futbol`) ?? 0;

    return (
      <EventListCard
        key={event.id}
        event={event}
        index={index}
        dateLabel={dateFormatter.format(new Date(event.event_date))}
        myStatus={myStatus}
        counts={counts}
        futbolCounts={futbolCounts}
        photoCount={photoCountByEvent.get(event.id) ?? 0}
      />
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
