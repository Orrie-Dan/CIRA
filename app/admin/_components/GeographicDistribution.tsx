'use client'

import type { Dispatch, SetStateAction } from 'react'
import { type GeographicData } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendingUp, TrendingDown, AlertCircle, CheckCircle2, MapPin, X } from 'lucide-react'
import { BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart as RechartsPieChart, Pie, Cell } from 'recharts'
import { RWANDA_PROVINCES } from '@cira/shared'

const TOTAL_RWANDA_PROVINCES = RWANDA_PROVINCES.length

export interface GeographicDistributionProps {
  setFilterProvince: Dispatch<SetStateAction<string | null>>
  setFilterDistrict: Dispatch<SetStateAction<string | null>>
  geographicData: GeographicData | null
  geographicLoading: boolean
  selectedProvince: string | null
  setSelectedProvince: Dispatch<SetStateAction<string | null>>
  selectedDistrict: string | null
  setSelectedDistrict: Dispatch<SetStateAction<string | null>>
  isMobile: boolean
  filteredGeographicData: { provinces: { name: string; count: number; }[]; districts: { name: string; count: number; province: string; }[]; sectors: { name: string; count: number; district: string; province: string; }[]; } | null
}

export function GeographicDistribution({ setFilterProvince, setFilterDistrict, geographicData, geographicLoading, selectedProvince, setSelectedProvince, selectedDistrict, setSelectedDistrict, isMobile, filteredGeographicData }: GeographicDistributionProps) {
  return (
    <>
    {/* Geographic Distribution Charts */}
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-2">
        <MapPin className="h-5 w-5 text-slate-400" />
        <h2 className="text-xl font-semibold text-white">Geographic Distribution</h2>
      </div>
      {geographicLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      ) : geographicData ? (
        <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
          {/* Province Distribution */}
          <Card className="bg-gradient-to-br from-slate-900 to-slate-800 border-slate-700 hover:border-slate-600 transition-all">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-white">Province Distribution</CardTitle>
                  <CardDescription className="text-slate-400">
                    {selectedProvince ? `Filtered: ${selectedProvince}` : 'Reports by province - Click to filter districts'}
                  </CardDescription>
                </div>
                {selectedProvince && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedProvince(null)
                      setFilterProvince(null) // Clear report filter
                      setSelectedDistrict(null)
                      setFilterDistrict(null) // Clear report filter
                    }}
                    className="text-slate-400 hover:text-white"
                  >
                    <X className="h-4 w-4 mr-1" />
                    Clear
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {geographicLoading ? (
                <div className="flex items-center justify-center h-[300px]">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                </div>
              ) : !geographicData || !geographicData.provinces || geographicData.provinces.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[300px]">
                  <MapPin className="h-12 w-12 text-slate-600 mb-3" />
                  <p className="text-slate-400 text-sm">No geographic data available</p>
                  <p className="text-slate-500 text-xs mt-1">Province data will appear here once reports are available</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <RechartsPieChart role="img" aria-label="Geographic province distribution chart">
                    <defs>
                      {geographicData.provinces.map((entry, index) => {
                        const colors = [
                          '#6366f1', // Indigo
                          '#10b981', // Emerald
                          '#f59e0b', // Amber
                          '#ef4444', // Red
                          '#8b5cf6', // Purple
                          '#06b6d4', // Cyan
                          '#ec4899', // Pink
                          '#14b8a6', // Teal
                        ]
                        return (
                          <linearGradient key={`provinceGradient-${index}`} id={`provinceGradient-${index}`} x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor={colors[index % colors.length]} stopOpacity={1} />
                            <stop offset="100%" stopColor={colors[index % colors.length]} stopOpacity={0.7} />
                          </linearGradient>
                        )
                      })}
                    </defs>
                    <Pie
                      data={geographicData.provinces}
                      dataKey="count"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={isMobile ? 70 : 90}
                      innerRadius={isMobile ? 30 : 40}
                      label={({ name, percent, cx, cy, midAngle, innerRadius, outerRadius }) => {
                        const RADIAN = Math.PI / 180
                        const radius = innerRadius + (outerRadius - innerRadius) * 0.5
                        const x = cx + radius * Math.cos(-midAngle * RADIAN)
                        const y = cy + radius * Math.sin(-midAngle * RADIAN)

                        // Show labels for segments >3% to prevent too many labels
                        if (percent < 0.03) return null

                        // Adjust font size for small segments
                        const fontSize = percent < 0.05 ? (isMobile ? 9 : 10) : (isMobile ? 11 : 12)

                        return (
                          <text 
                            x={x} 
                            y={y} 
                            fill="#e2e8f0" 
                            textAnchor="middle"
                            dominantBaseline="central"
                            fontSize={fontSize}
                            fontWeight="600"
                            style={{ pointerEvents: 'none' }}
                          >
                            {`${(percent * 100).toFixed(0)}%`}
                          </text>
                        )
                      }}
                      labelLine={false}
                      paddingAngle={3}
                      onClick={(data: any) => {
                        if (data && data.name) {
                          setSelectedProvince(data.name)
                          setFilterProvince(data.name) // Also filter reports
                          setSelectedDistrict(null) // Reset district when province changes
                          setFilterDistrict(null) // Also clear district filter
                        }
                      }}
                      style={{ cursor: 'pointer' }}
                      animationBegin={0}
                      animationDuration={600}
                      animationEasing="ease-out"
                      tabIndex={0}
                      onKeyDown={(e: any) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          const data = e.target?.__data__
                          if (data && data.name) {
                            setSelectedProvince(data.name)
                            setFilterProvince(data.name)
                            setSelectedDistrict(null)
                            setFilterDistrict(null)
                          }
                        }
                      }}
                    >
                      {geographicData.provinces.map((entry, index) => {
                        const colors = [
                          '#6366f1', // Indigo
                          '#10b981', // Emerald
                          '#f59e0b', // Amber
                          '#ef4444', // Red
                          '#8b5cf6', // Purple
                          '#06b6d4', // Cyan
                          '#ec4899', // Pink
                          '#14b8a6', // Teal
                        ]
                        const isSelected = selectedProvince === entry.name
                        return (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={`url(#provinceGradient-${index})`}
                            stroke="#1e293b"
                            strokeWidth={2}
                            style={{ 
                              opacity: selectedProvince && !isSelected ? 0.3 : 1,
                              stroke: isSelected ? '#fff' : '#1e293b',
                              strokeWidth: isSelected ? 3 : 2,
                              filter: isSelected ? 'drop-shadow(0 0 8px rgba(255, 255, 255, 0.5))' : 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2))',
                              transition: 'all 0.2s ease',
                            }}
                          />
                        )
                      })}
                    </Pie>
                    {/* Center display */}
                    {selectedProvince ? (
                      <>
                        <text 
                          x="50%" 
                          y="45%" 
                          textAnchor="middle" 
                          fill="#e2e8f0" 
                          fontSize={isMobile ? 18 : 20} 
                          fontWeight="bold"
                        >
                          {geographicData.provinces.find(p => p.name === selectedProvince)?.count || 0}
                        </text>
                        <text 
                          x="50%" 
                          y="55%" 
                          textAnchor="middle" 
                          fill="#94a3b8" 
                          fontSize={isMobile ? 10 : 11}
                        >
                          {selectedProvince}
                        </text>
                      </>
                    ) : (
                      <>
                        <text 
                          x="50%" 
                          y="45%" 
                          textAnchor="middle" 
                          fill="#e2e8f0" 
                          fontSize={isMobile ? 20 : 22} 
                          fontWeight="bold"
                        >
                          {geographicData.provinces.reduce((sum, p) => sum + p.count, 0)}
                        </text>
                        <text 
                          x="50%" 
                          y="55%" 
                          textAnchor="middle" 
                          fill="#94a3b8" 
                          fontSize={isMobile ? 10 : 11}
                        >
                          Total Reports
                        </text>
                      </>
                    )}
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
                      formatter={(value: any, name: any) => {
                        const total = geographicData.provinces.reduce((sum, p) => sum + p.count, 0)
                        const percent = total > 0 ? ((value / total) * 100).toFixed(1) : 0
                        return [`${value} (${percent}%)`, name]
                      }}
                    />
                    <Legend 
                      verticalAlign="bottom" 
                      height={36}
                      iconType="circle"
                      wrapperStyle={{ color: '#cbd5e1', fontSize: isMobile ? '10px' : '11px' }}
                      formatter={(value) => {
                        const province = geographicData.provinces.find(p => p.name === value)
                        const colors = [
                          '#6366f1', '#10b981', '#f59e0b', '#ef4444', 
                          '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6'
                        ]
                        const index = geographicData.provinces.findIndex(p => p.name === value)
                        return (
                          <span style={{ color: index >= 0 ? colors[index % colors.length] : '#cbd5e1' }}>
                            {value}: {province?.count || 0}
                          </span>
                        )
                      }}
                    />
                  </RechartsPieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* District Distribution */}
          <Card className="bg-gradient-to-br from-slate-900 to-slate-800 border-slate-700 hover:border-slate-600 transition-all">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-white">
                    {selectedProvince ? `Districts in ${selectedProvince}` : 'Top Districts'}
                  </CardTitle>
                  <CardDescription className="text-slate-400">
                    {selectedDistrict ? `Filtered: ${selectedDistrict}` : selectedProvince ? 'Click a district to filter sectors' : 'Top 10 districts by report count'}
                  </CardDescription>
                </div>
                {selectedDistrict && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedDistrict(null)
                      setFilterDistrict(null) // Clear report filter
                    }}
                    className="text-slate-400 hover:text-white"
                  >
                    <X className="h-4 w-4 mr-1" />
                    Clear
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <RechartsBarChart
                  data={(filteredGeographicData?.districts || [])
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 10)
                    .map((d) => ({ name: d.name, count: d.count, district: d.name }))}
                >
                  <defs>
                    <linearGradient id="districtGradient" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="#4f46e5" stopOpacity={1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                  <XAxis 
                    dataKey="name" 
                    stroke="#94a3b8" 
                    angle={-45} 
                    textAnchor="end" 
                    height={100}
                    fontSize={12}
                    tick={{ fill: '#cbd5e1', fontSize: 12 }}
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
                    itemStyle={{ color: '#818cf8', fontWeight: '500' }}
                    cursor={{ fill: 'rgba(99, 102, 241, 0.1)' }}
                  />
                  <Bar 
                    dataKey="count" 
                    fill="url(#districtGradient)" 
                    radius={[8, 8, 0, 0]}
                    animationDuration={600}
                    onClick={(data: any) => {
                      if (data && data.district) {
                        setSelectedDistrict(data.district)
                        setFilterDistrict(data.district) // Also filter reports
                      }
                    }}
                    style={{ cursor: 'pointer' }}
                  />
                </RechartsBarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Sector Distribution */}
          <Card className="bg-gradient-to-br from-slate-900 to-slate-800 border-slate-700 hover:border-slate-600 transition-all">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-white">
                    {selectedDistrict ? `Sectors in ${selectedDistrict}` : selectedProvince ? `Sectors in ${selectedProvince}` : 'Top Sectors'}
                  </CardTitle>
                  <CardDescription className="text-slate-400">
                    {selectedDistrict || selectedProvince 
                      ? `${(filteredGeographicData?.sectors || []).length} sectors shown` 
                      : 'Top 10 sectors by report count'}
                  </CardDescription>
                </div>
                {(selectedDistrict || selectedProvince) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedProvince(null)
                      setFilterProvince(null) // Clear report filter
                      setSelectedDistrict(null)
                      setFilterDistrict(null) // Clear report filter
                    }}
                    className="text-slate-400 hover:text-white"
                  >
                    <X className="h-4 w-4 mr-1" />
                    Clear All
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <RechartsBarChart
                  data={(filteredGeographicData?.sectors || [])
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 10)
                    .map((d) => ({ name: d.name, count: d.count }))}
                >
                  <defs>
                    <linearGradient id="sectorGradient" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="#7c3aed" stopOpacity={1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                  <XAxis 
                    dataKey="name" 
                    stroke="#94a3b8" 
                    angle={-45} 
                    textAnchor="end" 
                    height={100}
                    fontSize={12}
                    tick={{ fill: '#cbd5e1', fontSize: 12 }}
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
                  <Bar dataKey="count" fill="url(#sectorGradient)" radius={[8, 8, 0, 0]} animationDuration={600} />
                </RechartsBarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Reports Concentration Index */}
          <Card className="bg-gradient-to-br from-slate-900 to-slate-800 border-slate-700 hover:border-slate-600 transition-all flex flex-col">
            <CardHeader className="flex-shrink-0">
              <CardTitle className="text-white">Distribution Analysis</CardTitle>
              <CardDescription className="text-slate-400">How reports are spread across provinces</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto max-h-[300px] pr-2" style={{ scrollbarWidth: 'thin', scrollbarColor: '#475569 #1e293b' }}>
              {(() => {
                const totalReports = geographicData.provinces.reduce((sum, p) => sum + p.count, 0)

                // Create a map of province counts (including 0 for provinces with no reports)
                const provinceCountMap = new Map<string, number>()
                RWANDA_PROVINCES.forEach(province => {
                  provinceCountMap.set(province, 0)
                })
                geographicData.provinces.forEach(p => {
                  provinceCountMap.set(p.name, p.count)
                })

                // Calculate average using all 5 provinces
                const avgReportsPerProvince = totalReports > 0 ? (totalReports / TOTAL_RWANDA_PROVINCES).toFixed(1) : '0'

                // Calculate concentration
                const provinceCounts = Array.from(provinceCountMap.values())
                const mean = provinceCounts.reduce((a, b) => a + b, 0) / TOTAL_RWANDA_PROVINCES
                const variance = provinceCounts.reduce((sum, count) => sum + Math.pow(count - mean, 2), 0) / TOTAL_RWANDA_PROVINCES
                const stdDev = Math.sqrt(variance)
                const coefficientOfVariation = mean > 0 ? ((stdDev / mean) * 100).toFixed(1) : '0'

                // Most concentrated (highest count)
                const sortedProvinces = Array.from(provinceCountMap.entries())
                  .map(([name, count]) => ({ name, count }))
                  .sort((a, b) => b.count - a.count)
                const mostConcentrated = sortedProvinces[0]
                const concentrationRatio = totalReports > 0 
                  ? ((mostConcentrated.count / totalReports) * 100).toFixed(1) 
                  : '0'

                // Most dispersed (lowest count, including 0)
                const mostDispersed = sortedProvinces[sortedProvinces.length - 1]

                // Diversity index (how many provinces have significant share >= 10%)
                const significantShare = sortedProvinces.filter(p => totalReports > 0 && (p.count / totalReports) >= 0.1).length
                const diversityIndex = ((significantShare / TOTAL_RWANDA_PROVINCES) * 100).toFixed(0)

                // Determine distribution status
                const isEvenlyDistributed = parseFloat(coefficientOfVariation) < 50
                const isModeratelyConcentrated = parseFloat(coefficientOfVariation) >= 50 && parseFloat(coefficientOfVariation) < 100
                const isHighlyConcentrated = parseFloat(coefficientOfVariation) >= 100

                return (
                  <div className="space-y-5 pb-2">
                    {/* Summary Status */}
                    <div className={`rounded-lg p-4 border-2 ${
                      isEvenlyDistributed 
                        ? 'bg-green-500/10 border-green-500/30' 
                        : isModeratelyConcentrated
                        ? 'bg-yellow-500/10 border-yellow-500/30'
                        : 'bg-orange-500/10 border-orange-500/30'
                    }`}>
                      <div className="flex items-center gap-2 mb-2">
                        {isEvenlyDistributed ? (
                          <CheckCircle2 className="h-5 w-5 text-green-400" />
                        ) : isModeratelyConcentrated ? (
                          <AlertCircle className="h-5 w-5 text-yellow-400" />
                        ) : (
                          <AlertCircle className="h-5 w-5 text-orange-400" />
                        )}
                        <span className={`text-sm font-semibold ${
                          isEvenlyDistributed 
                            ? 'text-green-400' 
                            : isModeratelyConcentrated
                            ? 'text-yellow-400'
                            : 'text-orange-400'
                        }`}>
                          {isEvenlyDistributed 
                            ? 'Evenly Distributed' 
                            : isModeratelyConcentrated
                            ? 'Moderately Concentrated'
                            : 'Highly Concentrated'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        {isEvenlyDistributed 
                          ? 'Reports are well-balanced across all provinces, indicating good geographic coverage.'
                          : isModeratelyConcentrated
                          ? 'Reports show some concentration in certain provinces. Consider monitoring distribution.'
                          : 'Reports are heavily concentrated in specific provinces. May need resource reallocation.'}
                      </p>
                    </div>

                    {/* Key Metrics */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
                        <div className="text-xs text-slate-400 mb-1">Average Reports</div>
                        <div className="text-2xl font-bold text-white">{avgReportsPerProvince}</div>
                        <div className="text-xs text-slate-500 mt-1">per province</div>
                      </div>
                      <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
                        <div className="text-xs text-slate-400 mb-1">Active Provinces</div>
                        <div className="text-2xl font-bold text-white">{significantShare}</div>
                        <div className="text-xs text-slate-500 mt-1">of {TOTAL_RWANDA_PROVINCES} total</div>
                      </div>
                    </div>

                    {/* Top & Bottom Regions */}
                    <div className="space-y-3 pt-2 border-t border-slate-700">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-slate-300 flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-orange-400" />
                            Highest Activity
                          </span>
                          <span className="text-xs text-orange-400 font-semibold">{concentrationRatio}% of all reports</span>
                        </div>
                        <div className="flex items-center justify-between bg-orange-500/10 rounded-lg p-3 border border-orange-500/20">
                          <div>
                            <div className="text-sm text-white font-semibold">{mostConcentrated?.name || 'N/A'}</div>
                            <div className="text-xs text-slate-400 mt-0.5">Most reports in this province</div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold text-orange-400">{mostConcentrated?.count || 0}</div>
                            <div className="text-xs text-slate-400">reports</div>
                          </div>
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-slate-300 flex items-center gap-2">
                            <TrendingDown className="h-4 w-4 text-blue-400" />
                            Lowest Activity
                          </span>
                          <span className="text-xs text-blue-400 font-semibold">
                            {totalReports > 0 
                              ? `${((mostDispersed.count / totalReports) * 100).toFixed(1)}% of all reports`
                              : mostDispersed.count === 0 
                              ? 'No reports'
                              : 'Minimal reports'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between bg-blue-500/10 rounded-lg p-3 border border-blue-500/20">
                          <div>
                            <div className="text-sm text-white font-semibold">{mostDispersed?.name || 'N/A'}</div>
                            <div className="text-xs text-slate-400 mt-0.5">
                              {mostDispersed.count === 0 
                                ? 'No reports in this province' 
                                : 'Fewest reports in this province'}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold text-blue-400">{mostDispersed?.count || 0}</div>
                            <div className="text-xs text-slate-400">reports</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Distribution Balance Indicator */}
                    <div className="pt-2 border-t border-slate-700">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-slate-300">Distribution Balance</span>
                        <span className={`text-xs font-semibold ${
                          isEvenlyDistributed 
                            ? 'text-green-400' 
                            : isModeratelyConcentrated
                            ? 'text-yellow-400'
                            : 'text-orange-400'
                        }`}>
                          {coefficientOfVariation}% variance
                        </span>
                      </div>
                      <div className="w-full bg-slate-700 rounded-full h-3 mb-2">
                        <div 
                          className={`h-3 rounded-full transition-all ${
                            isEvenlyDistributed 
                              ? 'bg-gradient-to-r from-green-500 to-green-400' 
                              : isModeratelyConcentrated
                              ? 'bg-gradient-to-r from-yellow-500 to-yellow-400'
                              : 'bg-gradient-to-r from-orange-500 to-orange-400'
                          }`}
                          style={{ width: `${Math.min(parseFloat(coefficientOfVariation), 100)}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">Even</span>
                        <span className="text-slate-400">Concentrated</span>
                      </div>
                    </div>
                  </div>
                )
              })()}
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="text-center py-12 text-slate-400">
          <p>No geographic data available</p>
        </div>
      )}
    </div>
    </>
  )
}
