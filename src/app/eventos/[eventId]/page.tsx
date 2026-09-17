import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RsvpButtons } from "@/components/eventos/RsvpButtons";
import { AttendanceSummary } from "@/components/eventos/AttendanceSummary";
import { DeleteEventButton } from "./DeleteEventButton";
import { EditEventForm } from "./EditEventForm";
import { EditVenueForm } from "./EditVenueForm";
import { FutbolStatsForm } from "./FutbolStatsForm";
import { FutbolTeamsSection } from "./FutbolTeamsSection";
import { UploadPhotoForm } from "./UploadPhotoForm";
import { PhotoGrid } from "./PhotoGrid";
import { Avatar } from "@/components/ui/Avatar";
import { AddGuestForm } from "./AddGuestForm";
import { RemoveGuestButton } from "./RemoveGuestButton";
import { TaskAssignSelect } from "./TaskAssignSelect";
import { TaskAssigneesEditor } from "./TaskAssigneesEditor";
import { buildMapsLink } from "@/lib/eventos/mapsLink";
import { getActingUser } from "@/lib/supabase/actingUser";

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

// Separados del dateFormatter de arriba (que sigue usándose tal cual para
// el mensaje de WhatsApp) para poder mostrar fecha y hora cada una al lado
// de su propio ícono en el encabezado del evento.
const dateOnlyFormatter = new Intl.DateTimeFormat("es-AR", {
  weekday: "long",
  day: "numeric",
  month: "long",
});
const timeOnlyFormatter = new Intl.DateTimeFormat("es-AR", {
  hour: "2-digit",
  minute: "2-digit",
});

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-4 w-4 shrink-0" aria-hidden="true">
      <rect x="3.75" y="5" width="16.5" height="15" rx="2" strokeLinejoin="round" />
      <path strokeLinecap="round" d="M3.75 9.5h16.5M8 3v3.5M16 3v3.5" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-4 w-4 shrink-0" aria-hidden="true">
      <circle cx="12" cy="12" r="8.25" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5V12l3 2" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-4 w-4 shrink-0" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21s-6.5-5.7-6.5-11a6.5 6.5 0 1 1 13 0c0 5.3-6.5 11-6.5 11Z" />
      <circle cx="12" cy="10" r="2.25" />
    </svg>
  );
}

function MapIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-4 w-4 shrink-0" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5 4 6.5v13l5-2 6 2 5-2v-13l-5 2-6-2Z" />
      <path strokeLinecap="round" d="M9 4.5v13M15 6.5v13" />
    </svg>
  );
}

const GROUPS: { status: "yes" | "maybe" | "no"; label: string }[] = [
  { status: "yes", label: "Van" },
  { status: "maybe", label: "Tal vez" },
  { status: "no", label: "No van" },
];

// "Creación del evento" y "convocatoria" no están en esta lista: se
// asumen hechas por quien creó el evento (events.created_by), mostrado
// por separado como "Creado por". "Reserva de cancha" tampoco está acá:
// es una tarea del sub-evento fútbol, se renderiza junto a él.
const TASK_TYPES: {
  type: "compra_insumos" | "lavado_platos" | "orden_sede";
  label: string;
}[] = [
  { type: "compra_insumos", label: "Compra de insumos" },
  { type: "lavado_platos", label: "Lavado de platos" },
  { type: "orden_sede", label: "Orden de la sede" },
];

type Attendee = {
  userId: string;
  status: string;
  name: string;
  avatarUrl: string | null;
};

type EventGuest = {
  eventGuestId: string;
  guestId: string;
  name: string;
  addedBy: string;
  addedByName: string;
  broughtBy: string;
  broughtByName: string;
};

// Separador liviano (línea + eyebrow), sin tarjetas anidadas: marca dónde
// termina el contenido de la juntada y dónde empieza el del fútbol, ya que
// antes quedaban pegados uno debajo del otro sin ningún límite visual.
function SectionDivider({
  label,
  colorClass,
}: {
  label: string;
  colorClass: string;
}) {
  return (
    <div className="mt-10 flex items-center gap-3">
      <span className="h-px flex-1 bg-surface-border" />
      <h2
        className={`text-xs font-semibold uppercase tracking-[0.14em] ${colorClass}`}
      >
        {label}
      </h2>
      <span className="h-px flex-1 bg-surface-border" />
    </div>
  );
}

