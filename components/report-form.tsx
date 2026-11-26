"use client"

import { z } from "zod"
import { useCallback, useEffect, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { MapPin, X, Upload, Image as ImageIcon } from "lucide-react"
import { AdminLocationFields } from "@/components/admin-location-fields"
import type { AdminLocation } from "@/lib/admin-units"

const ReportSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  description: z.string().min(5, "Description must be at least 5 characters"),
  issueType: z.enum(["roads", "bridges", "water", "power", "sanitation", "telecom", "public_building", "pothole", "streetlight", "sidewalk", "drainage", "other"], {
    required_error: "Issue type is required",
  }),
  severity: z.enum(["low", "medium", "high"], { required_error: "Severity is required" }),
  province: z.string().optional(),
  district: z.string().optional(),
  sector: z.string().optional(),
  cell: z.string().optional(),
  village: z.string().optional(),
})

export type ReportFormValues = z.infer<typeof ReportSchema>

export function ReportForm({
  onSubmit,
  defaultValues,
  onCancel,
  isSubmitting = false,
}: {
  onSubmit: (values: ReportFormValues, photos: File[]) => void
  defaultValues?: Partial<ReportFormValues>
  onCancel?: () => void
  isSubmitting?: boolean
}) {
  const [photos, setPhotos] = useState<File[]>([])
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([])

  const form = useForm<ReportFormValues>({
    resolver: zodResolver(ReportSchema),
    defaultValues: {
      title: "",
      description: "",
      issueType: "roads",
      severity: "low",
      province: "",
      district: "",
      sector: "",
      cell: "",
      village: "",
      ...defaultValues,
    },
  })

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    // Limit to 10 photos total
    const remainingSlots = 10 - photos.length
    const filesToAdd = files.slice(0, remainingSlots)

    setPhotos((prev) => [...prev, ...filesToAdd])

    // Create previews
    filesToAdd.forEach((file) => {
      const reader = new FileReader()
      reader.onloadend = () => {
        setPhotoPreviews((prev) => [...prev, reader.result as string])
      }
      reader.readAsDataURL(file)
    })
  }

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index))
    setPhotoPreviews((prev) => prev.filter((_, i) => i !== index))
  }

  // Prefill the location when reverse geocoding completes. Geocoded names are
  // already official spellings (the API snaps them to the boundaries data).
  // A late geocode result never overwrites a location the user already picked.
  const locationTouched = useRef(false)
  const prefill = {
    province: defaultValues?.province,
    district: defaultValues?.district,
    sector: defaultValues?.sector,
    cell: defaultValues?.cell,
    village: defaultValues?.village,
  }
  const prefillKey = JSON.stringify(prefill)
  useEffect(() => {
    if (locationTouched.current) return
    const values = JSON.parse(prefillKey) as AdminLocation
    if (!values.province && !values.district) return
    const levels = ['province', 'district', 'sector', 'cell', 'village'] as const
    for (const level of levels) {
      form.setValue(level, values[level] || '', { shouldDirty: true })
    }
  }, [prefillKey, form])

  const [province, district, sector, cell, village] = form.watch(['province', 'district', 'sector', 'cell', 'village'])
  const location: AdminLocation = {
    province: province || undefined,
    district: district || undefined,
    sector: sector || undefined,
    cell: cell || undefined,
    village: village || undefined,
  }
  const setLocation = useCallback((next: AdminLocation) => {
    locationTouched.current = true
    const levels = ['province', 'district', 'sector', 'cell', 'village'] as const
    for (const level of levels) {
      form.setValue(level, next[level] ?? '', { shouldDirty: true })
    }
  }, [form])

  // Calculate progress like mobile
  const calculateProgress = () => {
    const values = form.getValues()
    let filled = 0
    const total = 5
    if (values.title) filled++
    if (values.description) filled++
    if (values.issueType) filled++
    if (values.severity) filled++
    if (values.province || values.district || values.sector) filled++
    return (filled / total) * 100
  }

  const progress = calculateProgress()

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => onSubmit(values, photos))}
        className="space-y-4 sm:space-y-4"
      >
        {/* Progress Indicator */}
        <div className="space-y-2 pb-4 border-b">
          <div className="w-full bg-muted rounded-full h-1.5">
            <div 
              className="bg-primary h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground text-center">
            {Math.round(progress)}% Complete
          </p>
        </div>

        {/* Title */}
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title *</FormLabel>
              <FormControl>
                <Input 
                  placeholder="Brief description of the issue" 
                  {...field} 
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Description */}
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description *</FormLabel>
              <FormControl>
                <Textarea 
                  rows={4} 
                  placeholder="Provide detailed information about the issue" 
                  {...field} 
                  className="min-h-[100px] sm:min-h-[120px] resize-y"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Type Selection */}
        <FormField
          control={form.control}
          name="issueType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Type *</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="roads">Roads</SelectItem>
                  <SelectItem value="bridges">Bridges</SelectItem>
                  <SelectItem value="water">Water</SelectItem>
                  <SelectItem value="power">Power</SelectItem>
                  <SelectItem value="sanitation">Sanitation</SelectItem>
                  <SelectItem value="telecom">Telecom</SelectItem>
                  <SelectItem value="public_building">Public Building</SelectItem>
                  <SelectItem value="pothole">Pothole</SelectItem>
                  <SelectItem value="streetlight">Streetlight</SelectItem>
                  <SelectItem value="sidewalk">Sidewalk</SelectItem>
                  <SelectItem value="drainage">Drainage</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Severity Selection */}
        <FormField
          control={form.control}
          name="severity"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Severity *</FormLabel>
              <FormControl>
                <RadioGroup 
                  className="flex flex-col sm:flex-row gap-3 sm:gap-4" 
                  value={field.value} 
                  onValueChange={field.onChange}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="low" id="severity-low" />
                    <label htmlFor="severity-low" className="text-sm cursor-pointer flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-500"></span>
                      Low
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="medium" id="severity-med" />
                    <label htmlFor="severity-med" className="text-sm cursor-pointer flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                      Medium
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="high" id="severity-high" />
                    <label htmlFor="severity-high" className="text-sm cursor-pointer flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-red-500"></span>
                      High
                    </label>
                  </div>
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Location Information - Auto-populated from map selection */}
        <div className="space-y-4 rounded-lg border bg-muted/50 p-3 sm:p-4">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <p className="text-xs sm:text-sm font-medium">Location *</p>
          </div>
          <AdminLocationFields value={location} onChange={setLocation} disabled={isSubmitting} />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Filled in from the point you picked on the map. Correct it if it&apos;s wrong.
          </p>
        </div>

        {/* Photo Upload Section */}
        <div className="space-y-4 rounded-lg border bg-muted/50 p-3 sm:p-4">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <p className="text-xs sm:text-sm font-medium">Photos ({photos.length}/10)</p>
          </div>
          
          <div className="space-y-3">
            {/* Photo Preview Grid */}
            {photoPreviews.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {photoPreviews.map((preview, index) => (
                  <div key={index} className="relative group">
                    <img
                      src={preview}
                      alt={`Preview ${index + 1}`}
                      className="w-full h-24 object-cover rounded-lg border"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => removePhoto(index)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Upload Button */}
            {photos.length < 10 && (
              <div>
                <label htmlFor="photo-upload" className="cursor-pointer">
                  <div className="flex items-center justify-center gap-2 border-2 border-dashed rounded-lg p-4 hover:bg-muted/50 transition-colors">
                    <Upload className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      {photos.length === 0 ? 'Upload photos' : `Add more photos (${photos.length}/10)`}
                    </span>
                  </div>
                </label>
                <input
                  id="photo-upload"
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  multiple
                  onChange={handlePhotoSelect}
                  className="hidden"
                />
              </div>
            )}
            
            {photos.length >= 10 && (
              <p className="text-xs text-muted-foreground text-center">
                Maximum 10 photos allowed
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-4 sm:pt-2">
          {onCancel ? (
            <Button 
              type="button" 
              variant="ghost" 
              onClick={onCancel}
              className="w-full sm:w-auto"
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          ) : null}
          <Button 
            type="submit"
            className="w-full sm:w-auto"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Submitting...' : 'Submit Report'}
          </Button>
        </div>
      </form>
    </Form>
  )
}


