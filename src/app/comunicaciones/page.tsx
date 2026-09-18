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

  // push_subscriptions solo deja ver las propias filas por RLS — para
  // listar quién de todo el grupo activó las notificaciones hace falta
  // la función security definer get_push_subscriber_ids (ver
  // 0029_admin_list_push_subscribers.sql), que valida is_admin adentro.
  const [{ data: members }, { data: subscribers }] = await Promise.all([
    supabase.from("profiles").select("id, name, email").order("name"),
    supabase.rpc("get_push_subscriber_ids"),
  ]);

  const subscribedIds = new Set((subscribers ?? []).map((s) => s.user_id));
  const optedInCount = (members ?? []).filter((m) => subscribedIds.has(m.id)).length;

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

      <div className="mt-6 rounded-xl border border-surface-border bg-surface p-4 text-sm">
        <p className="font-medium text-foreground">Quién recibe notificaciones</p>
        <p className="mt-1 text-xs text-foreground/50">
          {optedInCount} de {(members ?? []).length} miembros activaron las
          notificaciones.
        </p>
        <ul className="mt-2 divide-y divide-surface-border">
          {(members ?? []).map((member) => {
            const optedIn = subscribedIds.has(member.id);
            return (
              <li key={member.id} className="flex items-center justify-between py-1.5">
                <span className="text-foreground">{member.name ?? member.email}</span>
                {optedIn ? (
                  <span className="text-xs font-medium text-green-600 dark:text-green-400">
                    🔔 Activadas
                  </span>
                ) : (
                  <span className="text-xs text-foreground/40">🔕 No activadas</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mt-6">
        <AdminCommsForm members={members ?? []} subscribedIds={[...subscribedIds]} />
      </div>
    </div>
  );
}
