import { Bot } from 'lucide-react'
import SettingsCard from '../SettingsCard'
import SettingsToggleRow from '../SettingsToggleRow'
import type { PiLiveSettings } from '../../../types/pi-live'

interface PiLiveSettingsProps {
  settings: PiLiveSettings
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onUpdate: any
}

export default function PiLiveSettings({ settings, onUpdate }: PiLiveSettingsProps) {
  return (
    <div className="space-y-4">
      <SettingsCard
        title="Pi Live Sessions"
        description="Connect to running Pi agent sessions via WebSocket"
        icon={<Bot className="h-4 w-4" />}
      >
        <div className="space-y-4">
          <SettingsToggleRow
            title="Enable Pi Live"
            description="Show live Pi sessions panel in sidebar"
            checked={settings.enabled}
            onChange={(checked) => onUpdate('piLive', 'enabled', checked)}
            className="items-start py-2"
            descriptionClassName="text-xs text-muted-foreground mt-0.5"
          />

          {settings.enabled && (
            <>
              <SettingsToggleRow
                title="Show in Sidebar"
                description="Display Pi Live button in the sidebar"
                checked={settings.showInSidebar}
                onChange={(checked) => onUpdate('piLive', 'showInSidebar', checked)}
                className="items-start py-2 border-t border-border/60"
                descriptionClassName="text-xs text-muted-foreground mt-0.5"
              />

              <SettingsToggleRow
                title="Auto Reconnect"
                description="Automatically reconnect when connection is lost"
                checked={settings.autoReconnect}
                onChange={(checked) => onUpdate('piLive', 'autoReconnect', checked)}
                className="items-start py-2 border-t border-border/60"
                descriptionClassName="text-xs text-muted-foreground mt-0.5"
              />

              <SettingsToggleRow
                title="Show Model Info"
                description="Display current model in session cards"
                checked={settings.showModelInfo}
                onChange={(checked) => onUpdate('piLive', 'showModelInfo', checked)}
                className="items-start py-2 border-t border-border/60"
                descriptionClassName="text-xs text-muted-foreground mt-0.5"
              />

              <SettingsToggleRow
                title="Show Thinking Level"
                description="Display thinking level in session cards"
                checked={settings.showThinkingLevel}
                onChange={(checked) => onUpdate('piLive', 'showThinkingLevel', checked)}
                className="items-start py-2 border-t border-border/60"
                descriptionClassName="text-xs text-muted-foreground mt-0.5"
              />
            </>
          )}
        </div>
      </SettingsCard>
    </div>
  )
}
