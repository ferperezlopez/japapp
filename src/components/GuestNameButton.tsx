"use client";

import { useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { EditGuestNameModal } from "@/components/EditGuestNameModal";

// Así como tocar a un miembro lleva a su perfil, tocar a un invitado
// debería dejar editar su nombre — pero solo admins pueden hacerlo
// (decisión explícita del usuario, misma policy RLS que insumo_items.icon).
// Para quien no es admin, se muestra el mismo avatar+nombre sin ningún
// affordance de click (mismo criterio que ocultar, no deshabilitar,
// acciones admin-only ya usado en el resto del repo).
export function GuestNameButton({
  guestId,
  name,
  isAdmin,
  className = "flex items-center gap-1.5",
}: {
  guestId: string;
  name: string;
  isAdmin: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  if (!isAdmin) {
    return (
      <span className={className}>
        <Avatar src={null} name={name} size="sm" />
        {name}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Editar invitado"
        className={`${className} hover:underline`}
      >
        <Avatar src={null} name={name} size="sm" />
        {name}
      </button>
      {open && (
        <EditGuestNameModal
          guestId={guestId}
          currentName={name}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
