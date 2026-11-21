'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { apiGetAdminReports, apiUpdateReportStatus, apiAssignReport, apiGetUsers, apiGetOrganizations, apiGetOfficerMetrics, apiAutoAssignReports, apiGetGeographicData, apiMe, type AdminReport, type OfficerMetrics, type GeographicData } from '@/lib/api'
import { AdminSidebar } from '@/components/admin-sidebar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { ReportDetailView } from '@/components/report-detail-view'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { toast } from '@/hooks/use-toast'
import {
  BarChart,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Clock,
  FileText,
  Eye,
  RefreshCw,
  Search,
  Calendar as CalendarIcon,
  MapPin,
  UserCheck,
  Send,
  CheckCircle,
  X,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download,
  CheckSquare,
  Square,
  Settings,
  Save,
  Columns,
  Camera,
  MoreVertical
} from 'lucide-react'
import {
  LineChart,
  Line
} from 'recharts'
import { format } from 'date-fns'
import dynamic from 'next/dynamic'
import { useAdminAuth } from './_hooks/useAdminAuth'
import { loadLeaflet } from './_lib/map-utils'
import { AssignReportDialog } from './_components/AssignReportDialog'
import { ReportsMapView } from './_components/ReportsMapView'
import { GeographicDistribution } from './_components/GeographicDistribution'
import { StatusTypeCharts } from './_components/StatusTypeCharts'
import { TimeCharts } from './_components/TimeCharts'
import { OfficerMetricsSection } from './_components/OfficerMetricsSection'


const CircleMarker = dynamic(() => import('react-leaflet').then(mod => mod.CircleMarker), { ssr: false })

