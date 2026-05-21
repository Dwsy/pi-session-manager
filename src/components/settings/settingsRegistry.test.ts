// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'

import {
  getAvailableSettingsAreas,
  getAvailableSettingsGroups,
  getAvailableSettingsSections,
} from './settingsRegistry'

describe('settings registry selectors', () => {
  it('returns stable references for default runtime lists', () => {
    expect(getAvailableSettingsAreas()).toBe(getAvailableSettingsAreas())
    expect(getAvailableSettingsSections()).toBe(getAvailableSettingsSections())
    expect(getAvailableSettingsGroups('preferences')).toBe(getAvailableSettingsGroups('preferences'))
  })
})
