import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { AttendanceStatsLines } from "@/components/eventos/AttendanceStatsCard";
import { calcularAsistencia, type RsvpForAttendance } from "@/lib/eventos/attendance";
import { startImpersonation } from "@/app/actions/impersonation";

export default async function MiembrosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <p className="text-sm text-foreground/60">
          Iniciá sesión para ver a los miembros del grupo.
        </p>
      </div>
    );
  }

  const [{ data: me }, { data: members }, { data: rsvps }] = await Promise.all([
    supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle(),
    supabase
      .from("profiles")
      .select("id, name, email, avatar_url")
      .order("name"),
    supabase.from("event_rsvps").select("user_id, kind, status"),
  ]);
  const isAdmin = me?.is_admin ?? false;

  // Cada persona linkea a /perfil/[userId] — esa ruta ya redirige a /perfil
  // cuando el id es el propio, así que acá no hace falta distinguir "uno
  // mismo" del resto (mismo criterio ya usado en /gastos/[groupId]).
  const rsvpsByUser = new Map<string, RsvpForAttendance[]>();
  for (const r of rsvps ?? []) {
    const list = rsvpsByUser.get(r.user_id) ?? [];
    list.push({ kind: r.kind, status: r.status });
    rsvpsByUser.set(r.user_id, list);
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">
        Grupo
      </p>
      <h1 className="mt-1 font-heading text-3xl font-semibold text-foreground">
        Miembros
      </h1>
      <p className="mt-2 text-sm text-foreground/60">
        Todos los del grupo, con su asistencia a la JAPA y al fútbol.
      </p>

      <div className="mt-6 space-y-2">
        {(members ?? []).map((m, index) => {
          const attendance = calcularAsistencia(rsvpsByUser.get(m.id) ?? []);
          return (
            <Card
              key={m.id}
              className="animate-reveal flex items-center gap-3 px-4 py-3 transition duration-200 hover:-translate-y-0.5 hover:bg-brand-soft hover:shadow-md"
              style={{ animationDelay: `${index * 60}ms` }}
            >
              <Link
                href={`/perfil/${m.id}`}
                className="flex flex-1 items-center gap-3"
              >
                <Avatar src={m.avatar_url} name={m.name ?? m.email} size="md" />
                <div>
                  <p className="font-medium">{m.name ?? m.email}</p>
                  <AttendanceStatsLines attendance={attendance} />
                </div>
              </Link>
              {isAdmin && m.id !== user.id && (
                <form
                  action={async () => {
                    "use server";
                    await startImpersonation(m.id);
                  }}
                >
                  <button
                    type="submit"
                    className="shrink-0 rounded-full border border-surface-border px-3 py-1.5 text-xs font-medium text-foreground/60 transition-colors duration-200 hover:bg-surface"
                  >
                    Actuar como
                  </button>
                </form>
              )}
            </Card>
          );
        })}
        {(members ?? []).length === 0 && (
          <p className="text-sm text-foreground/50">No hay miembros todavía.</p>
        )}
      </div>
    </div>
  );
}
