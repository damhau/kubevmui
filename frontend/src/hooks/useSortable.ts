import { useState, useMemo } from 'react'

export type SortDirection = 'asc' | 'desc' | null

export interface SortConfig {
  column: string | null
  direction: SortDirection
}

export function useSortable<T>(items: T[], defaultSort?: { column: string; direction: 'asc' | 'desc' }) {
  const [sortConfig, setSortConfig] = useState<SortConfig>(
    defaultSort ? { column: defaultSort.column, direction: defaultSort.direction } : { column: null, direction: null }
  )

  const requestSort = (column: string) => {
    setSortConfig((prev) => {
      if (prev.column === column) {
        if (prev.direction === 'asc') return { column, direction: 'desc' }
        if (prev.direction === 'desc') return { column: null, direction: null }
      }
      return { column, direction: 'asc' }
    })
  }

  const sorted = useMemo(() => {
    if (!sortConfig.column || !sortConfig.direction) return items
    return [...items].sort((a, b) => {
      const aVal = getNestedValue(a, sortConfig.column!)
      const bVal = getNestedValue(b, sortConfig.column!)

      if (aVal == null && bVal == null) return 0
      if (aVal == null) return 1
      if (bVal == null) return -1

      let cmp = 0
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        cmp = aVal - bVal
      } else if (typeof aVal === 'string' && typeof bVal === 'string') {
        cmp = aVal.localeCompare(bVal, undefined, { sensitivity: 'base' })
      } else {
        cmp = String(aVal).localeCompare(String(bVal))
      }

      return sortConfig.direction === 'desc' ? -cmp : cmp
    })
  }, [items, sortConfig])

  return { sorted, sortConfig, requestSort }
}

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((acc, part) => acc?.[part], obj)
}
