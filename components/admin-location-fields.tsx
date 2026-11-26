"use client"

import { useEffect, useState } from "react"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  adminOptions,
  fetchAdminUnits,
  fetchVillages,
  sanitizeAdminLocation,
  type AdminLocation,
  type AdminUnitTree,
} from "@/lib/admin-units"

type Level = keyof AdminLocation

const LEVELS: Array<{ key: Level; label: string }> = [
  { key: "province", label: "Province" },
  { key: "district", label: "District" },
  { key: "sector", label: "Sector" },
  { key: "cell", label: "Cell" },
  { key: "village", label: "Village" },
]

/**
 * Cascading Province > District > Sector > Cell > Village dropdowns backed by
 * the official administrative boundaries. Picking a level clears the levels
 * below it.
 */
export function AdminLocationFields({
  value,
  onChange,
  disabled = false,
}: {
  value: AdminLocation
  onChange: (next: AdminLocation) => void
  disabled?: boolean
}) {
  const [tree, setTree] = useState<AdminUnitTree | null>(null)
  const [treeError, setTreeError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [villages, setVillages] = useState<{ key: string; list: string[] } | null>(null)
  const [villageError, setVillageError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setTreeError(null)
    fetchAdminUnits()
      .then((t) => !cancelled && setTree(t))
      .catch((err: Error) => !cancelled && setTreeError(err.message))
    return () => {
      cancelled = true
    }
  }, [attempt])

  const { district, sector, cell, village } = value
  const villageKey = district && sector && cell ? `${district}/${sector}/${cell}` : null

  useEffect(() => {
    if (!district || !sector || !cell) return
    let cancelled = false
    setVillageError(false)
    fetchVillages(district, sector, cell)
      .then((list) => !cancelled && setVillages({ key: `${district}/${sector}/${cell}`, list }))
      .catch(() => !cancelled && setVillageError(true))
    return () => {
      cancelled = true
    }
  }, [district, sector, cell])

  const villageList = villages && villages.key === villageKey ? villages.list : null

  // Trim a prefilled location to the levels that exist in the hierarchy, so
  // the form never submits a value the dropdowns can't show.
  useEffect(() => {
    if (!tree) return
    const clean = sanitizeAdminLocation(tree, value)
    if (LEVELS.some(({ key }) => clean[key] !== (value[key] || undefined))) onChange(clean)
  }, [tree, value, onChange])

  // Drop a prefilled village that isn't in the selected cell.
  useEffect(() => {
    if (village && villageList && !villageList.includes(village)) {
      onChange({ ...value, village: undefined })
    }
  }, [village, villageList, value, onChange])

  const options = adminOptions(tree, value)
  const optionsFor: Record<Level, string[]> = {
    province: options.provinces,
    district: options.districts,
    sector: options.sectors,
    cell: options.cells,
    village: villageList ?? [],
  }

  const select = (level: Level, picked: string) => {
    const next: AdminLocation = {}
    for (const { key } of LEVELS) {
      if (key === level) {
        next[key] = picked
        break
      }
      next[key] = value[key]
    }
    onChange(next)
  }

  if (treeError) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-destructive/40 bg-background p-3 text-sm">
        <span className="text-destructive">Couldn&apos;t load the list of locations.</span>
        <Button type="button" variant="outline" size="sm" onClick={() => setAttempt((n) => n + 1)}>
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {LEVELS.map(({ key, label }, index) => {
        const parent = index > 0 ? LEVELS[index - 1] : null
        const parentMissing = parent ? !value[parent.key] : false
        const list = optionsFor[key]
        const loading = !tree || (key === "village" && !!villageKey && !villageList && !villageError)
        const placeholder = loading
          ? "Loading..."
          : parentMissing
            ? `Select ${parent!.label.toLowerCase()} first`
            : key === "village" && villageError
              ? "Couldn't load villages"
              : `Select ${label.toLowerCase()}`
        const id = `admin-location-${key}`
        return (
          <div key={key} className="space-y-1.5">
            <Label htmlFor={id}>{label}</Label>
            <Select
              value={value[key] ?? ""}
              onValueChange={(v) => select(key, v)}
              disabled={disabled || loading || parentMissing || list.length === 0}
            >
              <SelectTrigger id={id} className="w-full bg-background" aria-label={label}>
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {list.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )
      })}
    </div>
  )
}
