import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from './api';

/**
 * Rwanda administrative units (Province > District > Sector > Cell > Village)
 * from GET /geocoding/admin-units. The tree stops at cells; villages are
 * fetched per cell. Both are cached on the device so the location pickers
 * still work when a report is filed offline.
 */

export interface AdminUnitTree {
  provinces: Array<{
    name: string;
    districts: Array<{
      name: string;
      sectors: Array<{ name: string; cells: string[] }>;
    }>;
  }>;
}

export interface AdminLocation {
  province?: string;
  district?: string;
  sector?: string;
  cell?: string;
  village?: string;
}

export type AdminLevel = keyof AdminLocation;
export const ADMIN_LEVELS: AdminLevel[] = ['province', 'district', 'sector', 'cell', 'village'];

const TREE_KEY = 'admin_units_tree_v1';
const VILLAGES_KEY_PREFIX = 'admin_units_villages_v1:';

let treePromise: Promise<AdminUnitTree> | null = null;
const villagePromises = new Map<string, Promise<string[]>>();

async function loadTree(): Promise<AdminUnitTree> {
  try {
    const tree = await apiClient.getAdminUnits();
    AsyncStorage.setItem(TREE_KEY, JSON.stringify(tree)).catch(() => {});
    return tree;
  } catch (err) {
    const cached = await AsyncStorage.getItem(TREE_KEY).catch(() => null);
    if (cached) return JSON.parse(cached) as AdminUnitTree;
    throw err;
  }
}

/** Loads the tree once per app session (network first, device cache as fallback). */
export function getAdminUnits(): Promise<AdminUnitTree> {
  treePromise ??= loadTree().catch((err) => {
    treePromise = null;
    throw err;
  });
  return treePromise;
}

async function loadVillages(district: string, sector: string, cell: string): Promise<string[]> {
  const storageKey = `${VILLAGES_KEY_PREFIX}${district}/${sector}/${cell}`;
  try {
    const { villages } = await apiClient.getVillages(district, sector, cell);
    AsyncStorage.setItem(storageKey, JSON.stringify(villages)).catch(() => {});
    return villages;
  } catch (err) {
    const cached = await AsyncStorage.getItem(storageKey).catch(() => null);
    if (cached) return JSON.parse(cached) as string[];
    throw err;
  }
}

export function getVillages(district: string, sector: string, cell: string): Promise<string[]> {
  const key = `${district}/${sector}/${cell}`;
  let pending = villagePromises.get(key);
  if (!pending) {
    pending = loadVillages(district, sector, cell).catch((err) => {
      villagePromises.delete(key);
      throw err;
    });
    villagePromises.set(key, pending);
  }
  return pending;
}

/** Options for province..cell given the current selection (villages come from getVillages). */
export function adminOptions(tree: AdminUnitTree | null, value: AdminLocation) {
  const province = tree?.provinces.find((p) => p.name === value.province);
  const district = province?.districts.find((d) => d.name === value.district);
  const sector = district?.sectors.find((s) => s.name === value.sector);
  return {
    province: tree?.provinces.map((p) => p.name) ?? [],
    district: province?.districts.map((d) => d.name) ?? [],
    sector: district?.sectors.map((s) => s.name) ?? [],
    cell: sector?.cells ?? [],
  };
}

/**
 * Keeps only the levels that exist under their parent (e.g. geocoder output),
 * filling the province from the district if missing. The village is checked
 * separately once its list is loaded.
 */
export function sanitizeAdminLocation(tree: AdminUnitTree, value: AdminLocation): AdminLocation {
  const province = value.province
    ? tree.provinces.find((p) => p.name === value.province)
    : tree.provinces.find((p) => p.districts.some((d) => d.name === value.district));
  if (!province) return {};
  const out: AdminLocation = { province: province.name };
  const district = province.districts.find((d) => d.name === value.district);
  if (!district) return out;
  out.district = district.name;
  const sector = district.sectors.find((s) => s.name === value.sector);
  if (!sector) return out;
  out.sector = sector.name;
  if (!value.cell || !sector.cells.includes(value.cell)) return out;
  out.cell = value.cell;
  if (value.village) out.village = value.village;
  return out;
}

/** Sets one level and clears every level below it. */
export function selectAdminLevel(value: AdminLocation, level: AdminLevel, picked: string): AdminLocation {
  const next: AdminLocation = {};
  for (const key of ADMIN_LEVELS) {
    if (key === level) {
      next[key] = picked;
      break;
    }
    next[key] = value[key];
  }
  return next;
}

export function sameAdminLocation(a: AdminLocation, b: AdminLocation): boolean {
  return ADMIN_LEVELS.every((level) => (a[level] || undefined) === (b[level] || undefined));
}
