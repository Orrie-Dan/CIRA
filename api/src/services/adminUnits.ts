import { RWANDA_ADMIN_UNITS } from '../data/rwanda-admin-units.js'

/**
 * Rwanda administrative hierarchy: Province > District > Sector > Cell > Village.
 * Single source of truth for the location dropdowns (web + mobile), for
 * validating report locations, and for snapping reverse-geocoder output to
 * official names.
 */

export type AdminLevel = 'province' | 'district' | 'sector' | 'cell' | 'village'
export const ADMIN_LEVELS: readonly AdminLevel[] = ['province', 'district', 'sector', 'cell', 'village']

export interface AdminLocation {
  province?: string
  district?: string
  sector?: string
  cell?: string
  village?: string
}

interface Node {
  name: string
  children: Map<string, Node>
}

/**
 * Lookup key: case-, accent- and punctuation-insensitive, and treats l and r
 * as the same letter (Kinyarwanda spells them interchangeably: Gishali/Gishari,
 * Mimuli/Mimuri). Also drops common prefixes/suffixes such as "District".
 */
export function adminKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^(akarere ka|umurenge wa?'?|intara ya?'?|umujyi wa|district of|sector of|province of|cell of)\s+/, '')
    .replace(/\s+(district|sector|province|city|cell|village)$/, '')
    .replace(/[^a-z0-9]/g, '')
    .replace(/l/g, 'r')
}

function buildTree(): Node {
  const root: Node = { name: 'Rwanda', children: new Map() }
  const add = (parent: Node, name: string): Node => {
    const node: Node = { name, children: new Map() }
    parent.children.set(adminKey(name), node)
    return node
  }
  for (const [province, districts] of RWANDA_ADMIN_UNITS) {
    const p = add(root, province)
    for (const [district, sectors] of districts) {
      const d = add(p, district)
      for (const [sector, cells] of sectors) {
        const s = add(d, sector)
        for (const [cell, villages] of cells) {
          const c = add(s, cell)
          for (const village of villages) add(c, village)
        }
      }
    }
  }
  return root
}

const ROOT = buildTree()

// District names are unique nationwide, so a district alone pins the province.
const DISTRICTS = new Map<string, { province: Node; district: Node }>()
for (const province of ROOT.children.values()) {
  for (const district of province.children.values()) {
    DISTRICTS.set(adminKey(district.name), { province, district })
  }
}

// Short and Kinyarwanda province names (keys as produced by adminKey).
const PROVINCE_ALIASES: Record<string, string> = {
  kigari: 'Kigali City', umujyiwakigari: 'Kigali City',
  east: 'Eastern Province', iburasirazuba: 'Eastern Province',
  north: 'Northern Province', amajyaruguru: 'Northern Province',
  south: 'Southern Province', amajyepfo: 'Southern Province',
  west: 'Western Province', iburengerazuba: 'Western Province',
}

function findProvince(name: string | undefined): Node | undefined {
  if (!name) return undefined
  const key = adminKey(name)
  return ROOT.children.get(key) ?? ROOT.children.get(adminKey(PROVINCE_ALIASES[key] ?? ''))
}

function findDistrict(name: string | undefined) {
  return name ? DISTRICTS.get(adminKey(name)) : undefined
}

function child(node: Node | undefined, name: string | undefined): Node | undefined {
  return node && name ? node.children.get(adminKey(name)) : undefined
}

const names = (node: Node | undefined) => (node ? [...node.children.values()].map((n) => n.name) : [])

export interface AdminUnitTree {
  provinces: Array<{
    name: string
    districts: Array<{
      name: string
      sectors: Array<{ name: string; cells: string[] }>
    }>
  }>
}

let treeCache: AdminUnitTree | undefined

/** Province > District > Sector > Cell names (villages are served per cell). */
export function getAdminUnitTree(): AdminUnitTree {
  treeCache ??= {
    provinces: [...ROOT.children.values()].map((p) => ({
      name: p.name,
      districts: [...p.children.values()].map((d) => ({
        name: d.name,
        sectors: [...d.children.values()].map((s) => ({ name: s.name, cells: names(s) })),
      })),
    })),
  }
  return treeCache
}

