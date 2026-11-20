'use client'

import { type AdminReport } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart3 } from 'lucide-react'
import { BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

export interface TimeChartsProps {
  reports: AdminReport[]
  loading: boolean
  hourlyData: { hour: number; label: string; reports: number; }[]
  monthlyData: { month: string; reports: number; }[]
  weeklyData: { week: string; label: string; weekStart: Date; reports: number; }[]
  dailyData: { day: string; date: Date; reports: number; }[]
}

export function TimeCharts({ reports, loading, hourlyData, monthlyData, weeklyData, dailyData }: TimeChartsProps) {
  return (
    <>
    {/* Time-based Charts Row */}
    {!loading && reports.length > 0 && (
      <div className="space-y-6">
        <div className="flex items-center gap-2 mb-2">
          <BarChart3 className="h-5 w-5 text-slate-400" />
          <h2 className="text-xl font-semibold text-white">Time-Based Analytics</h2>
        </div>

        {/* Monthly and Weekly Charts - Top Row */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Monthly Reports Chart */}
          <Card className="bg-gradient-to-br from-slate-900 to-slate-800 border-slate-700 hover:border-slate-600 transition-all">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-lg">Monthly Reports</CardTitle>
              <CardDescription className="text-slate-400">Reports created over the last 12 months</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <RechartsBarChart data={monthlyData}>
                  <defs>
                    <linearGradient id="monthlyGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={1} />
                      <stop offset="100%" stopColor="#2563eb" stopOpacity={0.8} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                  <XAxis 
                    dataKey="month" 
                    stroke="#94a3b8" 
                    fontSize={12}
                    tick={{ fill: '#cbd5e1' }}
                    tickLine={{ stroke: '#475569' }}
                  />
                  <YAxis 
                    stroke="#94a3b8" 
                    fontSize={12}
                    tick={{ fill: '#cbd5e1' }}
                    tickLine={{ stroke: '#475569' }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#0f172a', 
                      border: '1px solid #1e293b', 
                      borderRadius: '10px',
                      padding: '12px',
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.4), 0 4px 6px -2px rgba(0, 0, 0, 0.3)'
                    }}
                    labelStyle={{ color: '#e2e8f0', fontWeight: '600', marginBottom: '6px', fontSize: '13px' }}
                    itemStyle={{ color: '#60a5fa', fontWeight: '500' }}
                    cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }}
                  />
                  <Bar dataKey="reports" fill="url(#monthlyGradient)" radius={[8, 8, 0, 0]} animationDuration={600} />
                </RechartsBarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Weekly Reports Chart */}
          <Card className="bg-gradient-to-br from-slate-900 to-slate-800 border-slate-700 hover:border-slate-600 transition-all">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-lg">Weekly Reports</CardTitle>
              <CardDescription className="text-slate-400">Reports created over the last 8 weeks</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <RechartsBarChart data={weeklyData}>
                  <defs>
                    <linearGradient id="weeklyGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity={1} />
                      <stop offset="100%" stopColor="#d97706" stopOpacity={0.8} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                  <XAxis 
                    dataKey="label" 
                    stroke="#94a3b8" 
                    angle={-45}
                    textAnchor="end"
                    height={80}
                    fontSize={12}
                    tick={{ fill: '#cbd5e1' }}
                    tickLine={{ stroke: '#475569' }}
                  />
                  <YAxis 
                    stroke="#94a3b8" 
                    fontSize={12}
                    tick={{ fill: '#cbd5e1' }}
                    tickLine={{ stroke: '#475569' }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#0f172a', 
                      border: '1px solid #1e293b', 
                      borderRadius: '10px',
                      padding: '12px',
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.4), 0 4px 6px -2px rgba(0, 0, 0, 0.3)'
                    }}
                    labelStyle={{ color: '#e2e8f0', fontWeight: '600', marginBottom: '6px', fontSize: '13px' }}
                    itemStyle={{ color: '#fbbf24', fontWeight: '500' }}
                    cursor={{ fill: 'rgba(245, 158, 11, 0.1)' }}
                  />
                  <Bar dataKey="reports" fill="url(#weeklyGradient)" radius={[8, 8, 0, 0]} animationDuration={600} />
                </RechartsBarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Daily and Hourly Reports Charts - Bottom Row */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Daily Reports Chart */}
          <Card className="bg-gradient-to-br from-slate-900 to-slate-800 border-slate-700 hover:border-slate-600 transition-all">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-lg">Daily Reports</CardTitle>
              <CardDescription className="text-slate-400">Reports created over the last 30 days</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <RechartsBarChart data={dailyData}>
                  <defs>
                    <linearGradient id="dailyGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={1} />
                      <stop offset="100%" stopColor="#059669" stopOpacity={0.8} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                  <XAxis 
                    dataKey="day" 
                    stroke="#94a3b8" 
                    angle={-45}
                    textAnchor="end"
                    height={80}
                    interval={4}
                    fontSize={12}
                    tick={{ fill: '#cbd5e1' }}
                    tickLine={{ stroke: '#475569' }}
                  />
                  <YAxis 
                    stroke="#94a3b8" 
                    fontSize={12}
                    tick={{ fill: '#cbd5e1' }}
                    tickLine={{ stroke: '#475569' }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#0f172a', 
                      border: '1px solid #1e293b', 
                      borderRadius: '10px',
                      padding: '12px',
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.4), 0 4px 6px -2px rgba(0, 0, 0, 0.3)'
                    }}
                    labelStyle={{ color: '#e2e8f0', fontWeight: '600', marginBottom: '6px', fontSize: '13px' }}
                    itemStyle={{ color: '#34d399', fontWeight: '500' }}
                    cursor={{ fill: 'rgba(16, 185, 129, 0.1)' }}
                  />
                  <Bar dataKey="reports" fill="url(#dailyGradient)" radius={[8, 8, 0, 0]} animationDuration={600} />
                </RechartsBarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Reports by Hour of Day */}
          <Card className="bg-gradient-to-br from-slate-900 to-slate-800 border-slate-700 hover:border-slate-600 transition-all">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-lg">Reports by Hour of Day</CardTitle>
              <CardDescription className="text-slate-400">Distribution of reports throughout the day</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <RechartsBarChart data={hourlyData}>
                  <defs>
                    <linearGradient id="hourlyGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8b5cf6" stopOpacity={1} />
                      <stop offset="100%" stopColor="#7c3aed" stopOpacity={0.8} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                  <XAxis 
                    dataKey="label" 
                    stroke="#94a3b8" 
                    angle={-45}
                    textAnchor="end"
                    height={80}
                    interval={2}
                    fontSize={12}
                    tick={{ fill: '#cbd5e1' }}
                    tickLine={{ stroke: '#475569' }}
                  />
                  <YAxis 
                    stroke="#94a3b8" 
                    fontSize={12}
                    tick={{ fill: '#cbd5e1' }}
                    tickLine={{ stroke: '#475569' }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#0f172a', 
                      border: '1px solid #1e293b', 
                      borderRadius: '10px',
                      padding: '12px',
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.4), 0 4px 6px -2px rgba(0, 0, 0, 0.3)'
                    }}
                    labelStyle={{ color: '#e2e8f0', fontWeight: '600', marginBottom: '6px', fontSize: '13px' }}
                    itemStyle={{ color: '#a78bfa', fontWeight: '500' }}
                    cursor={{ fill: 'rgba(139, 92, 246, 0.1)' }}
                  />
                  <Bar dataKey="reports" fill="url(#hourlyGradient)" radius={[8, 8, 0, 0]} animationDuration={600} />
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
