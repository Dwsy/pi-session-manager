/**
 * Session settings component
 */

import { useTranslation } from 'react-i18next'
import type { SessionSettingsProps } from '@/components/settings/types'

export default function SessionSettings({ settings, onUpdate }: SessionSettingsProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <label className="text-sm font-medium text-foreground">
            {t('settings.session.autoRefresh', 'Auto refresh')}
          </label>
          <p className="text-xs text-muted-foreground">
            {t('settings.session.autoRefreshHelp', 'Auto detect new sessions')}
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={settings.session.autoRefresh}
            onChange={(e) => onUpdate('session', 'autoRefresh', e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-info"></div>
        </label>
      </div>

      {settings.session.autoRefresh && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            {t('settings.session.refreshInterval', 'Refresh interval')}
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="5"
              max="300"
              step="5"
              value={settings.session.refreshInterval}
              onChange={(e) => onUpdate('session', 'refreshInterval', parseInt(e.target.value))}
              className="flex-1 h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-info"
            />
            <span className="text-sm text-muted-foreground w-16 text-right">
              {settings.session.refreshInterval}s
            </span>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <label className="text-sm font-medium text-foreground">
          {t('settings.session.defaultViewMode', 'Default view mode')}
        </label>
        <div className="grid grid-cols-3 gap-2">
          {(['list', 'directory', 'project'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => onUpdate('session', 'defaultViewMode', mode)}
              className={`py-2 rounded-lg border text-sm transition-all ${
                settings.session.defaultViewMode === mode
                  ? 'border-info bg-info/10 text-foreground'
                  : 'border-border text-muted-foreground hover:border-border-hover'
              }`}
            >
              {t(`settings.session.viewModes.${mode}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <label className="text-sm font-medium text-foreground">
            {t('settings.session.showMessagePreview', 'Show message preview')}
          </label>
          <p className="text-xs text-muted-foreground">
            {t('settings.session.showMessagePreviewHelp', 'Show last message in session list')}
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={settings.session.showMessagePreview}
            onChange={(e) => onUpdate('session', 'showMessagePreview', e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-info"></div>
        </label>
      </div>

      {settings.session.showMessagePreview && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            {t('settings.session.previewLines', 'Preview lines')}
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="1"
              max="5"
              value={settings.session.previewLines}
              onChange={(e) => onUpdate('session', 'previewLines', parseInt(e.target.value))}
              className="flex-1 h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-info"
            />
            <span className="text-sm text-muted-foreground w-8 text-right">
              {settings.session.previewLines}
            </span>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <label className="text-sm font-medium text-foreground">
            {t('settings.session.colorizeToolCalls', 'Tool call coloring')}
          </label>
          <p className="text-xs text-muted-foreground">
            {t('settings.session.colorizeToolCallsHelp', 'Show different colors for different tool calls in session tree')}
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={settings.session.colorizeToolCalls !== false}
            onChange={(e) => onUpdate('session', 'colorizeToolCalls', e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-info"></div>
        </label>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <label className="text-sm font-medium text-foreground">
            {t('settings.session.scrollMarkersEnabled', 'Scroll markers')}
          </label>
          <p className="text-xs text-muted-foreground">
            {t('settings.session.scrollMarkersEnabledHelp', 'Show navigation dots on the side for quick jumping between messages')}
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={settings.session.scrollMarkersEnabled !== false}
            onChange={(e) => onUpdate('session', 'scrollMarkersEnabled', e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-info"></div>
        </label>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <label className="text-sm font-medium text-foreground">
            {t('settings.session.scrollMarkersGuideSeen', 'Show feature guide')}
          </label>
          <p className="text-xs text-muted-foreground">
            {t('settings.session.scrollMarkersGuideSeenHelp', 'Show introductory tips when opening a session for the first time')}
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={!settings.session.scrollMarkersGuideSeen}
            onChange={(e) => onUpdate('session', 'scrollMarkersGuideSeen', !e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-info"></div>
        </label>
      </div>

      <div className="space-y-3">
        <label className="text-sm font-medium text-foreground">
          {t('settings.session.openPosition', 'Task positioning open position')}
        </label>
        <div className="grid grid-cols-2 gap-2">
          {(['top', 'bottom'] as const).map((position) => (
            <button
              key={position}
              onClick={() => onUpdate('session', 'openPosition', position)}
              className={`py-2 rounded-lg border text-sm transition-all ${
                settings.session.openPosition === position
                  ? 'border-info bg-info/10 text-foreground'
                  : 'border-border text-muted-foreground hover:border-border-hover'
              }`}
            >
              {t(`settings.session.openPositions.${position}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <label className="text-sm font-medium text-foreground">
          {t('settings.session.cmdFBehavior', 'Cmd+F behavior')}
        </label>
        <p className="text-xs text-muted-foreground">
          {t('settings.session.cmdFBehaviorHelp', 'Choose Cmd+F shortcut function')}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onUpdate('session', 'cmdFBehavior', 'inSessionSearch')}
            className={`py-2 px-3 rounded-lg border text-sm transition-all text-left ${
              settings.session.cmdFBehavior !== 'toggleSidebar'
                ? 'border-info bg-info/10 text-foreground'
                : 'border-border text-muted-foreground hover:border-border-hover'
            }`}
          >
            <div className="font-medium">{t('settings.session.cmdFBehaviorOptions.inSessionSearch', 'In-session search')}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Cmd+F</div>
          </button>
          <button
            onClick={() => onUpdate('session', 'cmdFBehavior', 'toggleSidebar')}
            className={`py-2 px-3 rounded-lg border text-sm transition-all text-left ${
              settings.session.cmdFBehavior === 'toggleSidebar'
                ? 'border-info bg-info/10 text-foreground'
                : 'border-border text-muted-foreground hover:border-border-hover'
            }`}
          >
            <div className="font-medium">{t('settings.session.cmdFBehaviorOptions.toggleSidebar', 'Toggle session tree')}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Cmd+F</div>
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          {settings.session.cmdFBehavior === 'inSessionSearch'
            ? t('settings.session.cmdFBehaviorHint.search', 'Cmd+Shift+F toggles session tree')
            : t('settings.session.cmdFBehaviorHint.sidebar', 'Cmd+Shift+F opens in-session search')}
        </p>
      </div>
    </div>
  )
}