export function isDistrictName(name: string | undefined): boolean {
  return !!findDistrict(name)
}

export function getProvinceForDistrict(district: string | undefined): string | undefined {
  return findDistrict(district)?.province.name
}

export function getSectorsByDistrict(district: string): string[] {
  return names(findDistrict(district)?.district)
}

/** Villages of a cell, or null if the district/sector/cell path doesn't exist. */
export function getVillages(district: string, sector: string, cell: string): string[] | null {
  const c = child(child(findDistrict(district)?.district, sector), cell)
  return c ? names(c) : null
}

export type ResolveResult =
  | { ok: true; location: AdminLocation }
  | { ok: false; field: AdminLevel; message: string }

/**
 * Validates a user-submitted location against the hierarchy and returns it
 * with official spellings. Every level is optional, but a level requires the
 * one above it (the province may be omitted: it is derived from the district).
 */
export function resolveAdminLocation(input: AdminLocation): ResolveResult {
  const value = (level: AdminLevel) => input[level]?.trim() || undefined
  const province = value('province')
  const district = value('district')
  const sector = value('sector')
  const cell = value('cell')
  const village = value('village')

  const fail = (field: AdminLevel, message: string): ResolveResult => ({ ok: false, field, message })

  if (!district) {
    for (const level of ['sector', 'cell', 'village'] as const) {
      if (value(level)) return fail(level, `A ${level} requires a district`)
    }
    if (!province) return { ok: true, location: {} }
    const p = findProvince(province)
    return p ? { ok: true, location: { province: p.name } } : fail('province', `Unknown province "${province}"`)
  }

  const found = findDistrict(district)
  if (!found) return fail('district', `Unknown district "${district}"`)
  if (province && findProvince(province) !== found.province) {
    return fail('district', `${found.district.name} is not in ${province}`)
  }
  const location: AdminLocation = { province: found.province.name, district: found.district.name }

  if (!sector) {
    if (cell) return fail('cell', 'A cell requires a sector')
    if (village) return fail('village', 'A village requires a cell')
    return { ok: true, location }
  }
  const s = child(found.district, sector)
  if (!s) return fail('sector', `${sector} is not a sector of ${found.district.name}`)
  location.sector = s.name

  if (!cell) {
    if (village) return fail('village', 'A village requires a cell')
    return { ok: true, location }
  }
  const c = child(s, cell)
  if (!c) return fail('cell', `${cell} is not a cell of ${s.name}`)
  location.cell = c.name

  if (!village) return { ok: true, location }
  const v = child(c, village)
  if (!v) return fail('village', `${village} is not a village of ${c.name}`)
  location.village = v.name
  return { ok: true, location }
}

/**
 * Best-effort match of reverse-geocoder output to the hierarchy. `candidates`
 * are place names from the geocoder, most specific/trusted first. Only levels
 * that exist under the matched parent are returned, so the result always
 * passes resolveAdminLocation.
 */
export function matchGeocodedLocation(district: string | undefined, candidates: Array<string | undefined>): AdminLocation {
  const found = findDistrict(district)
  if (!found) return {}
  const location: AdminLocation = { province: found.province.name, district: found.district.name }
  const list = candidates.filter((c): c is string => !!c && c.trim().length > 0)

  // A geocoder name fills at most one level: many cells contain a village of
  // the same name, and "Nyabisindu" as a quarter says nothing about the village.
  // Likewise the district's own name (Huye district has a Huye sector).
  const used = new Set<string>([adminKey(found.district.name)])
  const pick = (parent: Node) => {
    for (const candidate of list) {
      const key = adminKey(candidate)
      if (used.has(key)) continue
      const hit = parent.children.get(key)
      if (hit) {
        used.add(key)
        return hit
      }
    }
    return undefined
  }

  const s = pick(found.district)
  if (!s) return location
  location.sector = s.name
  const c = pick(s)
  if (!c) return location
  location.cell = c.name
  const v = pick(c)
  if (v) location.village = v.name
  return location
}
