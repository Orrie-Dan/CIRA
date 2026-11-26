const mockGetAdminUnits = jest.fn();
const mockGetVillages = jest.fn();
jest.mock('../api', () => ({
  apiClient: {
    getAdminUnits: () => mockGetAdminUnits(),
    getVillages: (d: string, s: string, c: string) => mockGetVillages(d, s, c),
  },
}));

const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => {
      mockStore.set(k, v);
    }),
  },
}));

import type { AdminUnitTree } from '../adminUnits';

const TREE: AdminUnitTree = {
  provinces: [
    {
      name: 'Kigali City',
      districts: [
        { name: 'Gasabo', sectors: [{ name: 'Remera', cells: ['Nyabisindu', 'Nyarutarama'] }] },
        { name: 'Kicukiro', sectors: [{ name: 'Niboye', cells: ['Gatare'] }] },
      ],
    },
  ],
};

// Fresh module per test: the tree promise is cached at module level.
function load() {
  let mod!: typeof import('../adminUnits');
  jest.isolateModules(() => {
    mod = require('../adminUnits');
  });
  return mod;
}

beforeEach(() => {
  mockStore.clear();
  mockGetAdminUnits.mockReset();
  mockGetVillages.mockReset();
});

describe('admin units helpers', () => {
  const m = load();

  it('lists options under each selected level', () => {
    expect(m.adminOptions(TREE, { province: 'Kigali City', district: 'Gasabo', sector: 'Remera' })).toEqual({
      province: ['Kigali City'],
      district: ['Gasabo', 'Kicukiro'],
      sector: ['Remera'],
      cell: ['Nyabisindu', 'Nyarutarama'],
    });
    expect(m.adminOptions(null, {}).province).toEqual([]);
  });

  it('clears the levels below the one picked', () => {
    const full = { province: 'Kigali City', district: 'Gasabo', sector: 'Remera', cell: 'Nyabisindu', village: 'Amarembo I' };
    expect(m.selectAdminLevel(full, 'district', 'Kicukiro')).toEqual({ province: 'Kigali City', district: 'Kicukiro' });
    expect(m.selectAdminLevel(full, 'province', 'Kigali City')).toEqual({ province: 'Kigali City' });
  });

  it('trims a location to the levels that exist and derives the province', () => {
    expect(m.sanitizeAdminLocation(TREE, { district: 'Gasabo', sector: 'Remera', cell: 'Nyabisindu' })).toEqual({
      province: 'Kigali City', district: 'Gasabo', sector: 'Remera', cell: 'Nyabisindu',
    });
    expect(m.sanitizeAdminLocation(TREE, { district: 'Gasabo', sector: 'Niboye', cell: 'Gatare' })).toEqual({
      province: 'Kigali City', district: 'Gasabo',
    });
    expect(m.sanitizeAdminLocation(TREE, { district: 'Nowhere' })).toEqual({});
  });

  it('compares locations ignoring empty levels', () => {
    expect(m.sameAdminLocation({ province: 'Kigali City', district: '' }, { province: 'Kigali City' })).toBe(true);
    expect(m.sameAdminLocation({ province: 'Kigali City' }, {})).toBe(false);
  });
});

describe('admin units loading', () => {
  it('caches the tree on the device and falls back to it offline', async () => {
    mockGetAdminUnits.mockResolvedValueOnce(TREE);
    await expect(load().getAdminUnits()).resolves.toEqual(TREE);
    await Promise.resolve(); // let the cache write settle

    mockGetAdminUnits.mockRejectedValueOnce(new Error('Network Error'));
    await expect(load().getAdminUnits()).resolves.toEqual(TREE);
  });

  it('fails without a cache, then retries on the next call', async () => {
    const m = load();
    mockGetAdminUnits.mockRejectedValueOnce(new Error('Network Error')).mockResolvedValueOnce(TREE);
    await expect(m.getAdminUnits()).rejects.toThrow('Network Error');
    await expect(m.getAdminUnits()).resolves.toEqual(TREE);
    expect(mockGetAdminUnits).toHaveBeenCalledTimes(2);
  });

  it('fetches villages once per cell and caches them for offline use', async () => {
    mockGetVillages.mockResolvedValueOnce({ villages: ['Amarembo I'] });
    const m = load();
    await expect(m.getVillages('Gasabo', 'Remera', 'Nyabisindu')).resolves.toEqual(['Amarembo I']);
    await expect(m.getVillages('Gasabo', 'Remera', 'Nyabisindu')).resolves.toEqual(['Amarembo I']);
    expect(mockGetVillages).toHaveBeenCalledTimes(1);
    await Promise.resolve();

    mockGetVillages.mockRejectedValueOnce(new Error('Network Error'));
    await expect(load().getVillages('Gasabo', 'Remera', 'Nyabisindu')).resolves.toEqual(['Amarembo I']);
  });
});
