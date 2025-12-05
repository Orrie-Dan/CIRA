'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FileSearch, AlertCircle, MapPin, Calendar, CheckCircle2, Clock, XCircle, Image as ImageIcon, RefreshCw } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { apiGetReport, type ApiReport } from '@/lib/api'
import { format } from 'date-fns'

// Helper function to get status color
const getStatusColor = (status: string) => {
  switch (status) {
    case 'new':
      return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
    case 'triaged':
      return 'bg-purple-500/10 text-purple-400 border-purple-500/20'
    case 'assigned':
      return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
    case 'in_progress':
      return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
    case 'resolved':
      return 'bg-green-500/10 text-green-400 border-green-500/20'
    case 'rejected':
      return 'bg-red-600/10 text-red-500 border-red-600/20'
    default:
      return 'bg-slate-500/10 text-slate-400 border-slate-500/20'
  }
}

// Helper function to get status icon
const getStatusIcon = (status: string) => {
  switch (status) {
    case 'resolved':
      return <CheckCircle2 className="h-5 w-5" />
    case 'rejected':
      return <XCircle className="h-5 w-5" />
    case 'in_progress':
      return <Clock className="h-5 w-5" />
    default:
      return <Clock className="h-5 w-5" />
  }
}

// Helper function to get type display name
const getTypeDisplayName = (type: string): string => {
  const typeDisplayNames: Record<string, string> = {
    'pothole': 'Pothole',
    'streetlight': 'Streetlight',
    'sidewalk': 'Sidewalk',
    'drainage': 'Drainage',
    'other': 'Other',
    'roads': 'Roads',
    'bridges': 'Bridges',
    'water': 'Water',
    'power': 'Power',
    'sanitation': 'Sanitation',
    'telecom': 'Telecom',
    'public_building': 'Public Building',
  }
  return typeDisplayNames[type] || type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' ')
}

interface ReportWithPhotos extends ApiReport {
  photos?: Array<{ id: string; url: string; caption?: string | null; createdAt: string }>
  latestStatus?: {
    status: string
    note: string | null
    changedAt: string
  } | null
}

