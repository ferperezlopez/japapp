// «Pocas muestras»: con menos de 3 eventos pasados los promedios, las medianas
// entre eventos y las variaciones son indicativos, no una tendencia.
export function SampleNotice({ pastEvents }: { pastEvents: number }) {
  if (pastEvents === 0 || pastEvents >= 3) return null;
  return (
    <p className="mt-4 rounded-xl border border-amber-mid bg-amber-soft px-3 py-2 text-xs text-amber-ink">
      <strong className="font-semibold">Pocas muestras:</strong> hay{" "}
      {pastEvents === 1 ? "1 evento pasado" : `${pastEvents} eventos pasados`}, así que los
      porcentajes y las comparaciones son solo indicativos. Mejoran con cada JAPA.
    </p>
  );
}
