import { createClient } from "@/lib/supabase/server";
import { EditAliasForm } from "./EditAliasForm";
import { EditNameForm } from "./EditNameForm";
import { UploadAvatarForm } from "./UploadAvatarForm";
import { AttendanceStatsCard } from "@/components/eventos/AttendanceStatsCard";
import { PushNotificationToggle } from "@/components/PushNotificationToggle";
import { calcularAsistencia, contarEventosElegibles } from "@/lib/eventos/attendance";

export default async function PerfilPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <p className="text-sm text-foreground/60">
          Iniciá sesión para ver tu perfil.
        </p>
      </div>
    );
  }

  const [{ data: profile }, { data: rsvps }, { data: events }] = await Promise.all([
    supabase
      .from("profiles")
      .select("name, email, alias, avatar_url, created_at")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("event_rsvps").select("kind, status").eq("user_id", user.id),
    supabase.from("events").select("event_date, has_futbol"),
  ]);
  const eligible = profile
    ? contarEventosElegibles(
        (events ?? []).map((e) => ({ eventDate: e.event_date, hasFutbol: e.has_futbol })),
        profile.created_at,
      )
    : undefined;
  const attendance = calcularAsistencia(rsvps ?? [], eligible);

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">
        Tu cuenta
      </p>
      <h1 className="mt-1 font-heading text-3xl font-semibold text-foreground">
        Mi perfil
      </h1>

      <div className="mt-6 rounded-xl border border-surface-border bg-surface p-5">
        <UploadAvatarForm
          userId={user.id}
          name={profile?.name ?? null}
          avatarUrl={profile?.avatar_url ?? null}
        />
        <EditNameForm defaultName={profile?.name ?? ""} />
        <p className="mt-3 text-xs text-foreground/50">{profile?.email}</p>
      </div>

      <div className="mt-6">
        <EditAliasForm defaultAlias={profile?.alias ?? ""} />
      </div>

      <div className="mt-6 rounded-xl border border-surface-border bg-surface p-5">
        <p className="text-sm font-medium text-foreground">Notificaciones</p>
        <div className="mt-2">
          <PushNotificationToggle />
        </div>
      </div>

      <AttendanceStatsCard attendance={attendance} />
    </div>
  );
}
