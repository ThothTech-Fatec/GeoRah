export function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Raio da Terra em metros
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export function getCoordKey(lat: number, lng: number): string {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

export function getNearestPointOnSegment(
  pLat: number, pLng: number, 
  aLat: number, aLng: number, 
  bLat: number, bLng: number
): { latitude: number, longitude: number } {
  // Converte para coordenadas "cartesianas" aproximadas para cálculo vetorial simples
  // (Funciona bem para pequenas distâncias como snap-to-road)
  const x = pLng;
  const y = pLat;
  const x1 = aLng;
  const y1 = aLat;
  const x2 = bLng;
  const y2 = bLat;

  const A = x - x1;
  const B = y - y1;
  const C = x2 - x1;
  const D = y2 - y1;

  const dot = A * C + B * D;
  const len_sq = C * C + D * D;
  
  // Parametro t da projeção (0 = Ponto A, 1 = Ponto B)
  let param = -1;
  if (len_sq !== 0) param = dot / len_sq;

  let xx, yy;

  if (param < 0) {
    // Caiu antes do segmento -> O ponto mais próximo é A
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    // Caiu depois do segmento -> O ponto mais próximo é B
    xx = x2;
    yy = y2;
  } else {
    // Caiu no meio -> Calcula a projeção exata
    xx = x1 + param * C;
    yy = y1 + param * D;
  }

  return { latitude: yy, longitude: xx };
  
}

export function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${Math.round(meters)} m`;
}

export function estimateDuration(meters: number, speedKmH: number = 30): string {
  const hours = meters / 1000 / speedKmH;
  const totalMinutes = Math.round(hours * 60);

  if (totalMinutes < 1) return "Menos de 1 min";
  if (totalMinutes < 60) return `${totalMinutes} min`;
  
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}