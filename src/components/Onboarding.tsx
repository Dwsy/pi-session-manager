import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FolderOpen,
  Search,
  GitBranch,
  Settings,
  ChevronRight,
  ChevronLeft,
  X,
  Sparkles,
} from 'lucide-react'

interface OnboardingProps {
  onComplete: () => void
}

interface StepConfig {
  icon: React.ReactNode
  titleKey: string
  descriptionKey: string
  hintKey?: string
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const { t } = useTranslation()
  const [currentStep, setCurrentStep] = useState(0)

  const steps: StepConfig[] = [
    {
      icon: <Sparkles className="h-12 w-12 text-[#569cd6]" />,
      titleKey: 'onboarding.steps.welcome.title',
      descriptionKey: 'onboarding.steps.welcome.description',
    },
    {
      icon: <FolderOpen className="h-12 w-12 text-blue-400" />,
      titleKey: 'onboarding.steps.browse.title',
      descriptionKey: 'onboarding.steps.browse.description',
      hintKey: 'onboarding.steps.browse.hint',
    },
    {
      icon: <Search className="h-12 w-12 text-emerald-400" />,
      titleKey: 'onboarding.steps.search.title',
      descriptionKey: 'onboarding.steps.search.description',
      hintKey: 'onboarding.steps.search.hint',
    },
    {
      icon: <GitBranch className="h-12 w-12 text-purple-400" />,
      titleKey: 'onboarding.steps.tree.title',
      descriptionKey: 'onboarding.steps.tree.description',
      hintKey: 'onboarding.steps.tree.hint',
    },
    {
      icon: <Settings className="h-12 w-12 text-amber-400" />,
      titleKey: 'onboarding.steps.settings.title',
      descriptionKey: 'onboarding.steps.settings.description',
      hintKey: 'onboarding.steps.settings.hint',
    },
  ]

  const totalSteps = steps.length
  const isFirst = currentStep === 0
  const isLast = currentStep === totalSteps - 1

  const handleNext = useCallback(() => {
    if (isLast) {
      onComplete()
    } else {
      setCurrentStep((s) => s + 1)
    }
  }, [isLast, onComplete])

  const handlePrev = useCallback(() => {
    if (!isFirst) {
      setCurrentStep((s) => s - 1)
    }
  }, [isFirst])

  const handleSkip = useCallback(() => {
    onComplete()
  }, [onComplete])

  const step = steps[currentStep]

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md">
      <div className="relative w-[520px] bg-[#1e1f2e] rounded-2xl border border-[#2c2d3b] shadow-2xl overflow-hidden">
        {/* 关闭/跳过按钮 */}
        <button
          onClick={handleSkip}
          className="absolute top-4 right-4 p-1.5 text-[#6a6f85] hover:text-white hover:bg-[#2c2d3b] rounded-lg transition-colors z-10"
        >
          <X className="h-4 w-4" />
        </button>

        {/* 顶部装饰渐变 */}
        <div className="h-1.5 bg-gradient-to-r from-[#569cd6] via-purple-500 to-emerald-500" />

        {/* 内容区域 */}
        <div className="px-10 pt-10 pb-6 text-center">
          {/* 图标 */}
          <div className="flex items-center justify-center mb-6">
            <div className="p-5 rounded-2xl bg-[#252636] border border-[#2c2d3b]">
              {step.icon}
            </div>
          </div>

          {/* 标题 */}
          <h2 className="text-xl font-bold text-white mb-3">
            {t(step.titleKey)}
          </h2>

          {/* 描述 */}
          <p className="text-sm text-[#8a8fa0] leading-relaxed mb-4 max-w-sm mx-auto">
            {t(step.descriptionKey)}
          </p>

          {/* 提示 */}
          {step.hintKey && (
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#252636] border border-[#2c2d3b] rounded-lg">
              <span className="text-xs text-[#569cd6] font-medium">
                {t(step.hintKey)}
              </span>
            </div>
          )}
        </div>

        {/* 底部：步骤指示器 + 导航 */}
        <div className="flex items-center justify-between px-10 pb-8">
          {/* 步骤指示器 */}
          <div className="flex items-center gap-2">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === currentStep
                    ? 'w-6 bg-[#569cd6]'
                    : i < currentStep
                    ? 'w-1.5 bg-[#569cd6]/40'
                    : 'w-1.5 bg-[#2c2d3b]'
                }`}
              />
            ))}
          </div>

          {/* 导航按钮 */}
          <div className="flex items-center gap-2">
            {!isFirst && (
              <button
                onClick={handlePrev}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-[#6a6f85] hover:text-white transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
                {t('onboarding.prev')}
              </button>
            )}
            {isFirst && (
              <button
                onClick={handleSkip}
                className="px-3 py-1.5 text-sm text-[#6a6f85] hover:text-white transition-colors"
              >
                {t('onboarding.skip')}
              </button>
            )}
            <button
              onClick={handleNext}
              className="flex items-center gap-1 px-5 py-2 bg-[#569cd6] hover:bg-[#4a8bc2] text-white text-sm font-medium rounded-lg transition-colors"
            >
              {isLast ? t('onboarding.finish') : t('onboarding.next')}
              {!isLast && <ChevronRight className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
