import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { RsvpButtons } from "@/components/eventos/RsvpButtons";
import { AttendanceSummary } from "@/components/eventos/AttendanceSummary";
import { PhotoCarousel } from "@/components/PhotoCarousel";

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const FEATURES = [
  {
    href: "/eventos",
    title: "Eventos",
    description: "Organizá juntadas y confirmá quién va.",
    colorClasses: "bg-eventos-soft text-eventos",
    icon: (
      <>
        <rect x="3.75" y="5" width="16.5" height="15" rx="2" strokeLinejoin="round" />
        <path strokeLinecap="round" d="M3.75 9.5h16.5M8 3v3.5M16 3v3.5" />
      </>
    ),
  },
  {
    href: "/calculadoras/asado",
    title: "Calculadoras",
    description: "Cuánto asado o cuántas empanadas comprar.",
    colorClasses: "bg-brand-soft text-brand",
    icon: (
      <>
        <rect x="4.5" y="3" width="15" height="18" rx="2" strokeLinejoin="round" />
        <path strokeLinecap="round" d="M7.5 7.5h9M7.5 12h.01M12 12h.01M16.5 12h.01M7.5 16.5h.01M12 16.5h.01M16.5 16.5h.01" />
      </>
    ),
  },
  {
    href: "/gastos",
    title: "Gastos",
    description: "Dividí los gastos compartidos entre amigos.",
    colorClasses: "bg-gastos-soft text-gastos",
    icon: (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.5 7.5a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v11a2 2 0 0 1-2 2h-13a1 1 0 0 1-1-1v-11Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.5 13.25h3v2.5h-3a1.25 1.25 0 1 1 0-2.5Z" />
      </>
    ),
  },
  {
    href: "/miembros",
    title: "Miembros",
    description: "Todos del grupo y su asistencia a la JAPA.",
    colorClasses: "bg-brand-soft text-brand",
    icon: (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.5 20c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 6.75a2.5 2.5 0 1 1 0 5" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.5 15.25c2.3.3 4 1.8 4 4.25" />
      </>
    ),
  },
] as const;

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let heroPhotoUrls: string[] = [];
  let upcomingEvent: {
    id: string;
    name: string;
    event_date: string;
    location: string | null;
    has_futbol: boolean;
  } | null = null;
  let myStatus: "yes" | "no" | "maybe" | null = null;
  let myFutbolStatus: "yes" | "no" | "maybe" | null = null;
  let recentMembers: { id: string; name: string | null; email: string }[] = [];
  let attendeesJuntada: { status: string }[] = [];
  let attendeesFutbol: { status: string }[] = [];
  let totalPeople = 0;

  if (user) {
    // Sin login de Google, alguien nuevo no tiene forma de avisarle al
    // resto que se sumó — este aviso (ventana fija de 7 días, sin marcar
    // "visto") es el mecanismo elegido para eso, sin sumar notificaciones
    // por email ni ninguna infraestructura nueva.
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const { data: newMembers } = await supabase
      .from("profiles")
      .select("id, name, email")
      .neq("id", user.id)
      .gte("created_at", sevenDaysAgo.toISOString())
      .order("created_at", { ascending: false });
    recentMembers = newMembers ?? [];
    // Pool general de fotos (ver specs/011-fotos-legacy-y-carrusel.md):
    // todas las fotos de todos los eventos, sin filtrar por evento ni por
    // "legacy" — las legacy también cuentan acá, solo se ocultan de la
    // galería de su propio evento. Se trae un tope razonable y se
    // mezclan en JS para no depender de random() a nivel SQL.
    const { data: mediaRows } = await supabase
      .from("event_media")
      .select("storage_path")
      .order("created_at", { ascending: false })
      .limit(60);

    if (mediaRows && mediaRows.length > 0) {
      // eslint-disable-next-line react-hooks/purity -- ruta ya forzada dinámica por el auth.getUser() de arriba
      const shuffled = [...mediaRows].sort(() => Math.random() - 0.5);
      const paths = shuffled.slice(0, 8).map((m) => m.storage_path);
      const { data: signedUrls } = await supabase.storage
        .from("event-photos")
        .createSignedUrls(paths, 3600);
      heroPhotoUrls = (signedUrls ?? [])
        .map((s) => s.signedUrl)
        .filter((url): url is string => !!url);
    }

    // "Evento en curso": el próximo evento agendado, para poder confirmar
    // sin tener que ir a buscarlo a /eventos.
    const now = new Date().toISOString();
    const { data: nextEvent } = await supabase
      .from("events")
      .select("id, name, event_date, location, has_futbol")
      .gte("event_date", now)
      .order("event_date", { ascending: true })
      .limit(1)
      .maybeSingle();

    upcomingEvent = nextEvent;

    if (upcomingEvent) {
      const [{ data: eventRsvps }, { count: profilesCount }] = await Promise.all([
        supabase
          .from("event_rsvps")
          .select("kind, status, user_id")
          .eq("event_id", upcomingEvent.id),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
      ]);

      totalPeople = profilesCount ?? 0;
      attendeesJuntada = (eventRsvps ?? []).filter((r) => r.kind === "juntada");
      attendeesFutbol = (eventRsvps ?? []).filter((r) => r.kind === "futbol");

      const myRsvps = (eventRsvps ?? []).filter((r) => r.user_id === user.id);
      myStatus =
        (myRsvps.find((r) => r.kind === "juntada")?.status as
          | "yes"
          | "no"
          | "maybe"
          | undefined) ?? null;
      myFutbolStatus =
        (myRsvps.find((r) => r.kind === "futbol")?.status as
          | "yes"
          | "no"
          | "maybe"
          | undefined) ?? null;
    }
  }

  return (
    <div className="flex-1">
      <div
        className="relative flex flex-col justify-end overflow-hidden px-4 py-12"
        style={{ minHeight: "18rem" }}
      >
        {heroPhotoUrls.length > 0 ? (
          <>
            <PhotoCarousel photoUrls={heroPhotoUrls} />
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  "linear-gradient(to top, var(--background) 5%, transparent 60%)",
              }}
            />
          </>
        ) : (
          <div className="absolute inset-0 bg-grain" />
        )}
        <div className="animate-reveal relative mx-auto w-full max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">
            {user ? "Bienvenido de vuelta" : "JAPapp"}
          </p>
          <h1 className="mt-1 font-heading text-4xl font-semibold text-foreground">
            Hola{user ? "" : ", bienvenido a "}
            {!user && <span className="text-brand">JAPapp</span>}
          </h1>
          <p className="mt-3 max-w-md text-sm text-foreground/60">
            Organizá juntadas, calculá cantidades de asado y empanadas, y
            dividí los gastos entre amigos.
          </p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-2xl px-4 pb-8">
        {user ? (
          <div className="mt-2 flex flex-col gap-3">
            {recentMembers.length > 0 && (
              <Card className="animate-reveal p-4 text-sm">
                🎉 Se sumó{recentMembers.length > 1 ? "n" : ""} a JAPapp:{" "}
                {recentMembers.map((m) => m.name ?? m.email).join(", ")}
              </Card>
            )}

            {upcomingEvent && (
              <Card className="animate-reveal bg-grain border-eventos-mid/40 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-eventos">
                  Evento en curso
                </p>
                <Link href={`/eventos/${upcomingEvent.id}`} className="block">
                  <h2 className="mt-1 font-heading text-xl font-semibold text-foreground">
                    {upcomingEvent.name}
                  </h2>
                  <p className="mt-1 text-sm text-foreground/60">
                    {dateFormatter.format(new Date(upcomingEvent.event_date))}
                    {upcomingEvent.location ? ` · ${upcomingEvent.location}` : ""}
                  </p>
                </Link>
                <AttendanceSummary
                  attendees={attendeesJuntada}
                  totalPeople={totalPeople}
                />

                <div className="mt-4">
                  <p className="text-xs font-medium text-foreground/50">
                    ¿Vas a la juntada?
                  </p>
                  <div className="mt-1.5">
                    <RsvpButtons
                      eventId={upcomingEvent.id}
                      kind="juntada"
                      currentStatus={myStatus}
                    />
                  </div>
                </div>

                {upcomingEvent.has_futbol && (
                  <div className="mt-4">
                    <p className="text-xs font-medium text-foreground/50">
                      ⚽ ¿Jugás al fútbol?
                    </p>
                    <AttendanceSummary
                      attendees={attendeesFutbol}
                      totalPeople={totalPeople}
                    />
                    <div className="mt-1.5">
                      <RsvpButtons
                        eventId={upcomingEvent.id}
                        kind="futbol"
                        currentStatus={myFutbolStatus}
                      />
                    </div>
                  </div>
                )}
              </Card>
            )}

            {FEATURES.map((feature, index) => (
              <Link key={feature.href} href={feature.href}>
                <Card
                  className="animate-reveal flex items-center gap-4 p-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-md active:bg-background"
                  style={{ animationDelay: `${100 + index * 60}ms` }}
                >
                  <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${feature.colorClasses}`}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.75}
                      className="h-6 w-6"
                      aria-hidden="true"
                    >
                      {feature.icon}
                    </svg>
                  </span>
                  <span>
                    <span className="block font-medium">{feature.title}</span>
                    <span className="block text-sm text-foreground/60">
                      {feature.description}
                    </span>
                  </span>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-2">
            <Link href="/login">
              <Button>Iniciar sesión</Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
