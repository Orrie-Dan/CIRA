'use client'

import type { Dispatch, SetStateAction } from 'react'
import { type AdminReport } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Eye, MapPin } from 'lucide-react'
import { format } from 'date-fns'
import dynamic from 'next/dynamic'
import { createSeverityIcon } from '../_lib/map-utils'

const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false })
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false })
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false })
const Popup = dynamic(() => import('react-leaflet').then(mod => mod.Popup), { ssr: false })

export interface ReportsMapViewProps {
  reports: AdminReport[]
  loading: boolean
  mapReady: boolean
  showMapView: boolean
  setShowMapView: Dispatch<SetStateAction<boolean>>
  handleViewReport: (report: AdminReport) => Promise<void>
  filteredReports: AdminReport[]
  mapCenterAndBounds: { center: [number, number]; zoom: number; bounds?: undefined; } | { center: [number, number]; zoom: number; bounds: [[number, number], [number, number]]; }
  getSeverityBadgeClassName: (severity: string) => "bg-red-500/10 text-red-400 border-red-500/20" | "bg-orange-500/10 text-orange-400 border-orange-500/20" | "bg-blue-500/10 text-blue-400 border-blue-500/20" | "bg-slate-500/10 text-slate-400 border-slate-500/20"
  getStatusBadgeClassName: (status: string) => "bg-slate-500/10 text-slate-400 border-slate-500/20" | "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" | "bg-purple-500/10 text-purple-400 border-purple-500/20" | "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" | "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" | "bg-green-500/10 text-green-400 border-green-500/20" | "bg-red-600/10 text-red-500 border-red-600/20"
}

export function ReportsMapView({ reports, loading, mapReady, showMapView, setShowMapView, handleViewReport, filteredReports, mapCenterAndBounds, getSeverityBadgeClassName, getStatusBadgeClassName }: ReportsMapViewProps) {
  return (
    <>
    {/* Map View */}
    {!loading && reports.length > 0 && (
      <Card className="bg-gradient-to-br from-slate-900 to-slate-800 border-slate-700 hover:border-slate-600 transition-all">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="text-white text-lg">Reports Map View</CardTitle>
              <CardDescription className="text-slate-400">
                Visualize all reports on an interactive map
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowMapView(!showMapView)}
              className="bg-slate-800/50 border-slate-700 text-white hover:bg-slate-700 hover:border-slate-600 transition-all"
            >
              <MapPin className="h-4 w-4 mr-2" />
              {showMapView ? 'Hide Map' : 'Show Map'}
            </Button>
          </div>
        </CardHeader>
        {showMapView && (
          <CardContent>
            <div className="h-[600px] w-full rounded-lg overflow-hidden border border-slate-800">
              <MapContainer
                center={mapCenterAndBounds.center}
                zoom={mapCenterAndBounds.zoom}
                style={{ height: '100%', width: '100%' }}
                scrollWheelZoom={true}
                key={`${mapCenterAndBounds.center[0]}-${mapCenterAndBounds.center[1]}-${mapCenterAndBounds.zoom}`}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {mapReady && filteredReports
                  .filter(r => r.latitude && r.longitude)
                  .map((report) => {
                    const icon = createSeverityIcon(report.severity)
                    if (!icon) return null
                    return (
                      <Marker
                        key={report.id}
                        position={[report.latitude!, report.longitude!]}
                        icon={icon}
                      >
                        <Popup
                          autoPan={true}
                          autoPanPadding={[50, 50]}
                          autoPanPaddingTopLeft={[0, 150]}
                          autoPanPaddingBottomRight={[50, 50]}
                          maxWidth={300}
                          closeButton={true}
                          className="leaflet-popup-custom"
                        >
                          <div className="p-3 min-w-[200px] max-w-[280px]">
                            <h4 className="font-semibold mb-2 text-sm text-slate-900">{report.title}</h4>
                            <div className="space-y-2 text-xs">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge className={`${getSeverityBadgeClassName(report.severity)} border text-xs px-2 py-1 min-w-[80px] text-center inline-block`}>
                                  {report.severity}
                                </Badge>
                                <Badge className={`${getStatusBadgeClassName(report.status)} border text-xs px-2 py-1 min-w-[80px] text-center inline-block`}>
                                  {report.status}
                                </Badge>
                              </div>
                              <p className="text-slate-600 line-clamp-2">{report.description}</p>
                              {report.district && (
                                <p className="text-slate-500 flex items-center gap-1">
                                  <MapPin className="h-3 w-3" />
                                  {report.district}
                                </p>
                              )}
                              <p className="text-slate-500 text-xs">
                                {format(new Date(report.createdAt), 'MMM d, yyyy')}
                              </p>
                              <Button
                                size="sm"
                                variant="outline"
                                className="w-full mt-2"
                                onClick={() => handleViewReport(report)}
                              >
                                <Eye className="h-3 w-3 mr-1" />
                                View Details
                              </Button>
                            </div>
                          </div>
                        </Popup>
                      </Marker>
                    )
                  })
                  .filter(Boolean)}
              </MapContainer>
            </div>
            <div className="mt-4 flex items-center gap-4 flex-wrap text-sm text-slate-400">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <span>High Severity</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <span>Medium Severity</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span>Low Severity</span>
              </div>
              <span className="ml-auto">
                {reports.filter(r => r.latitude && r.longitude).length} reports with location data
              </span>
            </div>
          </CardContent>
        )}
      </Card>
    )}
    </>
  )
}