// Confirmación + lista de asistentes de un tipo (juntada o fútbol): las dos
// se ven en el mismo lugar (la página del evento), cada una con su propio
// estado y su propia lista de Van/Tal vez/No van.
function RsvpSection({
  title,
  eventId,
  kind,
  myStatus,
  attendees,
  totalPeople,
  guests,
  currentUserId,
  registeredGuests,
  members,
}: {
  title: string;
  eventId: string;
  kind: "juntada" | "futbol";
  myStatus: "yes" | "no" | "maybe" | null;
  attendees: Attendee[];
  totalPeople: number;
  guests: EventGuest[];
  currentUserId: string | undefined;
  registeredGuests: { id: string; name: string }[];
  members: { id: string; name: string | null; email: string }[];
}) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-medium">{title}</h2>
      <AttendanceSummary
        attendees={attendees}
        totalPeople={totalPeople}
        guestCount={guests.length}
      />
      <div className="mt-3">
        <RsvpButtons eventId={eventId} kind={kind} currentStatus={myStatus} />
      </div>
      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-medium text-foreground/50">
          Ver detalle de asistentes
        </summary>
        <div className="mt-3 space-y-4">
          {GROUPS.map((group) => {
            const people = attendees.filter((a) => a.status === group.status);
            const groupGuests = group.status === "yes" ? guests : [];
            return (
              <div key={group.status}>
                <h3 className="text-sm font-medium text-foreground/50">
                  {group.label} ({people.length}
                  {groupGuests.length > 0
                    ? ` + ${groupGuests.length} invitadxs`
                    : ""}
                  )
                </h3>
                <ul className="mt-1 flex flex-wrap gap-2">
                  {people.map((p, index) => (
                    <li
                      key={p.userId}
                      className="animate-reveal"
                      style={{ animationDelay: `${index * 40}ms` }}
                    >
                      <Link
                        href={`/perfil/${p.userId}`}
                        className="flex items-center gap-1.5 rounded-full bg-surface py-1 pl-1 pr-3 text-xs text-foreground/80 transition-colors duration-200 hover:bg-surface-border"
                      >
                        <Avatar src={p.avatarUrl} name={p.name} size="sm" />
                        {p.name}
                      </Link>
                    </li>
                  ))}
                  {groupGuests.map((g, index) => (
                    <li
                      key={g.eventGuestId}
                      className="animate-reveal flex items-center gap-1 rounded-full bg-surface py-1 pl-1 pr-2 text-xs text-foreground/80"
                      style={{ animationDelay: `${(people.length + index) * 40}ms` }}
                    >
                      <Avatar src={null} name={g.name} size="sm" />
                      <span>
                        {g.name}{" "}
                        <span className="text-foreground/40">
                          (trajo: {g.broughtByName})
                        </span>
                      </span>
                      {g.addedBy === currentUserId && (
                        <RemoveGuestButton
                          eventGuestId={g.eventGuestId}
                          eventId={eventId}
                        />
                      )}
                    </li>
                  ))}
                  {people.length === 0 && groupGuests.length === 0 && (
                    <li className="text-xs text-foreground/40">Nadie por ahora</li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>

        <div className="mt-4">
          <AddGuestForm
            eventId={eventId}
            kind={kind}
            guests={registeredGuests}
            members={members}
            currentUserId={currentUserId}
          />
        </div>
      </details>
    </section>
  );
}

export default async function EventoPage({
  params,
}: PageProps<"/eventos/[eventId]">) {
  const { eventId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  // getActingUser en vez de user.id directo, solo para "tu respuesta"
  // (myStatus/myFutbolStatus más abajo): si un admin está "actuando como"
  // otro usuario, debe reflejar el estado de esa persona. El resto de los
  // permisos de esta página (editar/borrar evento, sacar invitados) siguen
  // atados a `user` real, ya que esas acciones todavía no están cableadas
  // a getActingUser (ver specs/016-admin.md, "Futuro").
  const actor = await getActingUser(supabase);

  const { data: event } = await supabase
    .from("events")
    .select(
      "id, name, event_date, location, description, created_by, group_id, has_futbol",
    )
    .eq("id", eventId)
    .maybeSingle();

  if (!event) notFound();

  // Compartir por WhatsApp: la API oficial de WhatsApp no permite postear a
  // un grupo existente (solo crear grupos nuevos de hasta 8 miembros, con
  // cuenta de negocio verificada) — un link wa.me con el texto ya armado,
  // para que quien lo comparta elija el grupo real y lo mande con un toque,
  // es la única vía que no viola los términos de uso.
  const requestHeaders = await headers();
  const origin = `https://${requestHeaders.get("host")}`;
  const eventUrl = `${origin}/eventos/${eventId}`;
  const shareText = [
    `🎉 *${event.name}*`,
    `📅 ${dateFormatter.format(new Date(event.event_date))}`,
    event.location ? `📍 ${event.location}` : null,
    event.description ? `\n${event.description}` : null,
    `\nConfirmá tu asistencia acá: ${eventUrl}`,
  ]
    .filter(Boolean)
    .join("\n");
  const whatsappShareUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

  const [
    { data: rsvps },
    { data: allProfiles },
    { data: venues },
    { data: registeredGuests },
    { data: eventGuestRows },
  ] = await Promise.all([
    supabase
      .from("event_rsvps")
      .select("user_id, status, kind, profiles(name, email, avatar_url)")
      .eq("event_id", eventId),
    supabase.from("profiles").select("id, name, email, avatar_url").order("name"),
    supabase
      .from("venues")
      .select(
        "id, name, host_user_id, address, profiles!venues_host_user_id_fkey(name, email)",
      )
      .order("name"),
    supabase.from("guests").select("id, name").order("name"),
    supabase
      .from("event_guests")
      .select("id, guest_id, kind, added_by, brought_by, guests(name)")
      .eq("event_id", eventId),
  ]);
  const [{ data: taskRows }, { data: insumoItems }] = await Promise.all([
    supabase
      .from("event_tasks")
      .select("id, task_type, assigned_to, item_id")
      .eq("event_id", eventId),
    supabase.from("insumo_items").select("id, name").order("name"),
  ]);
  const totalPeople = allProfiles?.length ?? 0;
  const members = allProfiles ?? [];
  const memberName = (userId: string) =>
    members.find((m) => m.id === userId)?.name ??
    members.find((m) => m.id === userId)?.email ??
    "Desconocido";
  const memberAvatar = (userId: string) =>
    members.find((m) => m.id === userId)?.avatar_url ?? null;
  const itemName = (itemId: string | null) =>
    itemId ? (insumoItems?.find((i) => i.id === itemId)?.name ?? null) : null;

  const assigneesByTask = new Map<
    string,
    { id: string; userId: string; itemId: string | null }[]
  >();
  for (const t of taskRows ?? []) {
    const list = assigneesByTask.get(t.task_type) ?? [];
    list.push({ id: t.id, userId: t.assigned_to, itemId: t.item_id });
    assigneesByTask.set(t.task_type, list);
  }
  const reservaCanchaAssignedTo =
    assigneesByTask.get("reserva_cancha")?.[0]?.userId ?? null;

  const eventVenue = venues?.find((v) => v.name === event.location);
  const hostName = eventVenue?.profiles?.name ?? eventVenue?.profiles?.email ?? null;

  const allEventGuests: (EventGuest & { kind: string })[] = (
    eventGuestRows ?? []
  ).map((g) => ({
    eventGuestId: g.id,
    guestId: g.guest_id,
    kind: g.kind,
    name: g.guests?.name ?? "Desconocido",
    addedBy: g.added_by,
    addedByName: memberName(g.added_by),
    broughtBy: g.brought_by,
    broughtByName: memberName(g.brought_by),
  }));
  const guestsJuntada = allEventGuests.filter((g) => g.kind === "juntada");
  const guestsFutbol = allEventGuests.filter((g) => g.kind === "futbol");

  const allAttendees = (rsvps ?? []).map((r) => ({
    userId: r.user_id,
    status: r.status,
    kind: r.kind,
    name: r.profiles?.name ?? r.profiles?.email ?? "Desconocido",
    avatarUrl: r.profiles?.avatar_url ?? null,
  }));

  const attendeesJuntada = allAttendees.filter((a) => a.kind === "juntada");
  const attendeesFutbol = allAttendees.filter((a) => a.kind === "futbol");

  // Estadísticas del partido: solo si el evento tiene fútbol. MVP y
  // goleador se eligen entre quienes confirmaron "Voy" al fútbol.
  let futbolStats: {
    resultado: string | null;
    mvpUserId: string | null;
    goleadorUserId: string | null;
  } | null = null;
  let futbolTeams: {
    userId: string;
    team: 1 | 2;
    position: "gk" | "def" | "fwd";
  }[] = [];

  if (event.has_futbol) {
    const [{ data: statsRow }, { data: teamRows }] = await Promise.all([
      supabase
        .from("futbol_stats")
        .select("resultado, mvp_user_id, goleador_user_id")
        .eq("event_id", eventId)
        .maybeSingle(),
      supabase
        .from("futbol_teams")
        .select("user_id, team, position")
        .eq("event_id", eventId),
    ]);

    if (statsRow) {
      futbolStats = {
        resultado: statsRow.resultado,
        mvpUserId: statsRow.mvp_user_id,
        goleadorUserId: statsRow.goleador_user_id,
      };
    }

    futbolTeams = (teamRows ?? []).map((t) => ({
      userId: t.user_id,
      team: t.team as 1 | 2,
      position: t.position as "gk" | "def" | "fwd",
    }));
  }

  const futbolCandidates = attendeesFutbol
    .filter((a) => a.status === "yes")
    .map((a) => ({ userId: a.userId, name: a.name, avatarUrl: a.avatarUrl }));

  // El pool del armador de equipos no es solo los confirmados actuales: si
  // alguien ya quedó guardado en un equipo y después cambió su RSVP, sigue
  // apareciendo (resuelto contra `members`) para no hacerlo desaparecer.
  const futbolTeamCandidates = [
    ...futbolCandidates,
    ...futbolTeams
      .filter((t) => !futbolCandidates.some((c) => c.userId === t.userId))
      .map((t) => ({
        userId: t.userId,
        name: memberName(t.userId),
        avatarUrl: memberAvatar(t.userId),
      })),
  ];

  const myStatus =
    (attendeesJuntada.find((a) => a.userId === actor?.id)?.status as
      | "yes"
      | "no"
      | "maybe"
      | undefined) ?? null;
  const myFutbolStatus =
    (attendeesFutbol.find((a) => a.userId === actor?.id)?.status as
      | "yes"
      | "no"
      | "maybe"
      | undefined) ?? null;

  // Fotos: URLs firmadas en batch, expiran en 1h. Las "legacy" (ver
  // specs/011-fotos-legacy-y-carrusel.md) quedan fuera de la galería del
  // evento, aunque siguen contando para el pool general de la landing.
  const { data: mediaRows } = await supabase
    .from("event_media")
    .select("id, storage_path, uploaded_by")
    .eq("event_id", eventId)
    .eq("legacy", false)
    .order("created_at", { ascending: false });

  const paths = (mediaRows ?? []).map((m) => m.storage_path);
  const { data: signedUrls } =
    paths.length > 0
      ? await supabase.storage.from("event-photos").createSignedUrls(paths, 3600)
      : { data: [] as { path: string | null; signedUrl: string }[] };

  const photos = (mediaRows ?? []).map((m) => ({
    id: m.id,
    storagePath: m.storage_path,
    uploadedBy: m.uploaded_by,
    url:
      signedUrls?.find((s) => s.path === m.storage_path)?.signedUrl ?? null,
  }));

  const eventSummary = (
    <>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-eventos">
        Próximo evento
      </p>
      <h1 className="mt-1 font-heading text-2xl font-semibold text-foreground">
        {event.name}
      </h1>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-foreground/60">
        <span className="inline-flex items-center gap-1.5">
          <CalendarIcon />
          {dateOnlyFormatter.format(new Date(event.event_date))}
        </span>
        <span className="h-4 w-px bg-surface-border" aria-hidden="true" />
        <span className="inline-flex items-center gap-1.5">
          <ClockIcon />
          {timeOnlyFormatter.format(new Date(event.event_date))}
        </span>
        {event.location && (
          <>
            <span className="h-4 w-px bg-surface-border" aria-hidden="true" />
            <span className="inline-flex items-center gap-1.5">
              <PinIcon />
              {event.location}
              {hostName ? ` (casa de ${hostName})` : ""}
            </span>
          </>
        )}
        {eventVenue?.address && (
          <>
            <span className="h-4 w-px bg-surface-border" aria-hidden="true" />
            <a
              href={buildMapsLink(eventVenue.address)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-eventos-soft px-3 py-1.5 text-sm font-medium text-eventos transition-colors duration-200 hover:bg-eventos-mid/40"
            >
              <MapIcon />
              Cómo llegar
            </a>
          </>
        )}
      </div>
      {eventVenue && (
        <div className="mt-1.5">
          <EditVenueForm venue={eventVenue} members={members} />
        </div>
      )}
      {event.description && (
        <p className="mt-2 text-sm text-foreground/80">
          {event.description}
        </p>
      )}
    </>
  );

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <Link href="/eventos" className="text-sm text-foreground/50 hover:underline">
        ← Eventos
      </Link>

      <div className="animate-reveal bg-grain mt-3 rounded-2xl border border-surface-border bg-surface p-5">
        {event.created_by === user?.id ? (
          <EditEventForm
            eventId={eventId}
            venues={venues ?? []}
            members={members}
            event={{
              name: event.name,
              // event_date es un ISO timestamp; los primeros 16 caracteres
              // ("YYYY-MM-DDTHH:mm") son exactamente el formato que espera
              // un <input type="datetime-local">. No se pasa por getters
              // de Date porque esos dependen de la zona horaria del
              // proceso que corre el código, y acá no hace falta: los
              // dígitos guardados ya son los que se tipearon al crear el
              // evento (ver decisión de zona horaria en specs/003-eventos.md).
              eventDateLocal: event.event_date.slice(0, 16),
              location: event.location,
              description: event.description,
              hasFutbol: event.has_futbol,
            }}
          >
            {eventSummary}
          </EditEventForm>
        ) : (
          eventSummary
        )}
        <a
          href={whatsappShareUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-surface-border px-4 py-2 text-sm font-medium text-foreground/70 transition duration-200 hover:bg-surface active:scale-[0.98]"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
            <path d="M12.04 2c-5.5 0-9.96 4.46-9.96 9.96 0 1.76.46 3.48 1.33 5l-1.41 5.15 5.28-1.38a9.9 9.9 0 0 0 4.76 1.21h.01c5.5 0 9.96-4.46 9.96-9.96C22 6.46 17.54 2 12.04 2Zm5.83 14.24c-.25.7-1.24 1.28-1.99 1.44-.53.11-1.22.2-3.55-.76-2.98-1.23-4.9-4.26-5.05-4.46-.15-.2-1.2-1.6-1.2-3.06s.75-2.16 1.02-2.46c.25-.28.55-.35.73-.35.19 0 .37 0 .53.01.17.01.4-.06.62.48.25.6.85 2.06.92 2.21.07.15.12.32.02.52-.09.2-.14.32-.28.49-.14.17-.29.38-.42.51-.14.14-.28.29-.12.57.16.28.72 1.19 1.55 1.93 1.06.95 1.96 1.24 2.24 1.38.28.14.44.12.6-.07.17-.19.71-.83.9-1.11.19-.28.37-.24.63-.14.25.09 1.6.75 1.87.89.28.14.46.21.53.32.07.12.07.65-.18 1.35Z" />
          </svg>
          Compartir en WhatsApp
        </a>
      </div>

      <SectionDivider label="Evento" colorClass="text-eventos" />

      <RsvpSection
        title="¿Vas a la juntada?"
        eventId={eventId}
        kind="juntada"
        myStatus={myStatus}
        attendees={attendeesJuntada}
        totalPeople={totalPeople}
        guests={guestsJuntada}
        currentUserId={user?.id}
        registeredGuests={registeredGuests ?? []}
        members={members}
      />

      <section className="mt-8">
        <details className="rounded-xl border border-surface-border bg-surface p-4">
          <summary className="cursor-pointer text-sm font-medium">
            Asignación de tareas
          </summary>
          <p className="mt-3 text-xs text-foreground/50">
            Creado por: {memberName(event.created_by)}
          </p>
          <div className="mt-3 space-y-3">
            {TASK_TYPES.map((t) => (
              <div key={t.type}>
                <label className="block text-xs font-medium text-foreground/50">
                  {t.label}
                </label>
                <div className="mt-1">
                  <TaskAssigneesEditor
                    eventId={eventId}
                    taskType={t.type}
                    assignees={(assigneesByTask.get(t.type) ?? []).map(
                      (a) => ({
                        id: a.id,
                        userId: a.userId,
                        name: memberName(a.userId),
                        avatarUrl: memberAvatar(a.userId),
                        itemName: itemName(a.itemId),
                      }),
                    )}
                    members={members}
                    items={
                      t.type === "compra_insumos"
                        ? (insumoItems ?? [])
                        : undefined
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        </details>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium">Gastos</h2>
        <div className="mt-2">
          {event.group_id ? (
            <Link
              href={`/gastos/${event.group_id}`}
              className="inline-flex items-center gap-2 rounded-lg border border-surface-border px-4 py-2 text-sm font-medium text-gastos transition duration-200 hover:bg-gastos-soft active:scale-[0.98]"
            >
              Ver gastos de este evento →
            </Link>
          ) : (
            <p className="text-sm text-foreground/50">
              Este evento todavía no tiene un grupo de gastos enlazado.
            </p>
          )}
        </div>
      </section>

      {event.has_futbol && (
        <>
          <SectionDivider
            label="⚽ Fútbol"
            colorClass="text-green-700 dark:text-green-400"
          />
          <RsvpSection
            title="⚽ ¿Jugás al fútbol?"
            eventId={eventId}
            kind="futbol"
            myStatus={myFutbolStatus}
            attendees={attendeesFutbol}
            totalPeople={totalPeople}
            guests={guestsFutbol}
            currentUserId={user?.id}
            registeredGuests={registeredGuests ?? []}
            members={members}
          />
          <div className="mt-4 rounded-xl border border-surface-border bg-surface p-4">
            <label className="block text-xs font-medium text-foreground/50">
              Reserva de cancha
            </label>
            <div className="mt-1">
              <TaskAssignSelect
                eventId={eventId}
                assignedTo={reservaCanchaAssignedTo}
                members={members}
              />
            </div>
          </div>
          <FutbolStatsForm
            eventId={eventId}
            stats={futbolStats}
            candidates={futbolCandidates}
          />
          <FutbolTeamsSection
            eventId={eventId}
            candidates={futbolTeamCandidates}
            initialAssignment={futbolTeams}
          />
        </>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-medium">Fotos</h2>
        <div className="mt-2">
          <UploadPhotoForm eventId={eventId} />
          <PhotoGrid
            eventId={eventId}
            photos={photos}
            currentUserId={user?.id}
            eventCreatorId={event.created_by}
          />
        </div>
      </section>

      {event.created_by === user?.id && (
        <div className="mt-8">
          <DeleteEventButton eventId={eventId} />
        </div>
      )}
    </div>
  );
}
