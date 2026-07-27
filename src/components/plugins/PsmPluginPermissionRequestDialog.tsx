import { ShieldCheck, ShieldOff } from 'lucide-react'

import { psmPluginPermissionRequests } from '@/plugins/runtime-host/permissionRequests'
import { permissionDescription, permissionLabel } from '@/plugins/runtime-host/permissions'
import { usePsmPluginPermissionRequest } from '@/plugins/runtime-host/usePsmPluginPermissionRequests'

export default function PsmPluginPermissionRequestDialog() {
  const request = usePsmPluginPermissionRequest()
  if (!request) return null

  const label = permissionLabel(request.permission)
  const description = permissionDescription(request.permission)

  return (
    <div className="fixed inset-0 z-[240] flex items-center justify-center bg-black/60 p-4">
      <div role="alertdialog" aria-modal="true" aria-labelledby="plugin-permission-title" className="w-full max-w-md overflow-hidden rounded-lg border border-border bg-background shadow-xl">
        <div className="flex items-start gap-3 border-b border-border px-4 py-3">
          <div className="mt-0.5 text-muted-foreground">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div id="plugin-permission-title" className="text-sm font-semibold text-foreground">Plugin permission request</div>
            <div className="mt-1 truncate text-xs text-muted-foreground">{request.pluginName}</div>
          </div>
        </div>

        <div className="space-y-3 px-4 py-4">
          <div className="border-l-2 border-primary/40 pl-3">
            <div className="text-sm font-medium text-foreground">{label}</div>
            <div className="mt-1 text-xs text-muted-foreground">{description}</div>
            <div className="mt-2 font-mono text-[11px] text-muted-foreground">{request.permission}</div>
          </div>
          {request.reason && (
            <div className="text-xs text-muted-foreground">{request.reason}</div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border bg-background px-4 py-3">
          <button
            type="button"
            className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => psmPluginPermissionRequests.respond(request.id, false)}
          >
            <ShieldOff className="h-3.5 w-3.5" />
            Deny
          </button>
          <button
            type="button"
            className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
            onClick={() => psmPluginPermissionRequests.respond(request.id, true)}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Allow
          </button>
        </div>
      </div>
    </div>
  )
}
