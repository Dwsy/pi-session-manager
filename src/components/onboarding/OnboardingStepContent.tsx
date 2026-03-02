import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { OnboardingStepConfig } from './steps'

interface OnboardingStepContentProps {
  step: OnboardingStepConfig
  animationClassName?: string
  children?: ReactNode
}

export default function OnboardingStepContent({
  step,
  animationClassName,
  children,
}: OnboardingStepContentProps) {
  const { t } = useTranslation()

  return (
    <div className={animationClassName}>
      <div className="flex items-center justify-center mb-6">
        <div className="p-5 rounded-2xl bg-surface border border-border">
          {step.icon}
        </div>
      </div>

      <h2 className="text-xl font-bold text-foreground mb-3">
        {t(step.titleKey)}
      </h2>

      <p className="text-sm text-muted-foreground leading-relaxed mb-4 max-w-sm mx-auto">
        {t(step.descriptionKey)}
      </p>

      {step.hintKey && (
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-surface border border-border rounded-lg">
          <span className="text-xs text-info font-medium">
            {t(step.hintKey)}
          </span>
        </div>
      )}

      {children}
    </div>
  )
}
