import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEnabledArcadeGame } from "@/lib/arcade/games";
import { GUSTY_SNAKE_GAME_ID } from "@/lib/arcade/gustySnake/config";
import { getPersonalBest } from "@/lib/arcade/scores";
import { GustySnakeGame } from "./GustySnakeGame";

export default async function GustySnakePage() {
  // Si el juego se deshabilita en el registro, su ruta deja de existir.
  if (!getEnabledArcadeGame(GUSTY_SNAKE_GAME_ID)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/arcade/${GUSTY_SNAKE_GAME_ID}`);

  const personalBest = await getPersonalBest(supabase, GUSTY_SNAKE_GAME_ID, user.id);
  return <GustySnakeGame personalBest={personalBest} />;
}