function TrackStatusForm() {
  const searchParams = useSearchParams()
  const [reportId, setReportId] = useState('')
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<ReportWithPhotos | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Pre-fill from query parameter
    const idParam = searchParams.get('id')
    if (idParam) {
      setReportId(idParam)
      // Auto-submit if ID is provided in URL
      handleLookup(idParam)
    }
  }, [searchParams])

  const handleLookup = async (idToLookup?: string) => {
    const id = idToLookup || reportId.trim()
    
    if (!id) {
      toast({
        title: 'Error',
        description: 'Please enter a Report ID',
        variant: 'destructive',
      })
      return
    }

    const trimmedId = id.trim().toLowerCase()
    let fullReportId = trimmedId

    // Check if it's a short code (8 characters without dashes)
    if (trimmedId.length === 8 && !trimmedId.includes('-')) {
      // Try to find the full UUID from localStorage
      const storedMapping = localStorage.getItem(`report_${trimmedId.toUpperCase()}`)
      if (storedMapping) {
        fullReportId = storedMapping
      } else {
        setError('Could not find a report with this short code. Please enter your full Report ID.')
        toast({
          title: 'Report Not Found',
          description: 'Could not find a report with this short code. Please enter your full Report ID.',
          variant: 'destructive',
        })
        return
      }
    } else if (trimmedId.length === 36 && trimmedId.includes('-')) {
      // It's a full UUID, use it directly
      fullReportId = trimmedId
    } else {
      setError('Please enter either an 8-character short code or the full Report ID')
      toast({
        title: 'Invalid Format',
        description: 'Please enter either an 8-character short code or the full Report ID',
        variant: 'destructive',
      })
      return
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(fullReportId)) {
      setError('The Report ID format is invalid. Please check and try again.')
      toast({
        title: 'Invalid Report ID',
        description: 'The Report ID format is invalid. Please check and try again.',
        variant: 'destructive',
      })
      return
    }

    setLoading(true)
    setError(null)
    setReport(null)

    try {
      const data = await apiGetReport(fullReportId)
      setReport(data as ReportWithPhotos)
      toast({
        title: 'Report Found',
        description: 'Report status loaded successfully',
      })
    } catch (err: any) {
      setError(err.message || 'Failed to load report. Please check the Report ID and try again.')
      toast({
        title: 'Error',
        description: err.message || 'Failed to load report',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await handleLookup()
  }

  const handleNewSearch = () => {
    setReport(null)
    setReportId('')
    setError(null)
  }

  const getPhotoUrl = (photoUrl: string) => {
    if (photoUrl.startsWith('http')) {
      return photoUrl
    }
    return `${process.env.NEXT_PUBLIC_API_BASE_URL || 'https://cira-backend-1.onrender.com'}${photoUrl}`
  }

  return (
    <div 
      className="min-h-screen py-12 px-4 relative"
      style={{
        backgroundImage: 'url(/Infrastructure.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <div className="container mx-auto max-w-3xl relative z-10 space-y-6">
        {/* Search Form Card */}
        <Card>
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="rounded-full bg-primary/10 p-3">
                <FileSearch className="h-8 w-8 text-primary" />
              </div>
            </div>
            <CardTitle className="text-2xl">Track Report Status</CardTitle>
            <CardDescription>
              Enter your Report ID to view the current status and updates
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="reportId" className="text-sm font-medium">
                  Report ID
                </label>
                <div className="flex gap-2">
                  <Input
                    id="reportId"
                    type="text"
                    placeholder="Enter 8-character code or full Report ID"
                    value={reportId}
                    onChange={(e) => setReportId(e.target.value)}
                    className="font-mono flex-1"
                    disabled={loading}
                  />
                  {report && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleNewSearch}
                      className="shrink-0"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      New Search
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  You can use either the 8-character short code or the full Report ID you received when submitting your report.
                </p>
              </div>

              {!report && (
                <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p className="font-medium">Where to find your Report ID:</p>
                      <ul className="list-disc list-inside space-y-1 ml-2">
                        <li>Check the confirmation message after submitting your report</li>
                        <li>Look for an 8-character code (e.g., A1B2C3D4) or the full ID</li>
                        <li>The short code is easier to remember and share</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Loading...
                  </>
                ) : (
                  'Track Report'
                )}
              </Button>

              {error && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                    <p className="text-sm text-destructive">{error}</p>
                  </div>
                </div>
              )}
            </form>
          </CardContent>
        </Card>

        {/* Report Status Display */}
        {report && (
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <CardTitle className="text-2xl mb-2">{report.title}</CardTitle>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={`${getStatusColor(report.status)} border px-3 py-1 text-xs font-semibold`}>
                      <span className="mr-1.5">{getStatusIcon(report.status)}</span>
                      {report.status.replace('_', ' ').toUpperCase()}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {getTypeDisplayName(report.type)}
                    </Badge>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Description */}
              <div>
                <h3 className="text-sm font-semibold mb-2">Description</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{report.description}</p>
              </div>

              {/* Status Information */}
              {report.latestStatus && (
                <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Last Updated</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(report.latestStatus.changedAt), 'PPpp')}
                  </p>
                  {report.latestStatus.note && (
                    <div className="mt-2 pt-2 border-t">
                      <p className="text-sm text-muted-foreground">
                        <span className="font-medium">Note: </span>
                        {report.latestStatus.note}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Location */}
              <div>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Location
                </h3>
                <p className="text-sm text-muted-foreground">
                  {report.addressText || `${Number(report.latitude).toFixed(6)}, ${Number(report.longitude).toFixed(6)}`}
                </p>
                {(report.province || report.district || report.sector) && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {[report.province, report.district, report.sector].filter(Boolean).join(', ')}
                  </p>
                )}
              </div>

              {/* Report Details */}
              <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Reported On</p>
                  <p className="text-sm font-medium">
                    {format(new Date(report.createdAt), 'PP')}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Severity</p>
                  <p className="text-sm font-medium capitalize">{report.severity}</p>
                </div>
              </div>

              {/* Photos */}
              {report.photos && report.photos.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <ImageIcon className="h-4 w-4" />
                    Photos ({report.photos.length})
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {report.photos.map((photo) => (
                      <div
                        key={photo.id}
                        className="relative aspect-square rounded-lg overflow-hidden border bg-muted"
                      >
                        <img
                          src={getPhotoUrl(photo.url)}
                          alt={photo.caption || 'Report photo'}
                          className="w-full h-full object-cover"
                        />
                        {photo.caption && (
                          <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-2">
                            <p className="text-xs text-white line-clamp-2">{photo.caption}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

export default function TrackStatusPage() {
  return (
    <Suspense fallback={
      <div 
        className="min-h-screen py-12 px-4 relative"
        style={{
          backgroundImage: 'url(/Infrastructure.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      >
        <div className="container mx-auto max-w-2xl relative z-10">
          <Card>
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <div className="rounded-full bg-primary/10 p-3">
                  <FileSearch className="h-8 w-8 text-primary" />
                </div>
              </div>
              <CardTitle className="text-2xl">Track Report Status</CardTitle>
              <CardDescription>
                Loading...
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    }>
      <TrackStatusForm />
    </Suspense>
  )
}
