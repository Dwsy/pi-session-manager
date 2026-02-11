/**
 * Pi 配置组件
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { invoke } from '../../../transport'
import { Loader2, Puzzle, FileText, Power, PowerOff } from 'lucide-react'
import type { SkillInfo, PromptInfo } from '../../../types'

export default function PiConfigSettings() {
  const { t } = useTranslation()
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [prompts, setPrompts] = useState<PromptInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'skills' | 'prompts'>('skills')
  const [settingsData, setSettingsData] = useState<any>({ skills: [], prompts: [] })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [skillsData, promptsData] = await Promise.all([
        invoke<SkillInfo[]>('scan_skills'),
        invoke<PromptInfo[]>('scan_prompts'),
      ])

      // 根据 settings.json 中的配置标记启用/禁用状态
      const enabledSkills = new Set(settingsData.skills.map((s: string) => s.replace(/^-/, '')))
      const disabledSkills = new Set(settingsData.skills.filter((s: string) => s.startsWith('-')).map((s: string) => s.slice(1)))

      const skillsWithStatus = skillsData.map(skill => ({
        ...skill,
        enabled: disabledSkills.has(skill.path) ? false : enabledSkills.has(skill.path) || skill.enabled,
      }))

      const enabledPrompts = new Set(settingsData.prompts.map((p: string) => p.replace(/^-/, '')))
      const disabledPrompts = new Set(settingsData.prompts.filter((p: string) => p.startsWith('-')).map((p: string) => p.slice(1)))

      const promptsWithStatus = promptsData.map(prompt => ({
        ...prompt,
        enabled: disabledPrompts.has(prompt.path) ? false : enabledPrompts.has(prompt.path) || prompt.enabled,
      }))

      setSkills(skillsWithStatus)
      setPrompts(promptsWithStatus)
      setSettingsData(settingsData)
    } catch (error) {
      console.error('Failed to load Pi config:', error)
    } finally {
      setLoading(false)
    }
  }

  const saveConfig = async () => {
    setSaving(true)
    try {
      // TODO: 保存到后端
      // await invoke('save_pi_settings', { settings: piSettings })
    } catch (error) {
      console.error('Failed to save Pi config:', error)
    } finally {
      setSaving(false)
    }
  }

  const toggleSkill = (index: number) => {
    setSkills((prev) => prev.map((skill, i) =>
      i === index ? { ...skill, enabled: !skill.enabled } : skill
    ))
  }

  const togglePrompt = (index: number) => {
    setPrompts((prev) => prev.map((prompt, i) =>
      i === index ? { ...prompt, enabled: !prompt.enabled } : prompt
    ))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-info" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 标签页切换 */}
      <div className="flex gap-2 border-b border-border">
        <button
          onClick={() => setActiveTab('skills')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'skills'
              ? 'text-info border-info'
              : 'text-muted-foreground border-transparent hover:text-foreground'
          }`}
        >
          <Puzzle className="h-4 w-4" />
          {t('settings.piConfig.skills', 'Skills')}
          <span className="ml-1 px-1.5 py-0.5 text-xs bg-secondary rounded-full">
            {skills.filter((s) => s.enabled).length}/{skills.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('prompts')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'prompts'
              ? 'text-info border-info'
              : 'text-muted-foreground border-transparent hover:text-foreground'
          }`}
        >
          <FileText className="h-4 w-4" />
          {t('settings.piConfig.prompts', 'Prompts')}
          <span className="ml-1 px-1.5 py-0.5 text-xs bg-secondary rounded-full">
            {prompts.filter((p) => p.enabled).length}/{prompts.length}
          </span>
        </button>
      </div>

      {/* Skills 列表 */}
      {activeTab === 'skills' && (
        <div className="space-y-2 max-h-[450px] overflow-y-auto">
          {skills.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {t('settings.piConfig.noSkills', '未找到 Skills')}
            </div>
          ) : (
            skills.map((skill, index) => (
              <div
                key={skill.name}
                className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                  skill.enabled
                    ? 'border-info/30 bg-info/5'
                    : 'border-border opacity-60'
                }`}
              >
                <button
                  onClick={() => toggleSkill(index)}
                  className={`flex-shrink-0 p-1.5 rounded-md transition-colors ${
                    skill.enabled
                      ? 'text-green-400 hover:bg-green-400/10'
                      : 'text-muted-foreground hover:bg-secondary'
                  }`}
                  title={skill.enabled ? t('common.enabled', '已启用') : t('common.disabled', '已禁用')}
                >
                  {skill.enabled ? <Power className="h-4 w-4" /> : <PowerOff className="h-4 w-4" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground">{skill.name}</div>
                  {skill.description && (
                    <div className="text-xs text-muted-foreground truncate">{skill.description}</div>
                  )}
                </div>
                <code className="text-xs text-muted-foreground bg-surface px-2 py-1 rounded">
                  {skill.path}
                </code>
              </div>
            ))
          )}
        </div>
      )}

      {/* Prompts 列表 */}
      {activeTab === 'prompts' && (
        <div className="space-y-2 max-h-[450px] overflow-y-auto">
          {prompts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {t('settings.piConfig.noPrompts', '未找到 Prompts')}
            </div>
          ) : (
            prompts.map((prompt, index) => (
              <div
                key={prompt.name}
                className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                  prompt.enabled
                    ? 'border-info/30 bg-info/5'
                    : 'border-border opacity-60'
                }`}
              >
                <button
                  onClick={() => togglePrompt(index)}
                  className={`flex-shrink-0 p-1.5 rounded-md transition-colors ${
                    prompt.enabled
                      ? 'text-green-400 hover:bg-green-400/10'
                      : 'text-muted-foreground hover:bg-secondary'
                  }`}
                  title={prompt.enabled ? t('common.enabled', '已启用') : t('common.disabled', '已禁用')}
                >
                  {prompt.enabled ? <Power className="h-4 w-4" /> : <PowerOff className="h-4 w-4" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground">{prompt.name}</div>
                  {prompt.description && (
                    <div className="text-xs text-muted-foreground truncate">{prompt.description}</div>
                  )}
                </div>
                <code className="text-xs text-muted-foreground bg-surface px-2 py-1 rounded">
                  {prompt.path}
                </code>
              </div>
            ))
          )}
        </div>
      )}

      {/* 说明文字 */}
      <div className="text-xs text-muted-foreground bg-surface p-3 rounded-lg">
        <p>
          {t('settings.piConfig.help', '点击电源图标切换启用/禁用状态。禁用的项目会以 - 前缀保存到 settings.json。')}
        </p>
      </div>

      {/* 保存按钮 */}
      <div className="flex justify-end">
        <button
          onClick={saveConfig}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-info hover:bg-info/80 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {t('common.save', '保存到 settings.json')}
        </button>
      </div>
    </div>
  )
}