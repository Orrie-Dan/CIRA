import type { ReportType } from '../../types'

export const REPORT_TYPES: {
  label: string
  value: ReportType
  icon: string
  color: string
}[] = [
  { label: 'Roads', value: 'roads', icon: 'road', color: '#FF6B6B' },
  { label: 'Bridges', value: 'bridges', icon: 'bridge', color: '#4ECDC4' },
  { label: 'Water', value: 'water', icon: 'water', color: '#45B7D1' },
  { label: 'Power', value: 'power', icon: 'lightning-bolt', color: '#FFA07A' },
  { label: 'Sanitation', value: 'sanitation', icon: 'toilet', color: '#98D8C8' },
  { label: 'Telecom', value: 'telecom', icon: 'cellphone', color: '#F7DC6F' },
  { label: 'Public Building', value: 'public_building', icon: 'office-building', color: '#BB8FCE' },
  { label: 'Pothole', value: 'pothole', icon: 'alert-circle', color: '#FF6B6B' },
  { label: 'Streetlight', value: 'streetlight', icon: 'lightbulb', color: '#FFD93D' },
  { label: 'Sidewalk', value: 'sidewalk', icon: 'walk', color: '#6BCF7F' },
  { label: 'Drainage', value: 'drainage', icon: 'pipe', color: '#4A90E2' },
  { label: 'Other', value: 'other', icon: 'dots-horizontal', color: '#95A5A6' },
]

export const SEVERITY_OPTIONS: {
  label: string
  value: 'low' | 'medium' | 'high'
  color: string
  bgColor: string
}[] = [
  { label: 'Low', value: 'low', color: '#4CAF50', bgColor: '#E8F5E9' },
  { label: 'Medium', value: 'medium', color: '#FF9800', bgColor: '#FFF3E0' },
  { label: 'High', value: 'high', color: '#F44336', bgColor: '#FFEBEE' },
]
