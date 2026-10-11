import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { rankingHref, type ArcadeGame } from "@/lib/arcade/games";

// Presentación de /arcade (sin datos propios: la página le pasa los juegos).
export function ArcadeHome({ games }: { games: readonly ArcadeGame[] }) {
  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">Minijuegos</p>
      <h1 className="mt-1 font-heading text-3xl font-semibold text-foreground">JAPArcade</h1>
      <p className="mt-2 text-sm text-foreground/60">
        Juegos para el rato libre, con ranking semanal e histórico entre todos los del grupo.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {games.map((game, index) => (
          <Card
            key={game.id}
            className="animate-reveal overflow-hidden transition duration-200 hover:-translate-y-0.5 hover:shadow-md"
            style={{ animationDelay: `${index * 60}ms` }}
          >
            <Link href={game.href} className="block">
              {/* eslint-disable-next-line @next/next/no-img-element -- portada estática de /public */}
              <img src={game.cover} alt="" className="aspect-video w-full object-cover" />
              <div className="px-4 pt-3">
                <h2 className="font-heading text-xl font-semibold">{game.name}</h2>
                <p className="mt-0.5 text-sm text-foreground/60">{game.description}</p>
              </div>
            </Link>
            <div className="flex items-center gap-4 px-4 py-3 text-sm font-medium">
              <Link href={game.href} className="text-brand hover:underline">
                Jugar
              </Link>
              <Link href={rankingHref(game)} className="text-foreground/60 hover:underline">
                Ranking
              </Link>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
