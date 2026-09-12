import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

const FEATURES = [
  {
    href: "/eventos",
    title: "Eventos",
    description: "Organizá juntadas y confirmá quién va.",
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

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <h1 className="text-2xl font-medium tracking-tight text-coral-ink dark:text-coral-mid">
        Hola{user ? "" : ", bienvenido a JAPapp"}
      </h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Organizá juntadas, calculá cantidades de asado y empanadas, y dividí
        los gastos entre amigos.
      </p>

      {user ? (
        <div className="mt-6 flex flex-col gap-3">
          {FEATURES.map((feature) => (
            <Link key={feature.href} href={feature.href}>
              <Card className="flex items-center gap-4 p-4 transition-colors duration-200 active:bg-coral-soft dark:active:bg-zinc-800">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-coral-soft text-coral dark:bg-zinc-800 dark:text-coral-mid">
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
                  <span className="block text-sm text-zinc-500 dark:text-zinc-400">
                    {feature.description}
                  </span>
                </span>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <div className="mt-8">
          <Link href="/login">
            <Button>Iniciar sesión con Google</Button>
          </Link>
        </div>
      )}
    </div>
  );
}
