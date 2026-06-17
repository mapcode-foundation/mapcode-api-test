export interface LatLon {
  lat: number;
  lon: number;
}

export function distanceMeters(a: LatLon, b: LatLon): number {
  const radiusMeters = 6_371_000;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * radiusMeters * Math.asin(Math.min(1, Math.sqrt(h)));
}

function toRad(value: number): number {
  return (value * Math.PI) / 180;
}
