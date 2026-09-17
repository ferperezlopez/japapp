import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ZoomableAvatar } from "@/components/ui/ZoomableAvatar";
import { CopyableText } from "@/components/ui/CopyableText";
import { AttendanceStatsCard } from "@/components/eventos/AttendanceStatsCard";
import { calcularAsistencia } from "@/lib/eventos/attendance";
import { AdminEditProfileForm } from "./AdminEditProfileForm";
import { AdminUploadAvatarForm } from "./AdminUploadAvatarForm";

export default async function UserProfilePage({
  params,
}: PageProps<"/perfil/[userId]">) {
  const { userId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  // La propia foto ya se edita en /perfil — evitamos una segunda vista de
  // solo lectura de uno mismo.
  if (userId === user.id) redirect("/perfil");

  const [{ data: me }, { data: profile }, { data: rsvps }] = await Promise.all([
    supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle(),
    supabase
      .from("profiles")
      .select("name, email, alias, avatar_url")
      .eq("id", userId)
      .maybeSingle(),
    supabase.from("event_rsvps").select("kind, status").eq("user_id", userId),
  ]);

  if (!profile) notFound();

  const isAdmin = me?.is_admin ?? false;
  const attendance = calcularAsistencia(rsvps ?? []);

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">
        Perfil
      </p>
      <div className="mt-4 flex items-center gap-4 rounded-xl border border-surface-border bg-surface p-5">
        {isAdmin ? (
          <AdminUploadAvatarForm
            targetUserId={userId}
            name={profile.name}
            avatarUrl={profile.avatar_url}
          />
        ) : (
          <>
            <ZoomableAvatar
              src={profile.avatar_url}
              name={profile.name}
              size="lg"
            />
            <div>
              <p className="font-heading text-xl font-semibold text-foreground">
                {profile.name ?? profile.email}
              </p>
              {profile.alias && (
                <p className="text-xs text-foreground/50">
                  Alias de pago:{" "}
                  <CopyableText text={profile.alias} className="text-foreground/70">
                    {profile.alias}
                  </CopyableText>
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {isAdmin && (
        <AdminEditProfileForm
          userId={userId}
          defaultName={profile.name ?? ""}
          defaultAlias={profile.alias ?? ""}
        />
      )}

      <AttendanceStatsCard attendance={attendance} />
    </div>
  );
}
