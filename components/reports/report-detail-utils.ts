export function getTypeDisplayName(type: string): string {
  const typeDisplayNames: Record<string, string> = {
    pothole: 'Pothole',
    streetlight: 'Streetlight',
    sidewalk: 'Sidewalk',
    drainage: 'Drainage',
    other: 'Other',
    roads: 'Roads',
    bridges: 'Bridges',
    water: 'Water',
    power: 'Power',
    sanitation: 'Sanitation',
    telecom: 'Telecom',
    public_building: 'Public Building',
  }
  return typeDisplayNames[type] || type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' ')
}

export function getStatusColor(status: string): string {
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

export function getSeverityColor(severity: string): string {
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
