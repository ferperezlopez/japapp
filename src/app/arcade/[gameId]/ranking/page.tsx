import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEnabledArcadeGame } from "@/lib/arcade/games";
import { getLeaderboard } from "@/lib/arcade/scores";
import type { ArcadePeriod } from "@/lib/arcade/types";
import { formatArcadeWeek } from "@/lib/arcade/week";
import { RankingView } from "./RankingView";

export default async function RankingPage({
  params,
  searchParams,
}: {
  params: Promise<{ gameId: string }>;
  searchParams: Promise<{ periodo?: string }>;
}) {
  const { gameId } = await params;
  const { periodo } = await searchParams;

  const game = getEnabledArcadeGame(gameId);
  if (!game) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/arcade/${game.id}/ranking`);

  const period: ArcadePeriod = periodo === "historico" ? "all" : "weekly";
  const result = await getLeaderboard(supabase, game.id, period);

  return (
    <RankingView
      game={game}
      period={period}
      entries={result.ok ? result.entries : []}
      loadFailed={!result.ok}
      meId={user.id}
      weekLabel={formatArcadeWeek(new Date())}
    />
  );
}