export default function AdminDashboard() {
  const router = useRouter()
  const { isAuthenticated, authLoading } = useAdminAuth('admin')
  const [reports, setReports] = useState<AdminReport[]>([])
  // When `reports` was fetched; overdue/SLA math measures against this instead
  // of reading the clock during render.
  const [reportsFetchedAt, setReportsFetchedAt] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedReport, setSelectedReport] = useState<AdminReport | null>(null)
  const [reportDetailKey, setReportDetailKey] = useState(0)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [mapReady, setMapReady] = useState(false)
  const [filterProvince, setFilterProvince] = useState<string | null>(null)
  const [filterDistrict, setFilterDistrict] = useState<string | null>(null)
  const [filterSector, setFilterSector] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterType, setFilterType] = useState<string>('')
  const [filterSeverity, setFilterSeverity] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>({ from: '', to: '' })
  const [sortColumn, setSortColumn] = useState<string>('createdAt')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [pageSize, setPageSize] = useState<number>(5)
  const [selectedReports, setSelectedReports] = useState<Set<string>>(new Set())
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false)
  const [assigningReport, setAssigningReport] = useState<AdminReport | null>(null)
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set(['title', 'type', 'severity', 'status', 'location', 'assignedTo', 'photos', 'createdAt', 'actions']))
  const [filterPresets, setFilterPresets] = useState<Array<{name: string, filters: any}>>([])
  const [searchReporter, setSearchReporter] = useState<string>('')
  const [searchAssignee, setSearchAssignee] = useState<string>('')
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false)
  const [showColumnToggle, setShowColumnToggle] = useState(false)
  const [showMapView, setShowMapView] = useState(false)
  const [geographicData, setGeographicData] = useState<GeographicData | null>(null)
  const [geographicLoading, setGeographicLoading] = useState(false)
  const [selectedProvince, setSelectedProvince] = useState<string | null>(null)
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null)
  const [autoAssigning, setAutoAssigning] = useState(false)
  const [assignData, setAssignData] = useState({ assigneeId: '', organizationId: '', dueAt: '' })
  const [users, setUsers] = useState<any[]>([])
  const [organizations, setOrganizations] = useState<any[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersError, setUsersError] = useState<string | null>(null)
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)
  const [officerMetrics, setOfficerMetrics] = useState<OfficerMetrics[]>([])
  const [officerMetricsLoading, setOfficerMetricsLoading] = useState(false)
  const [officerMetricsPage, setOfficerMetricsPage] = useState<number>(1)
  const [officerMetricsPageSize, setOfficerMetricsPageSize] = useState<number>(10)
  const [officerMetricsSort, setOfficerMetricsSort] = useState<'highest' | 'lowest'>('highest')
  const [statusPieActiveIndex, setStatusPieActiveIndex] = useState<number | undefined>(undefined)
  const [isMobile, setIsMobile] = useState(false)

  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])
  const reportsTableRef = useRef<HTMLDivElement>(null)

  // Load Leaflet on client side only
  useEffect(() => {
    if (typeof window !== 'undefined') {
      loadLeaflet().then(() => {
        setMapReady(true)
      })
    }
  }, [])

  // Debug: Log users state changes
  useEffect(() => {
    console.log('Users state changed:', { count: users.length, users })
  }, [users])

  const fetchUsersAndOrgs = useCallback(async () => {
    setUsersLoading(true)
    setUsersError(null)
    try {
      console.log('Fetching users and organizations...')
      const [usersRes, orgsRes] = await Promise.all([
        apiGetUsers('officer'),
        apiGetOrganizations()
      ])
      console.log('Users response:', usersRes)
      console.log('Organizations response:', orgsRes)
      
      const usersData = usersRes.data || []
      const orgsData = orgsRes.data || []
      
      console.log('Setting users state:', { count: usersData.length, users: usersData })
      setUsers(usersData)
      setOrganizations(orgsData)
      
      if (usersData.length === 0) {
        setUsersError('No officers found. Please create officers first.')
        console.warn('No officers returned from API')
      } else {
        console.log(`Successfully loaded ${usersData.length} officers into state`)
      }
    } catch (error) {
      console.error('Failed to fetch users/organizations:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch officers'
      setUsersError(errorMessage)
      toast({
        title: 'Failed to load officers',
        description: errorMessage,
        variant: 'destructive',
      })
    } finally {
      setUsersLoading(false)
    }
  }, [])

  const fetchGeographicData = useCallback(async () => {
    setGeographicLoading(true)
    try {
      const data = await apiGetGeographicData()
      setGeographicData(data)
    } catch (error) {
      console.error('Failed to fetch geographic data:', error)
      setGeographicData(null)
    } finally {
      setGeographicLoading(false)
    }
  }, [])

  // Compute filtered geographic data based on selections
  const filteredGeographicData = useMemo(() => {
    if (!geographicData) return null
    
    let filteredDistricts = geographicData.districts
    let filteredSectors = geographicData.sectors
    
    // Filter districts by selected province
    if (selectedProvince) {
      filteredDistricts = geographicData.districts.filter(d => d.province === selectedProvince)
      // Also filter sectors by province
      filteredSectors = geographicData.sectors.filter(s => s.province === selectedProvince)
    }
    
    // Filter sectors by selected district (only if district is selected)
    if (selectedDistrict) {
      filteredSectors = filteredSectors.filter(s => s.district === selectedDistrict)
    }
    
    return {
      provinces: geographicData.provinces,
      districts: filteredDistricts,
      sectors: filteredSectors,
    }
  }, [geographicData, selectedProvince, selectedDistrict])

  const fetchOfficerMetrics = useCallback(async () => {
    setOfficerMetricsLoading(true)
    try {
      const response = await apiGetOfficerMetrics()
      setOfficerMetrics(response.data)
    } catch (error) {
      console.error('Failed to fetch officer metrics:', error)
    } finally {
      setOfficerMetricsLoading(false)
    }
  }, [])

  const fetchReports = useCallback(async (): Promise<AdminReport[]> => {
    setLoading(true)
    setError(null)
    try {
      console.log('Fetching reports from API...')
      const response = await apiGetAdminReports({ limit: 1000 })
      console.log('Reports fetched:', response.data.length, 'reports')
      if (response.data.length > 0) {
        console.log('Sample report:', response.data[0])
      }
      setReports(response.data)
      setReportsFetchedAt(Date.now())
      return response.data
    } catch (error) {
      console.error('Failed to fetch reports:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch reports. Please check your API connection.'
      setError(errorMessage)
      return []
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isAuthenticated) {
      fetchReports()
      fetchUsersAndOrgs()
      fetchOfficerMetrics()
      fetchGeographicData()
    }
  }, [isAuthenticated, fetchReports, fetchUsersAndOrgs, fetchOfficerMetrics, fetchGeographicData])

  const handleViewReport = async (report: AdminReport) => {
    // Always fetch fresh data when opening a report to ensure we have the latest assignment status
    // This is especially important for reports that were auto-assigned previously
    try {
      const updatedReports = await fetchReports()
      const freshReport = updatedReports.find(r => r.id === report.id) || report
      setSelectedReport(freshReport)
      setIsDetailOpen(true)
      // Reset the detail key to ensure fresh fetch in ReportDetailView
      setReportDetailKey(prev => prev + 1)
    } catch (error) {
      // If fetch fails, still open with the report from the list
      console.error('Failed to refresh reports before viewing:', error)
      setSelectedReport(report)
      setIsDetailOpen(true)
    }
  }

  const handleReportUpdated = () => {
    fetchReports()
    setIsDetailOpen(false)
  }

  // Calculate statistics
  const stats = {
    total: reports.length,
    new: reports.filter(r => r.status === 'new').length,
    inProgress: reports.filter(r => r.status === 'in_progress').length,
    resolved: reports.filter(r => r.status === 'resolved').length,
    high: reports.filter(r => r.severity === 'high').length,
  }

  // Urgent reports (high severity, unresolved)
  const urgentReports = reports
    .filter(r => r.severity === 'high' && r.status !== 'resolved' && r.status !== 'rejected')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10)

  // Performance metrics
  const performanceMetrics = (() => {
    const resolvedReports = reports.filter(r => r.status === 'resolved' && r.createdAt && r.updatedAt)
    
    // Calculate average resolution time
    const resolutionTimes = resolvedReports.map(r => {
      const created = new Date(r.createdAt).getTime()
      const updated = new Date(r.updatedAt).getTime()
      return (updated - created) / (1000 * 60 * 60) // hours
    })
    
    const avgResolutionTime = resolutionTimes.length > 0
      ? resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length
      : 0

    // Calculate overdue assignments (assigned more than 7 days ago, not resolved)
    const overdueReports = reports.filter(r => {
      if (r.status === 'resolved' || r.status === 'rejected') return false
      if (!r.currentAssignment?.createdAt) return false
      const assignedDate = new Date(r.currentAssignment.createdAt)
      const daysSinceAssignment = (reportsFetchedAt - assignedDate.getTime()) / (1000 * 60 * 60 * 24)
      return daysSinceAssignment > 7
    })

    // SLA compliance (assuming 7-day SLA)
    // Calculate from assignment date, include all assigned reports
    const slaTarget = 7 * 24 // 7 days in hours
    
    // Get all reports that have been assigned (have a currentAssignment with createdAt)
    const assignedReports = reports.filter(r => {
      // Check if report has an assignment with createdAt
      const hasAssignment = r.currentAssignment?.createdAt
      if (!hasAssignment && r.currentAssignment) {
        // Debug: log reports with assignment but no createdAt
        console.log('Report with assignment but no createdAt:', {
          id: r.id,
          title: r.title,
          currentAssignment: r.currentAssignment
        })
      }
      return hasAssignment && r.status !== 'rejected'
    })
    
    // Debug logging
    if (reports.length > 0) {
      console.log('SLA Debug:', {
        totalReports: reports.length,
        assignedReportsCount: assignedReports.length,
        reportsWithAssignment: reports.filter(r => r.currentAssignment).length,
        reportsWithAssignmentCreatedAt: reports.filter(r => r.currentAssignment?.createdAt).length,
        sampleReport: reports.find(r => r.currentAssignment)?.currentAssignment
      })
    }
    
    // For each assigned report, check if it's SLA compliant
    const slaCompliant = assignedReports.filter(r => {
      const createdAt = r.currentAssignment?.createdAt
      if (!createdAt) return false
      
      const assignedDate = new Date(createdAt).getTime()
      
      if (r.status === 'resolved') {
        // For resolved reports: check if resolved within SLA from assignment
        const resolvedDate = new Date(r.updatedAt).getTime()
        const hoursToResolve = (resolvedDate - assignedDate) / (1000 * 60 * 60)
        return hoursToResolve <= slaTarget
      } else {
        // For unresolved reports: check if still within SLA (not overdue)
        const now = reportsFetchedAt
        const hoursSinceAssignment = (now - assignedDate) / (1000 * 60 * 60)
        return hoursSinceAssignment <= slaTarget
      }
    }).length
    
    // Calculate compliance rate, or return null if no assigned reports
    const slaComplianceRate = assignedReports.length > 0
      ? (slaCompliant / assignedReports.length) * 100
      : null

    // Category-specific resolution times
    const categoryResolutionTimes = new Map<string, { total: number; hours: number }>()
    resolvedReports.forEach(r => {
      if (!categoryResolutionTimes.has(r.type)) {
        categoryResolutionTimes.set(r.type, { total: 0, hours: 0 })
      }
      const created = new Date(r.createdAt).getTime()
      const updated = new Date(r.updatedAt).getTime()
      const hours = (updated - created) / (1000 * 60 * 60)
      const cat = categoryResolutionTimes.get(r.type)!
      cat.total++
      cat.hours += hours
    })
    
    const categoryAvgTimes = Array.from(categoryResolutionTimes.entries()).map(([type, data]) => ({
      type,
      avgHours: data.hours / data.total,
      count: data.total,
    }))

    // Overdue percentage
    const totalAssigned = reports.filter(r => 
      r.currentAssignment?.createdAt && r.status !== 'rejected'
    ).length
    const overduePercentage = totalAssigned > 0
      ? (overdueReports.length / totalAssigned) * 100
      : 0

    return {
      avgResolutionTime,
      overdueCount: overdueReports.length,
      overduePercentage,
      slaComplianceRate,
      categoryAvgTimes,
    }
  })()

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [filterProvince, filterDistrict, filterSector, filterStatus, filterType, filterSeverity, searchQuery, dateRange])

  // Filter reports based on all filters
  const filteredReports = reports.filter(report => {
    if (filterProvince && report.province?.trim() !== filterProvince) return false
    if (filterDistrict && report.district?.trim() !== filterDistrict) return false
    if (filterSector && report.sector?.trim() !== filterSector) return false
    if (filterStatus && report.status !== filterStatus) return false
    if (filterType && report.type !== filterType) return false
    if (filterSeverity && report.severity !== filterSeverity) return false
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      if (!report.title.toLowerCase().includes(query) && 
          !report.description.toLowerCase().includes(query)) {
        return false
      }
    }
    // Advanced search: Reporter
    if (searchReporter) {
      const query = searchReporter.toLowerCase()
      if (!report.reporter?.email?.toLowerCase().includes(query) &&
          !report.reporter?.fullName?.toLowerCase().includes(query)) {
        return false
      }
    }
    // Advanced search: Assignee
    if (searchAssignee) {
      const query = searchAssignee.toLowerCase()
      const assigneeEmail = report.currentAssignment?.assignee?.email?.toLowerCase() || ''
      const assigneeName = report.currentAssignment?.assignee?.fullName?.toLowerCase() || ''
      const orgName = report.currentAssignment?.organization?.name?.toLowerCase() || ''
      if (!assigneeEmail.includes(query) && !assigneeName.includes(query) && !orgName.includes(query)) {
        return false
      }
    }
    // Date range filter
    if (dateRange.from || dateRange.to) {
      const reportDate = new Date(report.createdAt)
      if (dateRange.from) {
        const fromDate = new Date(dateRange.from)
        fromDate.setHours(0, 0, 0, 0)
        if (reportDate < fromDate) return false
      }
      if (dateRange.to) {
        const toDate = new Date(dateRange.to)
        toDate.setHours(23, 59, 59, 999)
        if (reportDate > toDate) return false
      }
    }
    return true
  })

  // Calculate map bounds from filtered reports
  const mapCenterAndBounds = useMemo(() => {
    const reportsWithLocation = filteredReports.filter(r => r.latitude && r.longitude)
    if (reportsWithLocation.length === 0) {
      return { center: [-1.9441, 30.0619] as [number, number], zoom: 11 } // Default to Kigali
    }
    
    const lats = reportsWithLocation.map(r => r.latitude!)
    const lngs = reportsWithLocation.map(r => r.longitude!)
    const minLat = Math.min(...lats)
    const maxLat = Math.max(...lats)
    const minLng = Math.min(...lngs)
    const maxLng = Math.max(...lngs)
    
    const centerLat = (minLat + maxLat) / 2
    const centerLng = (minLng + maxLng) / 2
    
    // Calculate zoom level based on bounds
    const latDiff = maxLat - minLat
    const lngDiff = maxLng - minLng
    const maxDiff = Math.max(latDiff, lngDiff)
    
    let zoom = 11
    if (maxDiff > 0.5) zoom = 8
    else if (maxDiff > 0.2) zoom = 9
    else if (maxDiff > 0.1) zoom = 10
    else if (maxDiff > 0.05) zoom = 11
    else if (maxDiff > 0.02) zoom = 12
    else zoom = 13
    
    return {
      center: [centerLat, centerLng] as [number, number],
      zoom,
      bounds: [[minLat, minLng], [maxLat, maxLng]] as [[number, number], [number, number]]
    }
  }, [filteredReports])

  // Don't render content until authenticated
  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <div className="text-white">Loading...</div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return null // Will redirect
  }

  // Reports by status
  const statusData = [
    { name: 'New', value: reports.filter(r => r.status === 'new').length, color: '#3b82f6' },
    { name: 'Triaged', value: reports.filter(r => r.status === 'triaged').length, color: '#8b5cf6' },
    { name: 'Assigned', value: reports.filter(r => r.status === 'assigned').length, color: '#f59e0b' },
    { name: 'In Progress', value: reports.filter(r => r.status === 'in_progress').length, color: '#10b981' },
    { name: 'Resolved', value: reports.filter(r => r.status === 'resolved').length, color: '#06b6d4' },
    { name: 'Rejected', value: reports.filter(r => r.status === 'rejected').length, color: '#ef4444' },
  ].filter(item => item.value > 0)

  // Helper function to format type display names
  const getTypeDisplayName = (type: string): string => {
    const typeDisplayNames: Record<string, string> = {
      'pothole': 'Pothole',
      'streetlight': 'Streetlight',
      'sidewalk': 'Sidewalk',
      'drainage': 'Drainage',
      'other': 'Other',
      // Add any other types that might exist
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

  // Reports by type - dynamically count all unique types
  const typeData = (() => {
    const typeCounts = new Map<string, number>()
    
    reports.forEach(report => {
      const count = typeCounts.get(report.type) || 0
      typeCounts.set(report.type, count + 1)
    })
    
    return Array.from(typeCounts.entries())
      .map(([type, count]) => ({
        name: getTypeDisplayName(type),
        value: count,
      }))
      .sort((a, b) => b.value - a.value) // Sort by count descending
      .filter(item => item.value > 0)
  })()

  // Reports by hour of day
  const hourlyData = (() => {
    const hours = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      label: `${i.toString().padStart(2, '0')}:00`,
      reports: 0,
    }))
    
    reports.forEach(report => {
      const reportDate = new Date(report.createdAt)
      const hour = reportDate.getHours()
      hours[hour].reports += 1
    })
    
    return hours
  })()

  // Monthly reports (last 12 months)
  const monthlyData = (() => {
    const months = Array.from({ length: 12 }, (_, i) => {
      const date = new Date()
      date.setMonth(date.getMonth() - (11 - i))
      return {
        month: format(date, 'MMM'),
        reports: 0,
      }
    })
    
    reports.forEach(report => {
      const reportDate = new Date(report.createdAt)
      const monthIndex = reportDate.getMonth()
      const monthDiff = new Date().getMonth() - monthIndex
      if (monthDiff >= 0 && monthDiff < 12) {
        months[11 - monthDiff].reports += 1
      }
    })
    
    return months
  })()

  // Weekly reports data (last 8 weeks)
  const weeklyData = (() => {
    const weeks = Array.from({ length: 8 }, (_, i) => {
      const date = new Date()
      date.setDate(date.getDate() - (7 - i) * 7)
      const weekStart = new Date(date)
      weekStart.setDate(date.getDate() - date.getDay()) // Start of week (Sunday)
      return {
        week: `Week ${8 - i}`,
        label: format(weekStart, 'MMM d'),
        weekStart: weekStart,
        reports: 0,
      }
    })

    reports.forEach(report => {
      const reportDate = new Date(report.createdAt)
      const weekStart = new Date(reportDate)
      weekStart.setDate(reportDate.getDate() - reportDate.getDay())
      
      // Find which week this report belongs to
      for (let i = 0; i < weeks.length; i++) {
        const week = weeks[i]
        const weekEnd = new Date(week.weekStart)
        weekEnd.setDate(week.weekStart.getDate() + 6)
        
        if (reportDate >= week.weekStart && reportDate <= weekEnd) {
          week.reports++
          break
        }
      }
    })

    return weeks
  })()

  // Daily reports data (last 30 days)
  const dailyData = (() => {
    const days = Array.from({ length: 30 }, (_, i) => {
      const date = new Date()
      date.setDate(date.getDate() - (29 - i))
      return {
        day: format(date, 'MMM d'),
        date: new Date(date),
        reports: 0,
      }
    })

    reports.forEach(report => {
      const reportDate = new Date(report.createdAt)
      reportDate.setHours(0, 0, 0, 0)
      
      const dayData = days.find(d => {
        const dayDate = new Date(d.date)
        dayDate.setHours(0, 0, 0, 0)
        return dayDate.getTime() === reportDate.getTime()
      })
      
      if (dayData) {
        dayData.reports++
      }
    })

    return days
  })()

  // Helper function to format time ago
  const formatTimeAgo = (date: string): string => {
    const now = new Date()
    const past = new Date(date)
    const diffMs = now.getTime() - past.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)
    const diffWeeks = Math.floor(diffDays / 7)
    const diffMonths = Math.floor(diffDays / 30)
    
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    if (diffWeeks < 4) return `${diffWeeks}w ago`
    if (diffMonths < 12) return `${diffMonths}mo ago`
    return `${Math.floor(diffDays / 365)}y ago`
  }

  // Helper function to check if report is overdue
  const isOverdue = (report: AdminReport): boolean => {
    if (!report.currentAssignment?.createdAt) return false
    if (report.status === 'resolved' || report.status === 'rejected') return false
    
    const assignedDate = new Date(report.currentAssignment.createdAt)
    const daysSinceAssignment = (reportsFetchedAt - assignedDate.getTime()) / (1000 * 60 * 60 * 24)
    return daysSinceAssignment > 7
  }

  // Helper function to get days until/since due date
  const getDueDateInfo = (report: AdminReport): { text: string; isOverdue: boolean } | null => {
    if (!report.currentAssignment?.dueAt) return null
    
    const dueDate = new Date(report.currentAssignment.dueAt)
    const now = new Date()
    const diffMs = dueDate.getTime() - now.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    
    if (diffDays < 0) {
      return { text: `${Math.abs(diffDays)}d overdue`, isOverdue: true }
    } else if (diffDays === 0) {
      return { text: 'Due today', isOverdue: false }
    } else if (diffDays === 1) {
      return { text: 'Due tomorrow', isOverdue: false }
    } else {
      return { text: `Due in ${diffDays}d`, isOverdue: false }
    }
  }

  // Helper function to get assignment age
  const getAssignmentAge = (report: AdminReport): string | null => {
    if (!report.currentAssignment?.createdAt) return null
    return formatTimeAgo(report.currentAssignment.createdAt)
  }

  // Helper function to get photo count
  const getPhotoCount = (report: AdminReport): number => {
    return report.photos?.length || 0
  }

  // Helper function to format location
  const formatLocation = (report: AdminReport): string => {
    const parts: string[] = []
    if (report.district) parts.push(report.district)
    if (report.province && !parts.includes(report.province)) {
      parts.push(report.province)
    }
    return parts.length > 0 ? parts.join(', ') : 'Unknown'
  }

  // Sort filtered reports
  const sortedReports = [...filteredReports].sort((a, b) => {
    let aValue: any
    let bValue: any
    
    switch (sortColumn) {
      case 'title':
        aValue = a.title.toLowerCase()
        bValue = b.title.toLowerCase()
        break
      case 'status':
        aValue = a.status
        bValue = b.status
        break
      case 'severity':
        const severityOrder = { low: 1, medium: 2, high: 3 }
        aValue = severityOrder[a.severity as keyof typeof severityOrder] || 0
        bValue = severityOrder[b.severity as keyof typeof severityOrder] || 0
        break
      case 'type':
        aValue = a.type
        bValue = b.type
        break
      case 'createdAt':
      default:
        aValue = new Date(a.createdAt).getTime()
        bValue = new Date(b.createdAt).getTime()
        break
    }
    
    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1
    return 0
  })

  // Pagination
  const totalPages = Math.ceil(sortedReports.length / pageSize)
  const startIndex = (currentPage - 1) * pageSize
  const paginatedReports = sortedReports.slice(startIndex, startIndex + pageSize)
  
  const recentReports = paginatedReports

  // Handle column sorting
  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('desc')
    }
  }

  const handleProvinceClick = (province: string) => {
    setFilterProvince(province)
    setFilterDistrict(null) // Clear district filter when province is selected
    setFilterSector(null) // Clear sector filter when province is selected
    
    // Scroll to reports table after a short delay to ensure filtering is complete
    setTimeout(() => {
      reportsTableRef.current?.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start' 
      })
    }, 100)
  }

  const handleDistrictClick = (district: string) => {
    setFilterDistrict(district)
    setFilterSector(null) // Clear sector filter when district is selected
    
    // Scroll to reports table after a short delay to ensure filtering is complete
    setTimeout(() => {
      reportsTableRef.current?.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start' 
      })
    }, 100)
  }

  const handleSectorClick = (sector: string) => {
    setFilterSector(sector)
    setFilterDistrict(null) // Clear district filter when sector is selected
    
    // Scroll to reports table after a short delay to ensure filtering is complete
    setTimeout(() => {
      reportsTableRef.current?.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start' 
      })
    }, 100)
  }

  const clearFilters = () => {
    setFilterProvince(null)
    setFilterDistrict(null)
    setFilterSector(null)
    setFilterStatus('')
    setFilterType('')
    setFilterSeverity('')
    setSearchQuery('')
    setDateRange({ from: '', to: '' })
    // Also clear chart selections
    setSelectedProvince(null)
    setSelectedDistrict(null)
    setSelectedReports(new Set())
    setCurrentPage(1)
    setSearchReporter('')
    setSearchAssignee('')
  }

  const handleAutoAssign = async () => {
    setAutoAssigning(true)
    try {
      const response = await apiAutoAssignReports()
      toast({
        title: 'Success',
        description: `Successfully assigned ${response.assigned || 0} reports to officers`,
      })
      // Refresh reports to show updated assignments
      const updatedReports = await fetchReports()
      await fetchOfficerMetrics()
      
      // If a report detail view is open, update the selected report with fresh data
      if (selectedReport) {
        // Find the updated report from the refreshed reports list
        const updatedReport = updatedReports.find(r => r.id === selectedReport.id)
        if (updatedReport) {
          setSelectedReport(updatedReport)
          // Force ReportDetailView to refresh by updating the key
          setReportDetailKey(prev => prev + 1)
        }
      }
    } catch (error) {
      console.error('Failed to auto-assign reports:', error)
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to auto-assign reports',
        variant: 'destructive',
      })
    } finally {
      setAutoAssigning(false)
    }
  }

  // Export to CSV
  const exportToCSV = () => {
    const headers = ['Title', 'Type', 'Severity', 'Status', 'Province', 'District', 'Sector', 'Assigned To', 'Created At']
    const rows = sortedReports.map(report => [
      report.title,
      getTypeDisplayName(report.type),
      report.severity,
      report.status,
      report.province || '',
      report.district || '',
      report.sector || '',
      report.currentAssignment?.assignee?.fullName || report.currentAssignment?.organization?.name || 'Unassigned',
      format(new Date(report.createdAt), 'yyyy-MM-dd HH:mm:ss')
    ])
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n')
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `reports_${format(new Date(), 'yyyy-MM-dd')}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    
    toast({
      title: 'Success',
      description: `Exported ${sortedReports.length} reports to CSV`,
    })
  }

  // Bulk actions
  const handleBulkStatusUpdate = async (status: string) => {
    if (selectedReports.size === 0) return
    
    // The API rejects transitions that aren't allowed from a report's current
    // status, so some selected reports may be skipped; report both counts.
    const results = await Promise.allSettled(
      Array.from(selectedReports).map(id =>
        apiUpdateReportStatus(id, { status: status as any, note: 'Bulk status update' })
      )
    )
    const updated = results.filter(r => r.status === 'fulfilled').length
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')

    if (failed.length === 0) {
      toast({
        title: 'Success',
        description: `Updated ${updated} report(s) to ${status}`,
      })
    } else {
      const firstReason = failed[0].reason instanceof Error ? failed[0].reason.message : 'Update failed'
      toast({
        title: updated > 0 ? 'Partially updated' : 'Error',
        description: `Updated ${updated}, skipped ${failed.length} (e.g. ${firstReason})`,
        variant: updated > 0 ? undefined : 'destructive',
      })
    }

    setSelectedReports(new Set())
    fetchReports()
  }

  const handleSelectAll = () => {
    if (selectedReports.size === paginatedReports.length) {
      setSelectedReports(new Set())
    } else {
      setSelectedReports(new Set(paginatedReports.map(r => r.id)))
    }
  }

  const handleSelectReport = (reportId: string) => {
    const newSelected = new Set(selectedReports)
    if (newSelected.has(reportId)) {
      newSelected.delete(reportId)
    } else {
      newSelected.add(reportId)
    }
    setSelectedReports(newSelected)
  }

  const handleQuickTriage = async (report: AdminReport) => {
    setUpdatingStatus(report.id)
    try {
      await apiUpdateReportStatus(report.id, {
        status: 'triaged',
        note: 'Report triaged by admin'
      })
      toast({
        title: 'Success',
        description: 'Report marked as triaged',
      })
      fetchReports()
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update status',
        variant: 'destructive',
      })
    } finally {
      setUpdatingStatus(null)
    }
  }

  const handleQuickResolve = async (report: AdminReport) => {
    setUpdatingStatus(report.id)
    try {
      await apiUpdateReportStatus(report.id, {
        status: 'resolved',
        note: 'Report resolved by admin'
      })
      toast({
        title: 'Success',
        description: 'Report marked as resolved',
      })
      fetchReports()
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update status',
        variant: 'destructive',
      })
    } finally {
      setUpdatingStatus(null)
    }
  }

  const handleQuickAssign = async (report: AdminReport) => {
    setAssigningReport(report)
    setAssignData({ assigneeId: '', organizationId: '', dueAt: '' })
    
    // Always refresh users/orgs when opening dialog to ensure we have latest data
    if (users.length === 0 || !usersLoading) {
      console.log('Fetching users before opening dialog, current users count:', users.length)
      await fetchUsersAndOrgs()
    }
    
    console.log('Opening assign dialog, users available:', users.length)
    setIsAssignDialogOpen(true)
  }

  const handleAssignSubmit = async () => {
    if (!assigningReport) {
      console.error('No report selected for assignment')
      return
    }
    
    if (!assignData.assigneeId && !assignData.organizationId) {
      toast({
        title: 'Validation Error',
        description: 'Please select either an officer or organization',
        variant: 'destructive',
      })
      return
    }

    console.log('Submitting assignment:', {
      reportId: assigningReport.id,
      assignData,
    })

    try {
      const payload: {
        assigneeId?: string
        organizationId?: string
        dueAt?: string
      } = {}
      
      if (assignData.assigneeId) {
        payload.assigneeId = assignData.assigneeId
      }
      
      if (assignData.organizationId) {
        payload.organizationId = assignData.organizationId
      }
      
      if (assignData.dueAt && assignData.dueAt.trim() !== '') {
        // Convert datetime-local format to ISO string
        const dateValue = new Date(assignData.dueAt)
        if (!isNaN(dateValue.getTime())) {
          payload.dueAt = dateValue.toISOString()
        }
      }
      
      console.log('Assignment payload:', payload)
      const result = await apiAssignReport(assigningReport.id, payload)
      console.log('Assignment result:', result)
      
      toast({
        title: 'Success',
        description: 'Report assigned successfully',
      })
      setIsAssignDialogOpen(false)
      setAssigningReport(null)
      setAssignData({ assigneeId: '', organizationId: '', dueAt: '' })
      fetchReports()
    } catch (error: any) {
      console.error('Assignment error:', error)
      toast({
        title: 'Error',
        description: error.message || 'Failed to assign report',
        variant: 'destructive',
      })
    }
  }

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'new': return 'default'
      case 'triaged': return 'secondary'
      case 'assigned': return 'outline'
      case 'in_progress': return 'default'
      case 'resolved': return 'default'
      case 'rejected': return 'destructive'
      default: return 'default'
    }
  }

  const getSeverityBadgeClassName = (severity: string) => {
    switch (severity) {
      case 'high':
        return 'bg-red-500/10 text-red-400 border-red-500/20'
      case 'medium':
        return 'bg-orange-500/10 text-orange-400 border-orange-500/20'
      case 'low':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20'
      default:
        return 'bg-slate-500/10 text-slate-400 border-slate-500/20'
    }
  }

  const getStatusBadgeClassName = (status: string) => {
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

  return (
    <div className="flex h-screen bg-slate-950 text-white">
      <AdminSidebar variant="admin" userName="Admin User" userRole="admin" />
      
      <div className="flex-1 overflow-y-auto">
        {/* Top Bar */}
        <div className="sticky top-0 z-10 border-b border-slate-800 bg-gradient-to-r from-slate-900 to-slate-900/95 backdrop-blur-sm px-6 py-5 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                Analytics Dashboard
              </h1>
              <p className="text-sm text-slate-400">Overview of all infrastructure reports</p>
            </div>
            <div className="flex items-center gap-3">
              <Button 
                onClick={() => {
                  fetchReports()
                  fetchOfficerMetrics()
                }} 
                variant="outline" 
                size="sm" 
                className="bg-slate-800/50 border-slate-700 text-white hover:bg-slate-700 hover:border-slate-600 transition-all"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="p-6 lg:p-8 space-y-8">
          {/* Error Message */}
          {error && (
            <div className="rounded-lg border border-red-500 bg-red-500/10 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-red-400">Error Loading Data</h3>
                  <p className="text-sm text-red-300 mt-1">{error}</p>
                </div>
                <Button
                  onClick={fetchReports}
                  variant="outline"
                  size="sm"
                  className="border-red-500 text-red-400 hover:bg-red-500/20"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry
                </Button>
              </div>
            </div>
          )}

          {/* Urgent Reports Alert Section */}
          {!loading && urgentReports.length > 0 && (
            <Card className="bg-gradient-to-br from-slate-900 to-slate-800 border-slate-700 shadow-lg overflow-hidden">
              <CardHeader className="bg-gradient-to-r from-red-600 to-red-700 border-b-0 px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-white" />
                    <CardTitle className="text-white text-base font-semibold">Urgent Reports</CardTitle>
                  </div>
                  <Badge className="bg-red-800/90 text-white border-red-600 px-2 py-0.5 text-xs font-medium">
                    {urgentReports.length} urgent
                  </Badge>
                </div>
                <CardDescription className="text-red-100/90 text-xs mt-1">
                  High-severity reports requiring immediate attention
                </CardDescription>
              </CardHeader>
              <CardContent className="p-3">
                <div className="space-y-2 max-h-[250px] overflow-y-auto">
                  {urgentReports.map((report) => (
                    <div
                      key={report.id}
                      className="group flex items-center justify-between gap-3 p-2.5 rounded-md border border-slate-700/50 bg-slate-800/50 hover:border-slate-600 hover:bg-slate-800/70 transition-all cursor-pointer"
                      onClick={() => handleViewReport(report)}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0"></div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <h4 className="text-sm font-medium text-white group-hover:text-blue-400 transition-colors truncate">
                              {report.title}
                            </h4>
                            <div className="flex items-center gap-1.5">
                              <Badge className="bg-red-500/10 text-red-400 border-red-500/30 text-xs px-1.5 py-0.5">
                                High
                              </Badge>
                              <Badge className={`${getStatusBadgeClassName(report.status)} border text-xs px-2 py-1 min-w-[80px] text-center inline-block`}>
                                {report.status}
                              </Badge>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-slate-400">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {format(new Date(report.createdAt), 'MMM d, yyyy')}
                            </span>
                            {report.district && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {report.district}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleViewReport(report)
                        }}
                        className="h-7 w-7 flex-shrink-0 text-slate-400 hover:text-white hover:bg-slate-700/50"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Stats Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="bg-gradient-to-br from-slate-900 to-slate-800 border-slate-700 hover:border-slate-600 transition-all hover:shadow-lg hover:shadow-blue-500/10">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-sm font-medium text-slate-300">Total Reports</CardTitle>
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <FileText className="h-5 w-5 text-blue-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-white mb-1">{stats.total}</div>
                <p className="text-xs text-slate-400">All time</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-slate-900 to-slate-800 border-slate-700 hover:border-slate-600 transition-all hover:shadow-lg hover:shadow-yellow-500/10">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-sm font-medium text-slate-300">New Reports</CardTitle>
                <div className="p-2 rounded-lg bg-yellow-500/10">
                  <AlertCircle className="h-5 w-5 text-yellow-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-white mb-1">{stats.new}</div>
                <p className="text-xs text-slate-400">Requires attention</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-slate-900 to-slate-800 border-slate-700 hover:border-slate-600 transition-all hover:shadow-lg hover:shadow-orange-500/10">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-sm font-medium text-slate-300">In Progress</CardTitle>
                <div className="p-2 rounded-lg bg-orange-500/10">
                  <Clock className="h-5 w-5 text-orange-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-white mb-1">{stats.inProgress}</div>
                <p className="text-xs text-slate-400">Active work</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-slate-900 to-slate-800 border-slate-700 hover:border-slate-600 transition-all hover:shadow-lg hover:shadow-green-500/10">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-sm font-medium text-slate-300">Resolved</CardTitle>
                <div className="p-2 rounded-lg bg-green-500/10">
                  <CheckCircle2 className="h-5 w-5 text-green-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-white mb-1">{stats.resolved}</div>
                <p className="text-xs text-slate-400">Completed</p>
              </CardContent>
            </Card>
          </div>

          {/* Performance Metrics Cards */}
          {!loading && reports.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-3">
              <Card className="bg-gradient-to-br from-slate-900 to-slate-800 border-slate-700 hover:border-blue-500/50 transition-all">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                  <CardTitle className="text-sm font-medium text-slate-300">Avg Resolution Time</CardTitle>
                  <div className="p-2 rounded-lg bg-blue-500/10">
                    <Clock className="h-5 w-5 text-blue-400" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white mb-1">
                    {performanceMetrics.avgResolutionTime > 0
                      ? `${Math.round(performanceMetrics.avgResolutionTime / 24 * 10) / 10} days`
                      : 'N/A'}
                  </div>
                  <p className="text-xs text-slate-400">Average time to resolve</p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-slate-900 to-slate-800 border-slate-700 hover:border-green-500/50 transition-all">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                  <CardTitle className="text-sm font-medium text-slate-300">SLA Compliance</CardTitle>
                  <div className="p-2 rounded-lg bg-green-500/10">
                    <TrendingUp className="h-5 w-5 text-green-400" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white mb-1">
                    {performanceMetrics.slaComplianceRate !== null
                      ? `${Math.round(performanceMetrics.slaComplianceRate)}%`
                      : 'N/A'}
                  </div>
                  <p className="text-xs text-slate-400">
                    {performanceMetrics.slaComplianceRate !== null
                      ? `Assigned reports within 7-day SLA`
                      : 'No assigned reports yet'}
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-slate-900 to-slate-800 border-slate-700 hover:border-red-500/50 transition-all">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                  <CardTitle className="text-sm font-medium text-slate-300">Overdue Assignments</CardTitle>
                  <div className="p-2 rounded-lg bg-red-500/10">
                    <AlertCircle className="h-5 w-5 text-red-400" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white mb-1">{performanceMetrics.overdueCount}</div>
                  <p className="text-xs text-slate-400">
                    {performanceMetrics.overduePercentage !== undefined && performanceMetrics.overduePercentage > 0
                      ? `${Math.round(performanceMetrics.overduePercentage)}% of assigned reports`
                      : 'Assigned &gt; 7 days ago'}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Category-Specific Resolution Times */}
          {!loading && reports.length > 0 && performanceMetrics.categoryAvgTimes && performanceMetrics.categoryAvgTimes.length > 0 && (
            <Card className="bg-gradient-to-br from-slate-900 to-slate-800 border-slate-700 hover:border-slate-600 transition-all mt-6">
              <CardHeader>
                <CardTitle className="text-white text-lg">Resolution Time by Category</CardTitle>
                <CardDescription className="text-slate-400">Average resolution time for each report category</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {performanceMetrics.categoryAvgTimes
                    .sort((a, b) => b.avgHours - a.avgHours)
                    .map((cat) => (
                      <div
                        key={cat.type}
                        className="p-4 rounded-lg bg-slate-800/50 border border-slate-700/50"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-slate-300 capitalize">
                            {cat.type.replace('_', ' ')}
                          </span>
                          <span className="text-xs text-slate-400">({cat.count} reports)</span>
                        </div>
                        <div className="text-xl font-bold text-white">
                          {(cat.avgHours / 24).toFixed(1)} days
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                          {cat.avgHours < 168 ? 'Within SLA' : 'Over SLA'}
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}

          <OfficerMetricsSection
            reports={reports}
            officerMetrics={officerMetrics}
            officerMetricsLoading={officerMetricsLoading}
            officerMetricsPage={officerMetricsPage}
            setOfficerMetricsPage={setOfficerMetricsPage}
            officerMetricsPageSize={officerMetricsPageSize}
            setOfficerMetricsPageSize={setOfficerMetricsPageSize}
            officerMetricsSort={officerMetricsSort}
            setOfficerMetricsSort={setOfficerMetricsSort}
            fetchOfficerMetrics={fetchOfficerMetrics}
          />

          <TimeCharts
            reports={reports}
            loading={loading}
            hourlyData={hourlyData}
            monthlyData={monthlyData}
            weeklyData={weeklyData}
            dailyData={dailyData}
          />

          <StatusTypeCharts
            reports={reports}
            loading={loading}
            statusPieActiveIndex={statusPieActiveIndex}
            setStatusPieActiveIndex={setStatusPieActiveIndex}
            isMobile={isMobile}
            statusData={statusData}
            typeData={typeData}
          />

          <GeographicDistribution
            setFilterProvince={setFilterProvince}
            setFilterDistrict={setFilterDistrict}
            geographicData={geographicData}
            geographicLoading={geographicLoading}
            selectedProvince={selectedProvince}
            setSelectedProvince={setSelectedProvince}
            selectedDistrict={selectedDistrict}
            setSelectedDistrict={setSelectedDistrict}
            isMobile={isMobile}
            filteredGeographicData={filteredGeographicData}
          />

          <ReportsMapView
            reports={reports}
            loading={loading}
            mapReady={mapReady}
            showMapView={showMapView}
            setShowMapView={setShowMapView}
            handleViewReport={handleViewReport}
            filteredReports={filteredReports}
            mapCenterAndBounds={mapCenterAndBounds}
            getSeverityBadgeClassName={getSeverityBadgeClassName}
            getStatusBadgeClassName={getStatusBadgeClassName}
          />

          {/* Reports Table with Filters */}
          {!loading && (
            <div ref={reportsTableRef} className="space-y-6">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="h-5 w-5 text-slate-400" />
                <h2 className="text-xl font-semibold text-white">Reports Management</h2>
              </div>
            <Card className="bg-gradient-to-br from-slate-900 to-slate-800 border-slate-700 hover:border-slate-600 transition-all">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <CardTitle className="text-white text-lg">
                      Reports ({filteredReports.length})
                    </CardTitle>
                    <CardDescription className="text-slate-400">
                      Review, assign, and resolve reports
                    </CardDescription>
                    {/* Geographic Filter Indicators */}
                    {(filterProvince || filterDistrict || filterSector) && (
                      <div className="flex items-center gap-2 mt-3 flex-wrap">
                        <span className="text-xs text-slate-500 font-medium">Active filters:</span>
                        {filterProvince && (
                          <Badge 
                            variant="secondary" 
                            className="bg-blue-500/20 text-blue-300 border-blue-500/50 hover:bg-blue-500/30 cursor-pointer"
                            onClick={() => {
                              setFilterProvince(null)
                              setSelectedProvince(null)
                              setFilterDistrict(null)
                              setSelectedDistrict(null)
                            }}
                          >
                            <MapPin className="h-3 w-3 mr-1" />
                            Province: {filterProvince}
                            <X className="h-3 w-3 ml-1" />
                          </Badge>
                        )}
                        {filterDistrict && (
                          <Badge 
                            variant="secondary" 
                            className="bg-green-500/20 text-green-300 border-green-500/50 hover:bg-green-500/30 cursor-pointer"
                            onClick={() => {
                              setFilterDistrict(null)
                              setSelectedDistrict(null)
                            }}
                          >
                            <MapPin className="h-3 w-3 mr-1" />
                            District: {filterDistrict}
                            <X className="h-3 w-3 ml-1" />
                          </Badge>
                        )}
                        {filterSector && (
                          <Badge 
                            variant="secondary" 
                            className="bg-purple-500/20 text-purple-300 border-purple-500/50 hover:bg-purple-500/30 cursor-pointer"
                            onClick={() => setFilterSector(null)}
                          >
                            <MapPin className="h-3 w-3 mr-1" />
                            Sector: {filterSector}
                            <X className="h-3 w-3 ml-1" />
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleAutoAssign}
                      disabled={autoAssigning}
                      className="bg-blue-600/10 border-blue-500/50 text-blue-400 hover:bg-blue-600/20 hover:border-blue-500 hover:text-blue-300"
                      title="Auto-assign unassigned reports to officers with fewer cases"
                    >
                      <UserCheck className={`h-4 w-4 mr-2 ${autoAssigning ? 'animate-spin' : ''}`} />
                      {autoAssigning ? 'Assigning...' : 'Auto-Assign'}
                    </Button>
                    {selectedReports.size > 0 && (
                      <div className="flex items-center gap-2 mr-2">
                        <span className="text-sm text-slate-400">{selectedReports.size} selected</span>
                        <Select
                          value=""
                          onValueChange={(value) => {
                            if (value) handleBulkStatusUpdate(value)
                          }}
                        >
                          <SelectTrigger className="w-[160px] bg-slate-800 border-slate-700 text-white h-8">
                            <SelectValue placeholder="Bulk Actions" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="triaged">Mark as Triaged</SelectItem>
                            <SelectItem value="in_progress">Mark In Progress</SelectItem>
                            <SelectItem value="resolved">Mark Resolved</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={exportToCSV}
                      className="text-slate-400 hover:text-white"
                      title="Export to CSV"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Export
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={fetchReports}
                      className="text-slate-400 hover:text-white"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Refresh
                    </Button>
                    {(filterProvince || filterDistrict || filterSector || filterStatus || filterType || filterSeverity || searchQuery || dateRange.from || dateRange.to) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearFilters}
                        className="text-slate-400 hover:text-white"
                      >
                        <X className="h-4 w-4 mr-2" />
                        Clear Filters
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Filters */}
                <div className="space-y-4 p-4 rounded-lg bg-slate-800/30 border border-slate-700">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                      <Search className="h-4 w-4 text-slate-400 flex-shrink-0" />
                      <Input
                        placeholder="Search reports by title or description..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-slate-600"
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAdvancedSearch(!showAdvancedSearch)}
                      className="text-slate-400 hover:text-white hover:bg-slate-700/50"
                    >
                      <Settings className="h-4 w-4 mr-2" />
                      {showAdvancedSearch ? 'Hide' : 'Advanced'} Search
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowColumnToggle(!showColumnToggle)}
                      className="text-slate-400 hover:text-white hover:bg-slate-700/50"
                    >
                      <Columns className="h-4 w-4 mr-2" />
                      Columns
                    </Button>
                    {filterPresets.length > 0 && (
                      <Select
                        value=""
                        onValueChange={(value) => {
                          const preset = filterPresets.find(p => p.name === value)
                          if (preset) {
                            const filters = preset.filters
                            if (filters.province) setFilterProvince(filters.province)
                            if (filters.district) setFilterDistrict(filters.district)
                            if (filters.status) setFilterStatus(filters.status)
                            if (filters.type) setFilterType(filters.type)
                            if (filters.severity) setFilterSeverity(filters.severity)
                            if (filters.dateRange) setDateRange(filters.dateRange)
                          }
                        }}
                      >
                        <SelectTrigger className="w-[180px] bg-slate-800 border-slate-700 text-white h-8">
                          <SelectValue placeholder="Filter Presets" />
                        </SelectTrigger>
                        <SelectContent>
                          {filterPresets.map((preset) => (
                            <SelectItem key={preset.name} value={preset.name}>{preset.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const presetName = prompt('Enter preset name:')
                        if (presetName) {
                          const newPreset = {
                            name: presetName,
                            filters: {
                              province: filterProvince,
                              district: filterDistrict,
                              sector: filterSector,
                              status: filterStatus,
                              type: filterType,
                              severity: filterSeverity,
                              dateRange: dateRange,
                            }
                          }
                          setFilterPresets([...filterPresets, newPreset])
                          toast({
                            title: 'Success',
                            description: `Filter preset "${presetName}" saved`,
                          })
                        }
                      }}
                      className="text-slate-400 hover:text-white"
                      title="Save current filters as preset"
                    >
                      <Save className="h-4 w-4 mr-2" />
                      Save Preset
                    </Button>
                  </div>
                  
                  {/* Advanced Search */}
                  {showAdvancedSearch && (
                    <div className="flex items-center gap-4 flex-wrap p-4 rounded-lg bg-slate-800/30 border border-slate-700">
                      <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                        <Search className="h-4 w-4 text-slate-400 flex-shrink-0" />
                        <Input
                          placeholder="Search by reporter email/name..."
                          value={searchReporter}
                          onChange={(e) => setSearchReporter(e.target.value)}
                          className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-slate-600"
                        />
                      </div>
                      <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                        <UserCheck className="h-4 w-4 text-slate-400 flex-shrink-0" />
                        <Input
                          placeholder="Search by assignee email/name..."
                          value={searchAssignee}
                          onChange={(e) => setSearchAssignee(e.target.value)}
                          className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-slate-600"
                        />
                      </div>
                    </div>
                  )}

                  {/* Column Visibility Toggle */}
                  {showColumnToggle && (
                    <div className="p-4 rounded-lg bg-slate-800/30 border border-slate-700">
                      <div className="flex items-center gap-2 mb-3">
                        <Columns className="h-4 w-4 text-slate-400" />
                        <span className="text-sm font-medium text-slate-300">Visible Columns</span>
                      </div>
                      <div className="flex flex-wrap gap-4">
                        {[
                          { key: 'title', label: 'Title' },
                          { key: 'type', label: 'Type' },
                          { key: 'severity', label: 'Severity' },
                          { key: 'status', label: 'Status' },
                          { key: 'assignedTo', label: 'Assigned To' },
                          { key: 'createdAt', label: 'Created' },
                        ].map(col => (
                          <label key={col.key} className="flex items-center gap-2 cursor-pointer hover:text-white transition-colors">
                            <input
                              type="checkbox"
                              checked={visibleColumns.has(col.key)}
                              onChange={(e) => {
                                const newVisible = new Set(visibleColumns)
                                if (e.target.checked) {
                                  newVisible.add(col.key)
                                } else {
                                  newVisible.delete(col.key)
                                }
                                setVisibleColumns(newVisible)
                              }}
                              className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500"
                            />
                            <span className="text-sm text-slate-300">{col.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-4 flex-wrap pt-2 border-t border-slate-700">
                    <div className="flex items-center gap-2">
                      <Filter className="h-4 w-4 text-slate-400 flex-shrink-0" />
                      <Select value={filterStatus || undefined} onValueChange={(value) => setFilterStatus(value === 'all' ? '' : value)}>
                        <SelectTrigger className="w-[180px] bg-slate-800/50 border-slate-700 text-white hover:border-slate-600">
                          <SelectValue placeholder="All Statuses" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Statuses</SelectItem>
                          <SelectItem value="new">New</SelectItem>
                          <SelectItem value="triaged">Triaged</SelectItem>
                          <SelectItem value="assigned">Assigned</SelectItem>
                          <SelectItem value="in_progress">In Progress</SelectItem>
                          <SelectItem value="resolved">Resolved</SelectItem>
                          <SelectItem value="rejected">Rejected</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Select value={filterType || undefined} onValueChange={(value) => setFilterType(value === 'all' ? '' : value)}>
                      <SelectTrigger className="w-[180px] bg-slate-800/50 border-slate-700 text-white hover:border-slate-600">
                        <SelectValue placeholder="All Types" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        {Array.from(new Set(reports.map(r => r.type))).map(type => (
                          <SelectItem key={type} value={type}>{getTypeDisplayName(type)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={filterSeverity || undefined} onValueChange={(value) => setFilterSeverity(value === 'all' ? '' : value)}>
                      <SelectTrigger className="w-[180px] bg-slate-800/50 border-slate-700 text-white hover:border-slate-600">
                        <SelectValue placeholder="All Severities" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Severities</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-2">
                      <CalendarIcon className="h-4 w-4 text-slate-400 flex-shrink-0" />
                      <Input
                        type="date"
                        value={dateRange.from}
                        onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))}
                        className="w-[160px] bg-slate-800/50 border-slate-700 text-white hover:border-slate-600 focus:border-slate-600"
                        placeholder="From"
                      />
                      <span className="text-slate-400">to</span>
                      <Input
                        type="date"
                        value={dateRange.to}
                        onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value }))}
                        className="w-[160px] bg-slate-800/50 border-slate-700 text-white hover:border-slate-600 focus:border-slate-600"
                        placeholder="To"
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-md border border-slate-800">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-800 hover:bg-slate-800/50">
                        <TableHead className="w-12">
                          <button
                            onClick={handleSelectAll}
                            className="flex items-center justify-center"
                            title="Select all"
                          >
                            {selectedReports.size === paginatedReports.length && paginatedReports.length > 0 ? (
                              <CheckSquare className="h-4 w-4 text-blue-400" />
                            ) : (
                              <Square className="h-4 w-4 text-slate-400" />
                            )}
                          </button>
                        </TableHead>
                        {visibleColumns.has('title') && (
                          <TableHead className="text-slate-300">
                            <button
                              onClick={() => handleSort('title')}
                              className="flex items-center gap-1 hover:text-white"
                            >
                              Title
                              {sortColumn === 'title' ? (
                                sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                              ) : (
                                <ArrowUpDown className="h-3 w-3 text-slate-500" />
                              )}
                            </button>
                          </TableHead>
                        )}
                        {visibleColumns.has('type') && (
                          <TableHead className="text-slate-300">
                            <button
                              onClick={() => handleSort('type')}
                              className="flex items-center gap-1 hover:text-white"
                            >
                              Type
                              {sortColumn === 'type' ? (
                                sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                              ) : (
                                <ArrowUpDown className="h-3 w-3 text-slate-500" />
                              )}
                            </button>
                          </TableHead>
                        )}
                        {visibleColumns.has('severity') && (
                          <TableHead className="text-slate-300">
                            <button
                              onClick={() => handleSort('severity')}
                              className="flex items-center gap-1 hover:text-white"
                            >
                              Severity
                              {sortColumn === 'severity' ? (
                                sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                              ) : (
                                <ArrowUpDown className="h-3 w-3 text-slate-500" />
                              )}
                            </button>
                          </TableHead>
                        )}
                        {visibleColumns.has('status') && (
                          <TableHead className="text-slate-300">
                            <button
                              onClick={() => handleSort('status')}
                              className="flex items-center gap-1 hover:text-white"
                            >
                              Status
                              {sortColumn === 'status' ? (
                                sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                              ) : (
                                <ArrowUpDown className="h-3 w-3 text-slate-500" />
                              )}
                            </button>
                          </TableHead>
                        )}
                        {visibleColumns.has('location') && (
                          <TableHead className="text-slate-300">Location</TableHead>
                        )}
                        {visibleColumns.has('assignedTo') && (
                          <TableHead className="text-slate-300">Assigned To</TableHead>
                        )}
                        {visibleColumns.has('photos') && (
                          <TableHead className="text-slate-300">Photos</TableHead>
                        )}
                        {visibleColumns.has('createdAt') && (
                          <TableHead className="text-slate-300">
                            <button
                              onClick={() => handleSort('createdAt')}
                              className="flex items-center gap-1 hover:text-white"
                            >
                              Created
                              {sortColumn === 'createdAt' ? (
                                sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                              ) : (
                                <ArrowUpDown className="h-3 w-3 text-slate-500" />
                              )}
                            </button>
                          </TableHead>
                        )}
                        {visibleColumns.has('actions') && (
                          <TableHead className="text-slate-300">Actions</TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                    {loading ? (
                      <TableRow className="border-slate-800">
                        <TableCell colSpan={visibleColumns.size + 1} className="text-center py-8 text-slate-400">
                          Loading...
                        </TableCell>
                      </TableRow>
                    ) : recentReports.length === 0 ? (
                      <TableRow className="border-slate-800">
                        <TableCell colSpan={visibleColumns.size + 1} className="text-center py-8 text-slate-400">
                          No reports found
                        </TableCell>
                      </TableRow>
                    ) : (
                      recentReports.map((report) => (
                        <TableRow key={report.id} className="border-slate-800 hover:bg-slate-800/50">
                          <TableCell>
                            <button
                              onClick={() => handleSelectReport(report.id)}
                              className="flex items-center justify-center"
                            >
                              {selectedReports.has(report.id) ? (
                                <CheckSquare className="h-4 w-4 text-blue-400" />
                              ) : (
                                <Square className="h-4 w-4 text-slate-400" />
                              )}
                            </button>
                          </TableCell>
                          {visibleColumns.has('title') && (
                            <TableCell className="font-medium text-white max-w-xs truncate">{report.title}</TableCell>
                          )}
                          {visibleColumns.has('type') && (
                            <TableCell className="whitespace-nowrap">
                              <Badge variant="outline" className="border-slate-700 text-slate-300 whitespace-nowrap px-2 py-1 min-w-[80px] text-center inline-block">
                                {getTypeDisplayName(report.type)}
                              </Badge>
                            </TableCell>
                          )}
                          {visibleColumns.has('severity') && (
                            <TableCell>
                              <Badge variant={report.severity === 'high' ? 'destructive' : report.severity === 'medium' ? 'default' : 'secondary'} className="px-2 py-1 min-w-[80px] text-center inline-block">
                                {report.severity}
                              </Badge>
                            </TableCell>
                          )}
                          {visibleColumns.has('status') && (
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Badge className={`${getStatusBadgeClassName(report.status)} border text-xs px-2 py-1 min-w-[80px] text-center inline-block`}>
                                  {report.status}
                                </Badge>
                                {isOverdue(report) && (
                                  <Badge variant="destructive" className="text-xs px-2 py-0.5">
                                    Overdue
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                          )}
                          {visibleColumns.has('location') && (
                            <TableCell className="text-slate-300 text-sm">
                              <div className="flex items-center gap-1">
                                <MapPin className="h-3 w-3 text-slate-500 flex-shrink-0" />
                                <button
                                  onClick={() => {
                                    if (report.district) {
                                      setFilterDistrict(report.district)
                                      setSelectedDistrict(report.district)
                                    }
                                    if (report.province) {
                                      setFilterProvince(report.province)
                                      setSelectedProvince(report.province)
                                    }
                                  }}
                                  className="hover:text-blue-400 hover:underline text-left max-w-[150px] truncate"
                                  title={`Click to filter by ${formatLocation(report)}`}
                                >
                                  {formatLocation(report)}
                                </button>
                              </div>
                            </TableCell>
                          )}
                          {visibleColumns.has('assignedTo') && (
                            <TableCell className="text-slate-300 text-sm">
                              {report.currentAssignment?.assignee ? (
                                <span>{report.currentAssignment.assignee.fullName || report.currentAssignment.assignee.email}</span>
                              ) : report.currentAssignment?.organization ? (
                                <span>{report.currentAssignment.organization.name}</span>
                              ) : (
                                <span className="text-slate-500">Unassigned</span>
                              )}
                            </TableCell>
                          )}
                          {visibleColumns.has('photos') && (
                            <TableCell className="text-slate-400 text-sm">
                              {getPhotoCount(report) > 0 ? (
                                <Badge variant="secondary" className="bg-blue-500/20 text-blue-300 border-blue-500/50 text-xs px-2 py-1">
                                  <Camera className="h-3 w-3 mr-1 inline" />
                                  {getPhotoCount(report)}
                                </Badge>
                              ) : (
                                <span className="text-slate-500 text-xs">No photos</span>
                              )}
                            </TableCell>
                          )}
                          {visibleColumns.has('createdAt') && (
                            <TableCell className="text-slate-400 text-sm">
                              {format(new Date(report.createdAt), 'MMM d, yyyy')}
                            </TableCell>
                          )}
                          {visibleColumns.has('actions') && (
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 text-slate-400 hover:text-white hover:bg-slate-800"
                                  >
                                    <MoreVertical className="h-4 w-4" />
                                    <span className="sr-only">Open menu</span>
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="bg-slate-900 border-slate-700 text-white">
                                  <DropdownMenuItem
                                    onClick={() => handleViewReport(report)}
                                    className="text-blue-400 focus:text-blue-300 focus:bg-slate-800 cursor-pointer"
                                  >
                                    <Eye className="h-4 w-4 mr-2" />
                                    View Details
                                  </DropdownMenuItem>
                                  {report.status === 'new' && (
                                    <DropdownMenuItem
                                      onClick={() => handleQuickTriage(report)}
                                      disabled={updatingStatus === report.id}
                                      className="text-purple-400 focus:text-purple-300 focus:bg-slate-800 cursor-pointer disabled:opacity-50"
                                    >
                                      <UserCheck className="h-4 w-4 mr-2" />
                                      Mark as Triaged
                                    </DropdownMenuItem>
                                  )}
                                  {(report.status === 'new' || report.status === 'triaged') && (
                                    <DropdownMenuItem
                                      onClick={() => handleQuickAssign(report)}
                                      className="text-orange-400 focus:text-orange-300 focus:bg-slate-800 cursor-pointer"
                                    >
                                      <Send className="h-4 w-4 mr-2" />
                                      Assign Report
                                    </DropdownMenuItem>
                                  )}
                                  {report.status === 'in_progress' && (
                                    <>
                                      <DropdownMenuSeparator className="bg-slate-700" />
                                      <DropdownMenuItem
                                        onClick={() => handleQuickResolve(report)}
                                        disabled={updatingStatus === report.id}
                                        className="text-green-400 focus:text-green-300 focus:bg-slate-800 cursor-pointer disabled:opacity-50"
                                      >
                                        <CheckCircle className="h-4 w-4 mr-2" />
                                        Mark as Resolved
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          )}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {sortedReports.length > 0 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-800">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-400">
                        Showing {startIndex + 1} to {Math.min(startIndex + pageSize, sortedReports.length)} of {sortedReports.length} reports
                      </span>
                      <Select
                        value={String(pageSize)}
                        onValueChange={(value) => {
                          setPageSize(Number(value))
                          setCurrentPage(1)
                        }}
                      >
                        <SelectTrigger className="w-[100px] h-8 bg-slate-800 border-slate-700 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="5">5</SelectItem>
                          <SelectItem value="10">10</SelectItem>
                        </SelectContent>
                      </Select>
                      <span className="text-sm text-slate-400">per page</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setCurrentPage(1)}
                        disabled={currentPage === 1}
                        className="text-slate-400 hover:text-white"
                      >
                        First
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                        className="text-slate-400 hover:text-white"
                      >
                        Previous
                      </Button>
                      <span className="text-sm text-slate-400 px-2">
                        Page {currentPage} of {totalPages}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages}
                        className="text-slate-400 hover:text-white"
                      >
                        Next
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setCurrentPage(totalPages)}
                        disabled={currentPage === totalPages}
                        className="text-slate-400 hover:text-white"
                      >
                        Last
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            </div>
          )}
        </div>
      </div>

      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-4xl max-h-[95vh] md:max-h-[90vh] overflow-y-auto bg-slate-900 border-slate-800 text-white p-0">
          {selectedReport && (
            <ReportDetailView
              key={`${selectedReport.id}-${reportDetailKey}`}
              reportId={selectedReport.id}
              onUpdate={handleReportUpdated}
              onClose={() => setIsDetailOpen(false)}
              userRole="admin"
            />
          )}
        </DialogContent>
      </Dialog>

      <AssignReportDialog
        isAssignDialogOpen={isAssignDialogOpen}
        setIsAssignDialogOpen={setIsAssignDialogOpen}
        assignData={assignData}
        setAssignData={setAssignData}
        users={users}
        organizations={organizations}
        usersLoading={usersLoading}
        usersError={usersError}
        handleAssignSubmit={handleAssignSubmit}
      />
    </div>
  )
}