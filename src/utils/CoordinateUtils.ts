export type LatLng = { lat: number; lng: number };

const ORIGIN: LatLng = { lat: 44.9778, lng: -93.2650 };
const METERS_PER_DEG_LAT = 111_320;
const METERS_PER_DEG_LNG = 111_320 * Math.cos((ORIGIN.lat * Math.PI) / 180);

export function latLngToMeters(lat: number, lng: number): { x: number; z: number } {
  const dx = (lng - ORIGIN.lng) * METERS_PER_DEG_LNG;
  const dz = (lat - ORIGIN.lat) * METERS_PER_DEG_LAT;
  return { x: dx, z: -dz };
}

export function metersToLatLng(x: number, z: number): LatLng {
  const lng = x / METERS_PER_DEG_LNG + ORIGIN.lng;
  const lat = -z / METERS_PER_DEG_LAT + ORIGIN.lat;
  return { lat, lng };
}

export function getOrigin(): LatLng {
  return ORIGIN;
}
