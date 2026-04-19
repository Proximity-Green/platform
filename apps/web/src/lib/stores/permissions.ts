import { writable, get } from 'svelte/store'

interface PermStore {
  role: string | null
  permissions: 'all' | Array<{ resource: string; action: string }>
  loaded: boolean
}

export const permStore = writable<PermStore>({
  role: null,
  permissions: [],
  loaded: false
})

export async function loadPermissions(userId: string) {
  const res = await fetch('/api/permissions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId })
  })
  const data = await res.json()
  permStore.set({ ...data, loaded: true })
}

export function can(resource: string, action: string = 'read'): boolean {
  const { role, permissions } = get(permStore)
  if (!role) return false
  if (permissions === 'all') return true
  return permissions.some(
    p => p.resource === resource && (p.action === action || p.action === 'manage')
  )
}

// Reactive version for use in templates
export function canDo(perms: PermStore, resource: string, action: string = 'read'): boolean {
  if (!perms.role) return false
  if (perms.permissions === 'all') return true
  return (perms.permissions as Array<{ resource: string; action: string }>).some(
    p => p.resource === resource && (p.action === action || p.action === 'manage')
  )
}
