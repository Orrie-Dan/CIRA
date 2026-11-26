import { describe, it, expect } from 'vitest'
import {
  adminKey,
  getAdminUnitTree,
  getSectorsByDistrict,
  getVillages,
  getProvinceForDistrict,
  resolveAdminLocation,
  matchGeocodedLocation,
} from '../services/adminUnits.js'

describe('Rwanda administrative units', () => {
  it('has the full official hierarchy', () => {
    const tree = getAdminUnitTree()
    expect(tree.provinces.map((p) => p.name)).toEqual([
      'Eastern Province', 'Kigali City', 'Northern Province', 'Southern Province', 'Western Province',
    ])
    const districts = tree.provinces.flatMap((p) => p.districts)
    const sectors = districts.flatMap((d) => d.sectors)
    expect(districts).toHaveLength(30)
    expect(sectors).toHaveLength(416)
    expect(sectors.flatMap((s) => s.cells).length).toBeGreaterThan(2100)
    // villages are not in the tree (served per cell)
    expect(JSON.stringify(tree)).not.toContain('Amarembo I"')
  })

  it('normalizes names: case, accents, suffixes, and l/r spelling variants', () => {
    expect(adminKey('Gasabo District')).toBe(adminKey('gasabo'))
    expect(adminKey('Gishali')).toBe(adminKey('Gishari'))
    expect(adminKey('Akarere ka Huye')).toBe(adminKey('Huye'))
  })

  it('looks up sectors and villages', () => {
    expect(getSectorsByDistrict('gasabo')).toContain('Remera')
    expect(getSectorsByDistrict('Rwamagana')).toContain('Gishari') // upstream "Gishali" corrected
    expect(getSectorsByDistrict('Nowhere')).toEqual([])
    expect(getVillages('Gasabo', 'Remera', 'Nyabisindu')).toContain('Amarembo I')
    expect(getVillages('Gasabo', 'Remera', 'Not a cell')).toBeNull()
    expect(getProvinceForDistrict('Musanze')).toBe('Northern Province')
  })

  describe('resolveAdminLocation', () => {
    it('accepts an empty location', () => {
      expect(resolveAdminLocation({})).toEqual({ ok: true, location: {} })
      expect(resolveAdminLocation({ province: ' ', district: '' })).toEqual({ ok: true, location: {} })
    })

    it('returns official spellings and derives the province', () => {
      expect(resolveAdminLocation({ district: 'GASABO', sector: 'remera', cell: 'nyabisindu', village: 'amarembo i' })).toEqual({
        ok: true,
        location: { province: 'Kigali City', district: 'Gasabo', sector: 'Remera', cell: 'Nyabisindu', village: 'Amarembo I' },
      })
      expect(resolveAdminLocation({ province: 'East', district: 'Rwamagana', sector: 'Gishali' })).toMatchObject({
        ok: true,
        location: { province: 'Eastern Province', sector: 'Gishari' },
      })
    })

    it('rejects names that are not under their parent', () => {
      expect(resolveAdminLocation({ province: 'Kigali City', district: 'Huye' })).toMatchObject({ ok: false, field: 'district' })
      expect(resolveAdminLocation({ district: 'Huye', sector: 'Remera' })).toMatchObject({ ok: false, field: 'sector' })
      expect(resolveAdminLocation({ district: 'Gasabo', sector: 'Remera', cell: 'Kigabiro' })).toMatchObject({ ok: false, field: 'cell' })
      expect(resolveAdminLocation({ district: 'Gasabo', sector: 'Remera', cell: 'Nyabisindu', village: 'Akabuga' })).toMatchObject({ ok: false, field: 'village' })
      expect(resolveAdminLocation({ district: 'Atlantis' })).toMatchObject({ ok: false, field: 'district' })
      expect(resolveAdminLocation({ province: 'Atlantis' })).toMatchObject({ ok: false, field: 'province' })
    })

    it('rejects a level without its parent', () => {
      expect(resolveAdminLocation({ sector: 'Remera' })).toMatchObject({ ok: false, field: 'sector' })
      expect(resolveAdminLocation({ district: 'Gasabo', cell: 'Nyabisindu' })).toMatchObject({ ok: false, field: 'cell' })
      expect(resolveAdminLocation({ district: 'Gasabo', sector: 'Remera', village: 'Amarembo I' })).toMatchObject({ ok: false, field: 'village' })
    })
  })

  describe('matchGeocodedLocation', () => {
    it('keeps only names that exist under the matched parent', () => {
      expect(matchGeocodedLocation('Gasabo', ['KG 11 Ave', 'Remera', 'Nyabisindu', 'Kigali'])).toEqual({
        province: 'Kigali City', district: 'Gasabo', sector: 'Remera', cell: 'Nyabisindu',
      })
      // Remera is a sector of Gasabo, not of Huye
      expect(matchGeocodedLocation('Huye', ['Remera'])).toEqual({ province: 'Southern Province', district: 'Huye' })
      expect(matchGeocodedLocation(undefined, ['Remera'])).toEqual({})
    })
  })
})
