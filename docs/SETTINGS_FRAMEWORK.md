# Settings System Framework Documentation

## 📋 Overview

The Settings System Framework has completed foundational architecture setup, including type definitions, Context, Hooks, utility functions, and component scaffolding. Currently, all functionality is **framework code**, with real implementations marked as TODO.

---

## 🏗️ Architecture

### File Structure

```
src/
├── types/
│   └── settings.ts                    # Settings type definitions
├── contexts/
│   └── SettingsContext.tsx            # Settings Context and Provider
├── hooks/
│   ├── useSettings.ts                 # Settings management Hook
│   └── useAppearance.ts               # Appearance settings Hook
├── utils/
│   └── settings.ts                    # Settings utility functions
└── components/
    └── settings/
        ├── types.ts                   # Component type definitions
        ├── SettingsPanel.tsx          # Original settings panel (retained)
        ├── SettingsPanel.refactored.tsx # Refactored settings panel
        └── sections/
            ├── TerminalSettings.tsx   # Terminal settings
            ├── AppearanceSettings.tsx # Appearance settings
            ├── LanguageSettings.tsx   # Language settings
            ├── SessionSettings.tsx    # Session settings
            ├── SearchSettings.tsx     # Search settings
            ├── ExportSettings.tsx     # Export settings
            ├── PiConfigSettings.tsx   # Pi configuration
            └── AdvancedSettings.tsx   # Advanced settings
```

---

## 📦 Module Descriptions

### 1. Type Definitions (`src/types/settings.ts`)

Defines the complete settings type system:

```typescript
// Main Types
- TerminalSettings          # Terminal settings
- AppearanceSettings        # Appearance settings
- LanguageSettings          # Language settings
- SessionSettings           # Session settings
- SearchSettings            # Search settings
- ExportSettings            # Export settings
- AdvancedSettings          # Advanced settings
- AppSettings               # Complete application settings

// Auxiliary Types
- ValidationError           # Validation errors
- SettingsChangeEvent       # Settings change events
- SettingsExport            # Settings export format

// Constants
- defaultSettings           # Default settings values
- settingsValidationRules   # Validation rules
```

**Status**: ✅ Fully defined

---

### 2. Settings Context (`src/contexts/SettingsContext.tsx`)

Provides global settings state management:

```typescript
interface SettingsContextType {
  settings: AppSettings              // Current settings
  loading: boolean                    // Loading state
  saving: boolean                    // Saving state
  error: string | null               // Error information
  updateSetting: <K>(section, key, value) => void  // Update setting
  resetSettings: () => void          // Reset settings
  saveSettings: () => Promise<void>  // Save settings
  reloadSettings: () => Promise<void> // Reload settings
}
```

**Status**: ✅ Framework complete, TODO: Implement backend storage

---

### 3. useSettings Hook (`src/hooks/useSettings.ts`)

Provides convenient settings access and update methods:

```typescript
// Base Hook
useSettings()

// Category Hooks
- getTerminalSetting / updateTerminalSetting
- getAppearanceSetting / updateAppearanceSetting
- getLanguageSetting / updateLanguageSetting
- getSessionSetting / updateSessionSetting
- getSearchSetting / updateSearchSetting
- getExportSetting / updateExportSetting
- getAdvancedSetting / updateAdvancedSetting

// Extension Hooks
- useSettingsValidation()            # Settings validation
- useSettingsImportExport()          # Import/Export
```

**Status**: ✅ Framework complete, TODO: Implement validation and import/export

---

### 4. useAppearance Hook (`src/hooks/useAppearance.ts`)

Automatically applies appearance settings to DOM:

```typescript
// Theme management
useTheme()

// Font size management
useFontSize()

// Code block theme management
useCodeBlockTheme()
```

**Status**: ✅ Framework complete, TODO: Implement theme switching logic

---

### 5. Utility Functions (`src/utils/settings.ts`)

Provides settings-related utility functions:

```typescript
- mergeSettings()                    # Deep merge settings
- validateSettingValue()             # Validate setting values
- formatSettingValue()               # Format display values
- parseSettingValue()                # Parse input values
- getSettingDefaultValue()           # Get default values
- isSettingModified()                # Check if modified
- resetSectionToDefault()            # Reset to defaults
- exportSettingsToJson()             # Export as JSON
- importSettingsFromJson()           # Import from JSON
- checkSettingsCompatibility()       # Version compatibility
- migrateSettings()                  # Version migration
- getSettingDisplayName()            # Get display names
```

