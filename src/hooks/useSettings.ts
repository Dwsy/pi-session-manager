/**
 * Settings Management Hook

 * Provides convenient methods for accessing and updating settings

 */



import { useSettings as useSettingsContext } from '../contexts/SettingsContext'

import type { AppSettings } from '../components/settings/types'



/**

 * Use Settings Hook

 * Provides access and operations for global settings

 */

export function useSettings() {

  const context = useSettingsContext()



  // Get terminal setting

  const getTerminalSetting = <K extends keyof AppSettings['terminal']>(

    key: K

  ): AppSettings['terminal'][K] => {

    return context.settings.terminal[key]

  }



  // Update terminal setting

  const updateTerminalSetting = <K extends keyof AppSettings['terminal']>(

    key: K,

    value: AppSettings['terminal'][K]

  ) => {

    context.updateSetting('terminal', key, value)

  }



  // Get appearance setting

  const getAppearanceSetting = <K extends keyof AppSettings['appearance']>(

    key: K

  ): AppSettings['appearance'][K] => {

    return context.settings.appearance[key]

  }



  // Update appearance setting

  const updateAppearanceSetting = <K extends keyof AppSettings['appearance']>(

    key: K,

    value: AppSettings['appearance'][K]

  ) => {

    context.updateSetting('appearance', key, value)

  }



  // Get language setting

  const getLanguageSetting = <K extends keyof AppSettings['language']>(

    key: K

  ): AppSettings['language'][K] => {

    return context.settings.language[key]

  }



  // Update language setting

  const updateLanguageSetting = <K extends keyof AppSettings['language']>(

    key: K,

    value: AppSettings['language'][K]

  ) => {

    context.updateSetting('language', key, value)

  }



  // Get session setting

  const getSessionSetting = <K extends keyof AppSettings['session']>(

    key: K

  ): AppSettings['session'][K] => {

    return context.settings.session[key]

  }



  // Update session setting

  const updateSessionSetting = <K extends keyof AppSettings['session']>(

    key: K,

    value: AppSettings['session'][K]

  ) => {

    context.updateSetting('session', key, value)

  }



  // Get search setting

  const getSearchSetting = <K extends keyof AppSettings['search']>(

    key: K

  ): AppSettings['search'][K] => {

    return context.settings.search[key]

  }



  // Update search setting

  const updateSearchSetting = <K extends keyof AppSettings['search']>(

    key: K,

    value: AppSettings['search'][K]

  ) => {

    context.updateSetting('search', key, value)

  }



  // Get export setting

  const getExportSetting = <K extends keyof AppSettings['export']>(

    key: K

  ): AppSettings['export'][K] => {

    return context.settings.export[key]

  }



  // Update export setting

  const updateExportSetting = <K extends keyof AppSettings['export']>(

    key: K,

    value: AppSettings['export'][K]

  ) => {

    context.updateSetting('export', key, value)

  }



  // Get advanced setting

  const getAdvancedSetting = <K extends keyof AppSettings['advanced']>(

    key: K

  ): AppSettings['advanced'][K] => {

    return context.settings.advanced[key]

  }



  // Update advanced setting

  const updateAdvancedSetting = <K extends keyof AppSettings['advanced']>(

    key: K,

    value: AppSettings['advanced'][K]

  ) => {

    context.updateSetting('advanced', key, value)

  }



  return {

    ...context,

    // Terminal settings

    terminal: context.settings.terminal,

    getTerminalSetting,

    updateTerminalSetting,

    // Appearance settings

    appearance: context.settings.appearance,

    getAppearanceSetting,

    updateAppearanceSetting,

    // Language settings

    language: context.settings.language,

    getLanguageSetting,

    updateLanguageSetting,

    // Session settings

    session: context.settings.session,

    getSessionSetting,

    updateSessionSetting,

    // Search settings

    search: context.settings.search,

    getSearchSetting,

    updateSearchSetting,

    // Export settings

    export: context.settings.export,

    getExportSetting,

    updateExportSetting,

    // Advanced settings

    advanced: context.settings.advanced,

    getAdvancedSetting,

    updateAdvancedSetting,

  }

}
