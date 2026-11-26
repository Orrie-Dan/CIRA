import { adminOptions, sanitizeAdminLocation, type AdminUnitTree } from '@/lib/admin-units'

const TREE: AdminUnitTree = {
  provinces: [
    {
      name: 'Kigali City',
      districts: [
        { name: 'Gasabo', sectors: [{ name: 'Remera', cells: ['Nyabisindu', 'Nyarutarama'] }, { name: 'Kacyiru', cells: ['Kamatamu'] }] },
        { name: 'Kicukiro', sectors: [{ name: 'Niboye', cells: ['Gatare'] }] },
      ],
    },
    { name: 'Southern Province', districts: [{ name: 'Huye', sectors: [{ name: 'Tumba', cells: ['Cyimana'] }] }] },
  ],
}

describe('adminOptions', () => {
  it('lists the children of each selected level', () => {
    expect(adminOptions(TREE, {})).toEqual({ provinces: ['Kigali City', 'Southern Province'], districts: [], sectors: [], cells: [] })
    expect(adminOptions(TREE, { province: 'Kigali City', district: 'Gasabo', sector: 'Remera' })).toEqual({
      provinces: ['Kigali City', 'Southern Province'],
      districts: ['Gasabo', 'Kicukiro'],
      sectors: ['Remera', 'Kacyiru'],
      cells: ['Nyabisindu', 'Nyarutarama'],
    })
  })

  it('returns nothing below a level that is not under its parent', () => {
    expect(adminOptions(TREE, { province: 'Southern Province', district: 'Gasabo' }).sectors).toEqual([])
    expect(adminOptions(null, { province: 'Kigali City' }).districts).toEqual([])
  })
})

describe('sanitizeAdminLocation', () => {
  it('keeps a consistent location and derives a missing province', () => {
    expect(sanitizeAdminLocation(TREE, { district: 'Gasabo', sector: 'Remera', cell: 'Nyabisindu', village: 'Amarembo I' })).toEqual({
      province: 'Kigali City', district: 'Gasabo', sector: 'Remera', cell: 'Nyabisindu', village: 'Amarembo I',
    })
  })

  it('cuts the location at the first level that does not match', () => {
    expect(sanitizeAdminLocation(TREE, { province: 'Kigali City', district: 'Gasabo', sector: 'Tumba', cell: 'Cyimana' })).toEqual({
      province: 'Kigali City', district: 'Gasabo',
    })
    expect(sanitizeAdminLocation(TREE, { district: 'Nowhere' })).toEqual({})
  })
})
