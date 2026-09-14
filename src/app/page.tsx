import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { RsvpButtons } from "@/components/eventos/RsvpButtons";

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
] as const;

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let heroPhotoUrl: string | null = null;
  let upcomingEvent: {
    id: string;
    name: string;
    event_date: string;
    location: string | null;
    has_futbol: boolean;
  } | null = null;
  let myStatus: "yes" | "no" | "maybe" | null = null;
  let myFutbolStatus: "yes" | "no" | "maybe" | null = null;

  if (user) {
    const { data: media } = await supabase
      .from("event_media")
      .select("storage_path")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (media) {
      const { data: signed } = await supabase.storage
        .from("event-photos")
        .createSignedUrl(media.storage_path, 3600);
      heroPhotoUrl = signed?.signedUrl ?? null;
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
      const { data: myRsvps } = await supabase
        .from("event_rsvps")
        .select("kind, status")
        .eq("event_id", upcomingEvent.id)
        .eq("user_id", user.id);

      myStatus =
        (myRsvps?.find((r) => r.kind === "juntada")?.status as
          | "yes"
          | "no"
          | "maybe"
          | undefined) ?? null;
      myFutbolStatus =
        (myRsvps?.find((r) => r.kind === "futbol")?.status as
          | "yes"
          | "no"
          | "maybe"
          | undefined) ?? null;
    }
  }

  return (
    <div className="flex-1">
      <div
        className={`relative flex flex-col justify-end px-4 py-12 ${heroPhotoUrl ? "" : "bg-grain"}`}
        style={
          heroPhotoUrl
            ? {
                backgroundImage: `linear-gradient(to top, var(--background) 5%, transparent 60%), url(${heroPhotoUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                minHeight: "18rem",
              }
            : undefined
        }
      >
        <div className="animate-reveal mx-auto w-full max-w-2xl">
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
              <Button>Iniciar sesión con Google</Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
