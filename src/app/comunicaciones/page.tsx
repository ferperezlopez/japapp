import { createClient } from "@/lib/supabase/server";
import { AdminCommsForm } from "./AdminCommsForm";

export default async function ComunicacionesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <p className="text-sm text-foreground/60">Iniciá sesión para ver esta sección.</p>
      </div>
    );
  }

  const { data: me } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!me?.is_admin) {
    return (
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <p className="text-sm text-foreground/60">
          No tenés permisos para ver esta sección.
        </p>
      </div>
    );
  }

  const { data: members } = await supabase
    .from("profiles")
    .select("id, name, email")
    .order("name");

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-ink">
        Admin
      </p>
      <h1 className="mt-1 font-heading text-3xl font-semibold text-foreground">
        Comunicaciones
      </h1>
      <p className="mt-2 text-sm text-foreground/60">
        Mandá una notificación push a todo el grupo o a un grupo elegido de
        miembros. Solo le llega a quien haya activado las notificaciones
        desde su perfil.
      </p>

      <div className="mt-6">
        <AdminCommsForm members={members ?? []} />
      </div>
    </div>
  );
}
