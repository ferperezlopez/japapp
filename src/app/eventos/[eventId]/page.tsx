import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RsvpButtons } from "./RsvpButtons";
import { DeleteEventButton } from "./DeleteEventButton";

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

const GROUPS: { status: "yes" | "maybe" | "no"; label: string }[] = [
  { status: "yes", label: "Van" },
  { status: "maybe", label: "Tal vez" },
  { status: "no", label: "No van" },
];

export default async function EventoPage({
  params,
}: PageProps<"/eventos/[eventId]">) {
  const { eventId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: event } = await supabase
    .from("events")
    .select("id, name, event_date, location, description, created_by")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) notFound();

  const { data: rsvps } = await supabase
    .from("event_rsvps")
    .select("user_id, status, profiles(name, email)")
    .eq("event_id", eventId);

  const attendees = (rsvps ?? []).map((r) => ({
    userId: r.user_id,
    status: r.status,
    name: r.profiles?.name ?? r.profiles?.email ?? "Desconocido",
  }));

  const myStatus =
    (attendees.find((a) => a.userId === user?.id)?.status as
      | "yes"
      | "no"
      | "maybe"
      | undefined) ?? null;

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <Link href="/eventos" className="text-sm text-zinc-500 hover:underline">
        ← Eventos
      </Link>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">
        {event.name}
      </h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        {dateFormatter.format(new Date(event.event_date))}
        {event.location ? ` · ${event.location}` : ""}
      </p>
      {event.description && (
        <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
          {event.description}
        </p>
      )}

      <section className="mt-6">
        <h2 className="text-sm font-semibold">¿Vas?</h2>
        <div className="mt-2">
          <RsvpButtons eventId={eventId} currentStatus={myStatus} />
        </div>
      </section>

      <section className="mt-8 space-y-4">
        {GROUPS.map((group) => {
          const people = attendees.filter((a) => a.status === group.status);
          return (
            <div key={group.status}>
              <h3 className="text-sm font-semibold text-zinc-500">
                {group.label} ({people.length})
              </h3>
              <ul className="mt-1 flex flex-wrap gap-2">
                {people.map((p) => (
                  <li
                    key={p.userId}
                    className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                  >
                    {p.name}
                  </li>
                ))}
                {people.length === 0 && (
                  <li className="text-xs text-zinc-400">Nadie por ahora</li>
                )}
              </ul>
            </div>
          );
        })}
      </section>

      {event.created_by === user?.id && (
        <div className="mt-8">
          <DeleteEventButton eventId={eventId} />
        </div>
      )}
    </div>
  );
}
