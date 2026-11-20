'use client'

import type { Dispatch, SetStateAction } from 'react'
import { type AdminReport } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PieChart, PieChart as PieChartIcon } from 'lucide-react'
import { BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart as RechartsPieChart, Pie, Cell, Sector } from 'recharts'

export interface StatusTypeChartsProps {
  reports: AdminReport[]
  loading: boolean
  statusPieActiveIndex: number | undefined
  setStatusPieActiveIndex: Dispatch<SetStateAction<number | undefined>>
  isMobile: boolean
  statusData: { name: string; value: number; color: string; }[]
  typeData: { name: string; value: number; }[]
}

export function StatusTypeCharts({ reports, loading, statusPieActiveIndex, setStatusPieActiveIndex, isMobile, statusData, typeData }: StatusTypeChartsProps) {
  return (
    <>
    {/* Charts Row */}
    {!loading && reports.length > 0 && (
      <div className="space-y-6">
        <div className="flex items-center gap-2 mb-2">
          <PieChart className="h-5 w-5 text-slate-400" />
          <h2 className="text-xl font-semibold text-white">Distribution Analytics</h2>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Reports by Status (Pie Chart) */}
          <Card className="bg-gradient-to-br from-slate-900 to-slate-800 border-slate-700 hover:border-slate-600 transition-all">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-lg">Reports by Status</CardTitle>
              <CardDescription className="text-slate-400">Distribution of report statuses</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center h-[300px]">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                </div>
              ) : statusData.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[300px]">
                  <PieChartIcon className="h-12 w-12 text-slate-600 mb-3" />
                  <p className="text-slate-400 text-sm">No status data available</p>
                  <p className="text-slate-500 text-xs mt-1">Reports will appear here once data is available</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <RechartsPieChart role="img" aria-label="Reports by status distribution chart">
                    <defs>
                      {statusData.map((entry, index) => (
                        <linearGradient key={`pieGradient-${index}`} id={`pieGradient-${index}`} x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0%" stopColor={entry.color} stopOpacity={1} />
                          <stop offset="100%" stopColor={entry.color} stopOpacity={0.7} />
                        </linearGradient>
                      ))}
                    </defs>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent, cx, cy, midAngle, innerRadius, outerRadius }) => {
                        const RADIAN = Math.PI / 180
                        const radius = innerRadius + (outerRadius - innerRadius) * 0.5
                        const x = cx + radius * Math.cos(-midAngle * RADIAN)
                        const y = cy + radius * Math.sin(-midAngle * RADIAN)

                        // Show labels for segments >3% to include more segments
                        if (percent < 0.03) return null

                        // Adjust font size for small segments
                        const fontSize = percent < 0.05 ? (isMobile ? 9 : 10) : (isMobile ? 10 : 11)

                        return (
                          <text 
                            x={x} 
                            y={y} 
                            fill="#e2e8f0" 
                            textAnchor="middle"
                            dominantBaseline="central"
                            fontSize={fontSize}
                            fontWeight="500"
                            style={{ pointerEvents: 'none' }}
                          >
                            {`${(percent * 100).toFixed(0)}%`}
                          </text>
                        )
                      }}
                      outerRadius={isMobile ? 70 : 90}
                      innerRadius={isMobile ? 25 : 30}
                      fill="#8884d8"
                      dataKey="value"
                      paddingAngle={2}
                      activeIndex={statusPieActiveIndex}
                      activeShape={(props: any) => {
                        const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props
                        return (
                          <Sector
                            cx={cx}
                            cy={cy}
                            innerRadius={innerRadius}
                            outerRadius={outerRadius + 5}
                            startAngle={startAngle}
                            endAngle={endAngle}
                            fill={fill}
                            opacity={0.9}
                          />
                        )
                      }}
                      onMouseEnter={(_, index) => setStatusPieActiveIndex(index)}
                      onMouseLeave={() => setStatusPieActiveIndex(undefined)}
                      animationBegin={0}
                      animationDuration={600}
                      animationEasing="ease-out"
                    >
                      {statusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={`url(#pieGradient-${index})`} stroke="#1e293b" strokeWidth={2} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#0f172a', 
                        border: '1px solid #1e293b', 
                        borderRadius: '10px',
                        padding: '12px',
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.4), 0 4px 6px -2px rgba(0, 0, 0, 0.3)'
                      }}
                      labelStyle={{ color: '#e2e8f0', fontWeight: '600', marginBottom: '6px', fontSize: '13px' }}
                      itemStyle={{ color: '#cbd5e1', fontWeight: '500' }}
                    />
                    <Legend 
                      verticalAlign="bottom" 
                      height={36}
                      iconType="circle"
                      wrapperStyle={{ color: '#cbd5e1', fontSize: isMobile ? '11px' : '12px' }}
                      formatter={(value) => {
                        const entry = statusData.find(d => d.name === value)
                        return (
                          <span style={{ color: entry?.color || '#cbd5e1', fontWeight: '500' }}>
                            {value}: {entry?.value || 0}
                          </span>
                        )
                      }}
                    />
                  </RechartsPieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Reports by Type */}
          <Card className="bg-gradient-to-br from-slate-900 to-slate-800 border-slate-700 hover:border-slate-600 transition-all shadow-xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-lg font-bold">Reports by Type</CardTitle>
              <CardDescription className="text-slate-400">Infrastructure issue categories</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={320}>
                <RechartsBarChart data={typeData} layout="vertical" margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <defs>
                    <linearGradient id="barGradient" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="#059669" stopOpacity={1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                  <XAxis 
                    type="number" 
                    stroke="#9ca3af" 
                    fontSize={12}
                    tick={{ fill: '#9ca3af' }}
                    tickLine={{ stroke: '#4b5563' }}
                  />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    stroke="#9ca3af" 
                    fontSize={12}
                    width={100}
                    tick={{ fill: '#e5e7eb' }}
                    tickLine={{ stroke: '#4b5563' }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#0f172a', 
                      border: '1px solid #334155', 
                      borderRadius: '8px',
                      padding: '12px',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)'
                    }}
                    labelStyle={{ color: '#e5e7eb', fontWeight: 'bold', marginBottom: '4px' }}
                    itemStyle={{ color: '#10b981', fontWeight: '600' }}
                    cursor={{ fill: 'rgba(16, 185, 129, 0.1)' }}
                  />
                  <Bar 
                    dataKey="value" 
                    fill="url(#barGradient)" 
                    radius={[0, 8, 8, 0]}
                    animationDuration={800}
                    animationEasing="ease-out"
                  >
                    {typeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} />
                    ))}
                  </Bar>
                </RechartsBarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    )}
    </>
  )
}
