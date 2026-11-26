/**
 * Rwanda administrative units (Province > District > Sector > Cell > Village)
 * served by the API (GET /geocoding/admin-units). The tree stops at cells;
 * villages are fetched per cell.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://cira-backend-1.onrender.com'

export interface AdminUnitTree {
  provinces: Array<{
    name: string
    districts: Array<{
      name: string
      sectors: Array<{ name: string; cells: string[] }>
    }>
  }>
}

export interface AdminLocation {
  province?: string
  district?: string
  sector?: string
  cell?: string
  village?: string
}

let treePromise: Promise<AdminUnitTree> | null = null
const villageCache = new Map<string, Promise<string[]>>()

/** Loads the tree once per page load; a failed load is retried on the next call. */
export function fetchAdminUnits(): Promise<AdminUnitTree> {
  treePromise ??= fetch(`${API_BASE}/geocoding/admin-units`)
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load administrative units (${res.status})`)
      return res.json() as Promise<AdminUnitTree>
    })
    .catch((err) => {
      treePromise = null
      throw err
    })
  return treePromise
}

export function fetchVillages(district: string, sector: string, cell: string): Promise<string[]> {
  const key = `${district}/${sector}/${cell}`
  let pending = villageCache.get(key)
  if (!pending) {
    const qs = new URLSearchParams({ district, sector, cell })
    pending = fetch(`${API_BASE}/geocoding/admin-units/villages?${qs}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load villages (${res.status})`)
        return ((await res.json()) as { villages: string[] }).villages
      })
      .catch((err) => {
        villageCache.delete(key)
        throw err
      })
    villageCache.set(key, pending)
  }
  return pending
}

/** Options for each level given the current selection. */
export function adminOptions(tree: AdminUnitTree | null, value: AdminLocation) {
  const province = tree?.provinces.find((p) => p.name === value.province)
  const district = province?.districts.find((d) => d.name === value.district)
  const sector = district?.sectors.find((s) => s.name === value.sector)
  return {
    provinces: tree?.provinces.map((p) => p.name) ?? [],
    districts: province?.districts.map((d) => d.name) ?? [],
    sectors: district?.sectors.map((s) => s.name) ?? [],
    cells: sector?.cells ?? [],
  }
}

/**
 * Keeps only the levels of `value` that exist in the tree under their parent
 * (e.g. geocoder output), filling the province from the district if missing.
 */
export function sanitizeAdminLocation(tree: AdminUnitTree, value: AdminLocation): AdminLocation {
  const province = value.province
    ? tree.provinces.find((p) => p.name === value.province)
    : tree.provinces.find((p) => p.districts.some((d) => d.name === value.district))
  if (!province) return {}
  const out: AdminLocation = { province: province.name }
  const district = province.districts.find((d) => d.name === value.district)
  if (!district) return out
  out.district = district.name
  const sector = district.sectors.find((s) => s.name === value.sector)
  if (!sector) return out
  out.sector = sector.name
  if (!value.cell || !sector.cells.includes(value.cell)) return out
  out.cell = value.cell
  // The village can only be checked once its list is loaded; the picker does that.
  if (value.village) out.village = value.village
  return out
}
