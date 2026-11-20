'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiMe } from '@/lib/api'

export function useAdminAuth(requiredRole: 'admin' | 'officer' = 'admin') {
  const router = useRouter()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { user } = await apiMe()
        if (user.role !== requiredRole && !(requiredRole === 'officer' && user.role === 'admin')) {
          router.push('/login')
          return
        }
        setIsAuthenticated(true)
      } catch {
        router.push('/login')
      } finally {
        setAuthLoading(false)
      }
    }

    checkAuth()
  }, [router, requiredRole])

  return { isAuthenticated, authLoading }
}
