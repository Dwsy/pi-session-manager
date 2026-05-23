// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'

import {
  getAvailableSettingsAreas,
  getAvailableSettingsGroups,
  getAvailableSettingsSections,
} from './settingsRegistry'

describe('settings registry selectors', () => {
  it('returns available base settings metadata', () => {
    expect(getAvailableSettingsAreas().map((area) => area.id)).toContain('preferences')
    expect(getAvailableSettingsSections().map((section) => section.id)).toContain('psm-plugins')
    expect(getAvailableSettingsGroups('config-center').flatMap((group) => group.sections)).toContain('psm-plugins')
  })
})
