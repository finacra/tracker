interface ResolvePostAuthRedirectOptions {
  baseDestination: string
  overridePath: string | null
  allowOverrideForDataRoomUsers: boolean
}

function isSafeRelativeOverridePath(path: string | null): path is string {
  return typeof path === 'string' && path.startsWith('/')
}

function isInviteAcceptOverride(path: string): boolean {
  return (
    path.startsWith('/invite/accept') ||
    path.includes('/invite/accept') ||
    path.includes('token=')
  )
}

export function resolvePostAuthRedirect({
  baseDestination,
  overridePath,
  allowOverrideForDataRoomUsers,
}: ResolvePostAuthRedirectOptions): string {
  if (!isSafeRelativeOverridePath(overridePath)) {
    return baseDestination
  }

  if (isInviteAcceptOverride(overridePath)) {
    return overridePath
  }

  if (allowOverrideForDataRoomUsers || baseDestination !== '/data-room') {
    return overridePath
  }

  return baseDestination
}
