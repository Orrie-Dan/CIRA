"use client"

// Leaflet touches `window` at import time, so this module must only be loaded
// client-side: import these controls with next/dynamic and `ssr: false`.
import { useMap, useMapEvents } from "react-leaflet"
import type { LeafletMouseEvent } from "leaflet"
import { Button } from "@/components/ui/button"
import { toast } from "@/hooks/use-toast"

/** Calls `onMapClick` with the clicked coordinates. Render inside a MapContainer. */
export function MapClickHandler({
  onMapClick,
}: {
  onMapClick: (lat: number, lng: number) => void
}) {
  useMapEvents({
    click: (e: LeafletMouseEvent) => {
      onMapClick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

/** "Locate me" button that flies the map to the browser's position. Render inside a MapContainer. */
export function LocateControl() {
  const map = useMap()
  return (
    <Button
      variant="secondary"
      size="sm"
      className="absolute top-4 right-4 z-[1000]"
      onClick={() => {
        if (!navigator.geolocation) return
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const { latitude, longitude } = pos.coords
            map.flyTo([latitude, longitude], 15)
          },
          (err) => {
            toast({
              title: "Location unavailable",
              description: err.message || "Please allow location access.",
            })
          },
          { enableHighAccuracy: true, timeout: 10000 }
        )
      }}
    >
      Locate me
    </Button>
  )
}
