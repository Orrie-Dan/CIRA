import type { DivIcon } from 'leaflet'

let L: typeof import('leaflet') | null = null
let leafletLoaded = false

export async function loadLeaflet() {
  if (typeof window === 'undefined' || leafletLoaded) return L

  L = await import('leaflet')
  await import('leaflet/dist/leaflet.css')

  delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl
  L.Icon.Default.mergeOptions({
    iconRetinaUrl:
      'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl:
      'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl:
      'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  })

  leafletLoaded = true
  return L
}

export function createSeverityIcon(severity: string): DivIcon | null {
  if (!L) return null

  const color =
    severity === 'high' ? '#ef4444' : severity === 'medium' ? '#f97316' : '#2563eb'

  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="background-color: ${color}; width: 20px; height: 20px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  })
}
