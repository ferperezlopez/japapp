import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ARCADE_GAMES } from "@/lib/arcade/games";
import { ArcadeHome } from "./ArcadeHome";

export default async function ArcadePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/arcade");

  return <ArcadeHome games={ARCADE_GAMES.filter((game) => game.enabled)} />;
}
