// El campo "dirección" de un venue acepta dos formatos: texto libre (una
// calle real, ej. "Av. Cabildo 2394, CABA") o un link de Google Maps ya
// resuelto (los que arma "Compartir ubicación" desde la app — del tipo
// https://maps.app.goo.gl/... o https://www.google.com/maps/place/...).
// Si ya es un link, se usa tal cual: Google ya sabe a qué lugar apunta, y
// pasarlo dentro de `destination=` como si fuera texto rompe la búsqueda
// (el geocoder lo trata como texto literal, no como una URL a resolver —
// "No se encuentra una ruta para llegar a ese destino"). Si es texto
// plano, se arma el link de navegación "Directions" (api=1, sin API key)
// para que Google lo geocodifique.
export function buildMapsLink(address: string): string {
  const trimmed = address.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(trimmed)}`;
}
