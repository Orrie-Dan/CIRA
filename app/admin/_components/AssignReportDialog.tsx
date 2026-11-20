'use client'

import type { Dispatch, SetStateAction } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { X } from 'lucide-react'

export interface AssignReportDialogProps {
  isAssignDialogOpen: boolean
  setIsAssignDialogOpen: Dispatch<SetStateAction<boolean>>
  assignData: { assigneeId: string; organizationId: string; dueAt: string; }
  setAssignData: Dispatch<SetStateAction<{ assigneeId: string; organizationId: string; dueAt: string; }>>
  users: any[]
  organizations: any[]
  usersLoading: boolean
  usersError: string | null
  handleAssignSubmit: () => Promise<void>
}

export function AssignReportDialog({ isAssignDialogOpen, setIsAssignDialogOpen, assignData, setAssignData, users, organizations, usersLoading, usersError, handleAssignSubmit }: AssignReportDialogProps) {
  return (
    <>
    {/* Quick Assign Dialog */}
    <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
      <DialogContent className="bg-slate-900 border-slate-800 text-white">
        <DialogHeader>
          <DialogTitle>Assign Report</DialogTitle>
          <DialogDescription className="text-slate-400">
            Assign this report to an officer or organization
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label className="text-slate-300">Assign to Officer</Label>
            <div className="flex gap-2">
              <Select
                value={assignData.assigneeId || undefined}
                onValueChange={(value) => {
                  console.log('Officer selected:', value)
                  setAssignData((prev) => ({ ...prev, assigneeId: value, organizationId: '' }))
                }}
                disabled={usersLoading}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white flex-1">
                  <SelectValue placeholder={
                    usersLoading 
                      ? "Loading officers..." 
                      : users.length === 0 
                        ? "No officers available" 
                        : "Select an officer"
                  } />
                </SelectTrigger>
                <SelectContent className="z-[3000] bg-slate-800 border-slate-700 text-white">
                  {usersLoading ? (
                    <div className="px-2 py-1.5 text-sm text-slate-400">
                      Loading officers...
                    </div>
                  ) : users.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-slate-400">
                      {usersError || "No officers found. Create officers in the Officers page."}
                    </div>
                  ) : (
                    users.map((user) => (
                      <SelectItem 
                        key={user.id} 
                        value={user.id}
                        className="text-white hover:bg-slate-700 focus:bg-slate-700"
                      >
                        {user.fullName || user.email}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {assignData.assigneeId && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setAssignData((prev) => ({ ...prev, assigneeId: '' }))}
                  className="h-10 w-10 text-slate-400 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          <div className="text-center text-sm text-slate-400">OR</div>

          <div className="space-y-2">
            <Label className="text-slate-300">Assign to Organization</Label>
            <div className="flex gap-2">
              <Select
                value={assignData.organizationId || undefined}
                onValueChange={(value) => setAssignData((prev) => ({ ...prev, organizationId: value, assigneeId: '' }))}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white flex-1">
                  <SelectValue placeholder="Select an organization" />
                </SelectTrigger>
                <SelectContent>
                  {organizations.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {assignData.organizationId && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setAssignData((prev) => ({ ...prev, organizationId: '' }))}
                  className="h-10 w-10 text-slate-400 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-300">Due Date (Optional)</Label>
            <Input
              type="datetime-local"
              value={assignData.dueAt}
              onChange={(e) => setAssignData((prev) => ({ ...prev, dueAt: e.target.value }))}
              className="bg-slate-800 border-slate-700 text-white"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => setIsAssignDialogOpen(false)}
            className="text-slate-400 hover:text-white"
          >
            Cancel
          </Button>
          <Button
            onClick={handleAssignSubmit}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            Assign
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  )
}
