'use client'

import type { Dispatch, SetStateAction } from 'react'
import { type AdminReport, type OfficerMetrics } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { GaugeChart } from '@/components/gauge-chart'
import { TrendingUp, FileText, RefreshCw, UserCheck } from 'lucide-react'

export interface OfficerMetricsSectionProps {
  reports: AdminReport[]
  officerMetrics: OfficerMetrics[]
  officerMetricsLoading: boolean
  officerMetricsPage: number
  setOfficerMetricsPage: Dispatch<SetStateAction<number>>
  officerMetricsPageSize: number
  setOfficerMetricsPageSize: Dispatch<SetStateAction<number>>
  officerMetricsSort: "highest" | "lowest"
  setOfficerMetricsSort: Dispatch<SetStateAction<"highest" | "lowest">>
  fetchOfficerMetrics: () => Promise<void>
}

export function OfficerMetricsSection({ reports, officerMetrics, officerMetricsLoading, officerMetricsPage, setOfficerMetricsPage, officerMetricsPageSize, setOfficerMetricsPageSize, officerMetricsSort, setOfficerMetricsSort, fetchOfficerMetrics }: OfficerMetricsSectionProps) {
  return (
    <>
    {/* Officer Metrics Section */}
    <div className="space-y-6">
      <Card className="bg-gradient-to-br from-slate-900 to-slate-800 border-slate-700 hover:border-slate-600 transition-all">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-white text-xl flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-blue-400" />
                Officer Performance Metrics
              </CardTitle>
              <CardDescription className="text-slate-400">
                Case statistics and success rates for all officers
              </CardDescription>
            </div>
            <Button
              onClick={fetchOfficerMetrics}
              variant="outline"
              size="sm"
              disabled={officerMetricsLoading}
              className="bg-slate-800/50 border-slate-700 text-white hover:bg-slate-700 hover:border-slate-600 transition-all"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${officerMetricsLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {officerMetricsLoading ? (
            <div className="text-center py-8 text-slate-400">Loading officer metrics...</div>
          ) : officerMetrics.length === 0 ? (
            <div className="text-center py-8 text-slate-400">No officer metrics available</div>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid gap-4 sm:grid-cols-3 mb-6">
                <Card className="bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-slate-300">Total Officers</CardTitle>
                    <div className="p-2 rounded-lg bg-blue-500/10">
                      <UserCheck className="h-4 w-4 text-blue-400" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-white">{officerMetrics.length}</div>
                    <p className="text-xs text-slate-400 mt-1">Active officers</p>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-slate-300">Total Cases</CardTitle>
                    <div className="p-2 rounded-lg bg-purple-500/10">
                      <FileText className="h-4 w-4 text-purple-400" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-white">
                      {officerMetrics.reduce((sum, m) => sum + m.totalCases, 0)}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">Across all officers</p>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-slate-300">Avg Success Rate</CardTitle>
                    <div className="p-2 rounded-lg bg-green-500/10">
                      <TrendingUp className="h-4 w-4 text-green-400" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-white">
                      {officerMetrics.length > 0
                        ? Math.round(
                            officerMetrics.reduce((sum, m) => sum + m.successRate, 0) / officerMetrics.length
                          )
                        : 0}
                      %
                    </div>
                    <p className="text-xs text-slate-400 mt-1">Average across all officers</p>
                  </CardContent>
                </Card>
              </div>

              {/* Gauge Charts Visualization */}
              {officerMetrics.length > 0 && (() => {
                // Calculate current active assignments for each officer
                const officerAssignments = new Map<string, { count: number; tasks: Array<{ id: string; title: string; status: string }> }>()

                // Initialize all officers with 0 assignments
                officerMetrics.forEach(officer => {
                  officerAssignments.set(officer.officerId, { count: 0, tasks: [] })
                })

                // Count active assignments from reports
                reports.forEach(report => {
                  const assigneeId = report.currentAssignment?.assignee?.id
                  if (assigneeId && officerAssignments.has(assigneeId)) {
                    // Only count non-resolved, non-rejected reports as active assignments
                    if (report.status !== 'resolved' && report.status !== 'rejected') {
                      const current = officerAssignments.get(assigneeId)!
                      current.count++
                      current.tasks.push({
                        id: report.id,
                        title: report.title,
                        status: report.status
                      })
                      officerAssignments.set(assigneeId, current)
                    }
                  }
                })

                // Enrich officer metrics with assignment data
                const officersWithAssignments = officerMetrics.map(officer => ({
                  ...officer,
                  currentAssignments: officerAssignments.get(officer.officerId) || { count: 0, tasks: [] },
                  isFree: (officerAssignments.get(officer.officerId)?.count || 0) === 0
                }))

                // Sort officers based on selected sort option
                const sortedOfficers = [...officersWithAssignments].sort((a, b) => {
                  if (officerMetricsSort === 'highest') {
                    return b.successRate - a.successRate
                  } else {
                    return a.successRate - b.successRate
                  }
                })

                // Calculate pagination
                const totalOfficerPages = Math.ceil(sortedOfficers.length / officerMetricsPageSize)
                const startOfficerIndex = (officerMetricsPage - 1) * officerMetricsPageSize
                const paginatedOfficers = sortedOfficers.slice(
                  startOfficerIndex,
                  startOfficerIndex + officerMetricsPageSize
                )

                return (
                  <Card className="bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700 mb-6">
                    <CardHeader>
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div>
                          <CardTitle className="text-white text-lg">Success Rate by Officer</CardTitle>
                          <CardDescription className="text-slate-400">Individual officer performance metrics</CardDescription>
                        </div>
                        <div className="flex items-center gap-3">
                          <Select
                            value={officerMetricsSort}
                            onValueChange={(value: 'highest' | 'lowest') => {
                              setOfficerMetricsSort(value)
                              setOfficerMetricsPage(1)
                            }}
                          >
                            <SelectTrigger className="w-[160px] bg-slate-800 border-slate-700 text-slate-300">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="highest">Highest First</SelectItem>
                              <SelectItem value="lowest">Lowest First</SelectItem>
                            </SelectContent>
                          </Select>
                          <Select
                            value={String(officerMetricsPageSize)}
                            onValueChange={(value) => {
                              setOfficerMetricsPageSize(Number(value))
                              setOfficerMetricsPage(1)
                            }}
                          >
                            <SelectTrigger className="w-[120px] bg-slate-800 border-slate-700 text-slate-300">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="10">10 per page</SelectItem>
                              <SelectItem value="20">20 per page</SelectItem>
                              <SelectItem value="30">30 per page</SelectItem>
                              <SelectItem value="50">50 per page</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 py-4">
                        {paginatedOfficers.map((officer: any) => (
                          <div
                            key={officer.officerId}
                            className="flex flex-col p-4 rounded-lg bg-slate-800/50 border border-slate-700 hover:border-slate-600 transition-colors"
                          >
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex-1">
                                <h3 className="text-sm font-semibold text-white mb-1">{officer.officerName}</h3>
                                <p className="text-xs text-slate-400">{officer.officerEmail}</p>
                              </div>
                              <Badge 
                                className={`${
                                  officer.isFree 
                                    ? 'bg-green-500/10 text-green-400 border-green-500/20' 
                                    : 'bg-orange-500/10 text-orange-400 border-orange-500/20'
                                } text-xs px-2 py-1 min-w-[60px] text-center inline-block`}
                              >
                                {officer.isFree ? 'Free' : 'Busy'}
                              </Badge>
                            </div>

                            <div className="flex items-center justify-center mb-3">
                              <GaugeChart
                                value={officer.successRate}
                                label=""
                                size={120}
                                strokeWidth={12}
                              />
                            </div>

                            <div className="space-y-2 text-xs">
                              <div className="flex items-center justify-between text-slate-300">
                                <span>Resolved:</span>
                                <span className="font-medium">{officer.resolvedCases} / {officer.totalCases}</span>
                              </div>
                              <div className="flex items-center justify-between text-slate-300">
                                <span>Current Tasks:</span>
                                <span className={`font-medium ${
                                  officer.currentAssignments?.count > 0 ? 'text-orange-400' : 'text-green-400'
                                }`}>
                                  {officer.currentAssignments?.count || 0}
                                </span>
                              </div>
                              {officer.currentAssignments?.count > 0 && (
                                <div className="mt-2 pt-2 border-t border-slate-700">
                                  <p className="text-slate-400 mb-1">Active Tasks:</p>
                                  <div className="space-y-1 max-h-24 overflow-y-auto">
                                    {officer.currentAssignments.tasks.slice(0, 3).map((task: any) => (
                                      <div key={task.id} className="text-slate-300 truncate" title={task.title}>
                                        • {task.title}
                                      </div>
                                    ))}
                                    {officer.currentAssignments.tasks.length > 3 && (
                                      <div className="text-slate-400 text-xs">
                                        +{officer.currentAssignments.tasks.length - 3} more
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Pagination Controls */}
                      {totalOfficerPages > 1 && (
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-slate-700">
                          <div className="text-sm text-slate-400">
                            Showing {startOfficerIndex + 1} to {Math.min(startOfficerIndex + officerMetricsPageSize, sortedOfficers.length)} of {sortedOfficers.length} officers
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setOfficerMetricsPage(1)}
                              disabled={officerMetricsPage === 1}
                              className="text-slate-400 hover:text-white"
                            >
                              First
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setOfficerMetricsPage(prev => Math.max(1, prev - 1))}
                              disabled={officerMetricsPage === 1}
                              className="text-slate-400 hover:text-white"
                            >
                              Previous
                            </Button>
                            <span className="text-sm text-slate-400 px-2">
                              Page {officerMetricsPage} of {totalOfficerPages}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setOfficerMetricsPage(prev => Math.min(totalOfficerPages, prev + 1))}
                              disabled={officerMetricsPage === totalOfficerPages}
                              className="text-slate-400 hover:text-white"
                            >
                              Next
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setOfficerMetricsPage(totalOfficerPages)}
                              disabled={officerMetricsPage === totalOfficerPages}
                              className="text-slate-400 hover:text-white"
                            >
                              Last
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })()}
            </>
          )}
        </CardContent>
      </Card>
    </div>
    </>
  )
}
