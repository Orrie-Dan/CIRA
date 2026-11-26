/** @jest-environment jsdom */
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { AdminLocationFields } from "@/components/admin-location-fields"
import type { AdminLocation, AdminUnitTree } from "@/lib/admin-units"

const TREE: AdminUnitTree = {
  provinces: [
    {
      name: "Kigali City",
      districts: [
        { name: "Gasabo", sectors: [{ name: "Remera", cells: ["Nyabisindu", "Nyarutarama"] }] },
        { name: "Kicukiro", sectors: [{ name: "Niboye", cells: ["Gatare"] }] },
      ],
    },
  ],
}

const mockFetchAdminUnits = jest.fn<Promise<AdminUnitTree>, []>()
const mockFetchVillages = jest.fn<Promise<string[]>, [string, string, string]>()
jest.mock("@/lib/admin-units", () => ({
  ...jest.requireActual("@/lib/admin-units"),
  fetchAdminUnits: () => mockFetchAdminUnits(),
  fetchVillages: (d: string, s: string, c: string) => mockFetchVillages(d, s, c),
}))

// Radix Select relies on pointer-capture/scroll APIs jsdom lacks.
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

beforeEach(() => {
  mockFetchAdminUnits.mockReset().mockResolvedValue(TREE)
  mockFetchVillages.mockReset().mockResolvedValue(["Amarembo I", "Amarembo II"])
})

function Harness({ initial = {}, onChange }: { initial?: AdminLocation; onChange?: (v: AdminLocation) => void }) {
  const [value, setValue] = useState<AdminLocation>(initial)
  return (
    <AdminLocationFields
      value={value}
      onChange={(next) => {
        setValue(next)
        onChange?.(next)
      }}
    />
  )
}

const trigger = (name: string) => screen.getByRole("combobox", { name })

describe("AdminLocationFields", () => {
  it("enables each level only once its parent is chosen", async () => {
    render(<Harness />)
    await waitFor(() => expect(trigger("Province")).toBeEnabled())
    expect(trigger("District")).toBeDisabled()
    expect(trigger("District")).toHaveTextContent("Select province first")
    expect(trigger("Village")).toBeDisabled()
  })

  it("clears lower levels when a higher level changes", async () => {
    const onChange = jest.fn()
    render(
      <Harness
        initial={{ province: "Kigali City", district: "Gasabo", sector: "Remera", cell: "Nyabisindu", village: "Amarembo I" }}
        onChange={onChange}
      />
    )
    await waitFor(() => expect(trigger("Village")).toBeEnabled())
    expect(mockFetchVillages).toHaveBeenCalledWith("Gasabo", "Remera", "Nyabisindu")

    await userEvent.click(trigger("District"))
    await userEvent.click(await screen.findByRole("option", { name: "Kicukiro" }))

    expect(onChange).toHaveBeenLastCalledWith({ province: "Kigali City", district: "Kicukiro" })
    expect(trigger("Sector")).toBeEnabled()
    expect(trigger("Cell")).toBeDisabled()
  })

  it("trims a prefilled location that does not exist under its parent", async () => {
    const onChange = jest.fn()
    render(<Harness initial={{ province: "Kigali City", district: "Gasabo", sector: "Tumba", cell: "Cyimana" }} onChange={onChange} />)
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ province: "Kigali City", district: "Gasabo" }))
  })

  it("drops a prefilled village that is not in the cell", async () => {
    const onChange = jest.fn()
    render(
      <Harness
        initial={{ province: "Kigali City", district: "Gasabo", sector: "Remera", cell: "Nyabisindu", village: "Elsewhere" }}
        onChange={onChange}
      />
    )
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({ province: "Kigali City", district: "Gasabo", sector: "Remera", cell: "Nyabisindu", village: undefined })
    )
  })

  it("offers a retry when the list fails to load", async () => {
    mockFetchAdminUnits.mockRejectedValueOnce(new Error("offline"))
    render(<Harness />)
    await userEvent.click(await screen.findByRole("button", { name: "Retry" }))
    await waitFor(() => expect(trigger("Province")).toBeEnabled())
    expect(mockFetchAdminUnits).toHaveBeenCalledTimes(2)
  })
})