**Status**: ✅ Framework complete, TODO: Implement specific logic

---

### 6. Settings Panel Components

#### Original Version (`SettingsPanel.tsx`)
Retains the original implementation using independent state management.

**Status**: ✅ Complete implementation (using localStorage)

#### Refactored Version (`SettingsPanel.refactored.tsx`)
Uses global Settings Context:

```typescript
// Sub-components
- SettingsMenu                       # Left menu
- SettingsHeader                     # Header
- SettingsContent                    # Content area
- SettingsFooter                     # Bottom buttons
```

**Status**: ✅ Framework complete, TODO: Replace original version

#### Settings Section Components (`sections/`)
8 independent settings section components:
- `TerminalSettings.tsx`    # Terminal settings
- `AppearanceSettings.tsx`  # Appearance settings
- `LanguageSettings.tsx`    # Language settings
- `SessionSettings.tsx`     # Session settings
- `SearchSettings.tsx`      # Search settings
- `ExportSettings.tsx`      # Export settings
- `PiConfigSettings.tsx`    # Pi configuration
- `AdvancedSettings.tsx`    # Advanced settings

**Status**: ✅ UI complete, TODO: Implement functional logic

---

## 🔄 Integration Steps

### 1. Wrap SettingsProvider in App.tsx

```typescript
import { SettingsProvider } from './contexts/SettingsContext'

function App() {
  return (
    <SettingsProvider>
      {/* Application content */}
    </SettingsProvider>
  )
}
```

### 2. Replace SettingsPanel import

```typescript
// Old version
import SettingsPanel from './components/settings/SettingsPanel'

// New version
import SettingsPanel from './components/settings/SettingsPanel.refactored'
```

### 3. Use settings in components

```typescript
import { useSettings } from './hooks/useSettings'

function MyComponent() {
  const { settings, updateSetting } = useSettings()
  return (
    <div>
      <p>Current theme: {settings.appearance.theme}</p>
      <button onClick={() => updateSetting('appearance', 'theme', 'light')}>
        Switch to light theme
      </button>
    </div>
  )
}
```

---

## 📝 TODO List

### High Priority
- [ ] Implement Tauri backend storage commands (`load_settings`, `save_settings`)
- [ ] Integrate SettingsProvider in App.tsx
- [ ] Replace SettingsPanel with refactored version
- [ ] Implement actual appearance settings application

### Medium Priority
- [ ] Implement settings validation logic
- [ ] Implement settings import/export
- [ ] Unify Pi Config handling
- [ ] Fix sidebarWidth data consistency

### Low Priority
- [ ] Add unsaved changes prompt
- [ ] Implement settings search functionality
- [ ] Add keyboard shortcuts
- [ ] Write unit tests

---

## 🧪 Testing Plan

### Unit Tests

```typescript
// Test settings types
describe('Settings Types', () => {
  it('should create default settings', () => {})
  it('should validate settings', () => {})
  it('should merge settings', () => {})
})

// Test Context
describe('SettingsContext', () => {
  it('should provide settings', () => {})
  it('should update settings', () => {})
  it('should save settings', () => {})
})

// Test Hook
describe('useSettings', () => {
  it('should return settings', () => {})
  it('should update setting', () => {})
  it('should reset settings', () => {})
})
```

### Integration Tests

```typescript
// Test settings panel
describe('SettingsPanel', () => {
  it('should render all sections', () => {})
  it('should update settings', () => {})
  it('should save settings', () => {})
})

// Test appearance application
describe('useAppearance', () => {
  it('should apply theme', () => {})
  it('should apply font size', () => {})
  it('should apply spacing', () => {})
})
```

---

## 📚 Reference Documentation

- [Task Index](../../task/settings-system-completion/task-index.md)
- [Execution Plan](../../task/settings-system-completion/EXECUTION_PLAN.md)
- [Settings System Review Report](../../SETTING_SYSTEM_REVIEW.md)

---

**Last Updated**: 2026-01-31
