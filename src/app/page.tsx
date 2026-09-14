import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

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
