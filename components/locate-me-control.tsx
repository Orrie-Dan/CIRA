"use client"

// Client-only: import with next/dynamic({ ssr: false }) and render inside a
// react-leaflet <MapContainer>.
import { useEffect, useRef, useState } from "react"
import L from "leaflet"
import { useMap } from "react-leaflet"
import { LocateFixed, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

// Rwanda's approximate bounding box (same as the API's reverse geocoder).
const RWANDA_BOUNDS = L.latLngBounds([-2.84, 28.86], [-1.05, 30.9])

export interface LocatedPosition {
  lat: number
  lng: number
  /** Radius in metres of the 68% confidence circle. */
  accuracy: number
}

function getPosition(options: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, options))
}

/** High accuracy first (GPS/Wi-Fi); fall back to a coarse fix if that times out or is unavailable. */
async function locate(): Promise<GeolocationPosition> {
  try {
    return await getPosition({ enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 })
  } catch (err) {
    const e = err as GeolocationPositionError
    if (e.code === e.PERMISSION_DENIED) throw err
    return getPosition({ enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 })
  }
}

function errorMessage(err: unknown): string {
  const e = err as GeolocationPositionError
  switch (e?.code) {
    case 1:
      return "Location access is blocked. Allow it for this site in your browser settings, then try again."
    case 2:
      return "Your device couldn't determine its location. Check that location services are on."
    case 3:
      return "Finding your location took too long. Try again, or click the map instead."
    default:
      return "Couldn't get your location. Click the map to pick the spot instead."
  }
}

function formatDistance(metres: number): string {
  return metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.round(metres)} m`
}

/**
 * "Locate me" map button: shows your position with its accuracy circle and
 * zooms to it. `onLocated` is called only for positions inside Rwanda.
 */
export function LocateMeControl({
  onLocated,
  className,
}: {
  onLocated?: (position: LocatedPosition) => void
  className?: string
}) {
  const map = useMap()
  const [locating, setLocating] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)

  // The button sits inside the map container: keep its clicks from reaching
  // the map (which would drop a report pin under the button).
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    L.DomEvent.disableClickPropagation(el)
    L.DomEvent.disableScrollPropagation(el)
  }, [])

  useEffect(() => {
    const layer = L.layerGroup().addTo(map)
    layerRef.current = layer
    return () => {
      layer.remove()
      layerRef.current = null
    }
  }, [map])

  const handleClick = async () => {
    if (!("geolocation" in navigator)) {
      toast({ title: "Location unavailable", description: "This browser doesn't support location. Click the map instead." })
      return
    }
    if (!window.isSecureContext) {
      toast({ title: "Location unavailable", description: "Location only works over HTTPS. Click the map instead." })
      return
    }

    setLocating(true)
    try {
      const pos = await locate()
      const { latitude: lat, longitude: lng, accuracy } = pos.coords
      const here = L.latLng(lat, lng)

      const layer = layerRef.current
      if (layer) {
        layer.clearLayers()
        L.circle(here, {
          radius: accuracy,
          color: "#2563eb",
          weight: 1,
          fillColor: "#3b82f6",
          fillOpacity: 0.12,
          interactive: false,
        }).addTo(layer)
        L.circleMarker(here, {
          radius: 7,
          color: "#ffffff",
          weight: 2,
          fillColor: "#2563eb",
          fillOpacity: 1,
          interactive: false,
        }).addTo(layer)
      }
      map.flyToBounds(here.toBounds(Math.max(accuracy * 2, 200)), { maxZoom: 17, duration: 0.8 })

      if (!RWANDA_BOUNDS.contains(here)) {
        toast({ title: "You're outside Rwanda", description: "Reports can only be filed for locations in Rwanda. Click the map to pick a spot." })
        return
      }
      if (accuracy > 1000) {
        toast({
          title: "Approximate location",
          description: `Your browser could only place you within about ${formatDistance(accuracy)}. Click the map to set the exact spot.`,
        })
      }
      onLocated?.({ lat, lng, accuracy })
    } catch (err) {
      toast({ title: "Location unavailable", description: errorMessage(err), variant: "destructive" })
    } finally {
      setLocating(false)
    }
  }

  return (
    <div ref={containerRef} className={cn("absolute top-4 right-4 z-[1000]", className)}>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="shadow-md"
        onClick={handleClick}
        disabled={locating}
        aria-label="Show my location on the map"
      >
        {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
        {locating ? "Locating..." : "Locate me"}
      </Button>
    </div>
  )
}
