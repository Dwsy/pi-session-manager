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
      <div className="mb-4 flex items-start gap-3">
        <div className="mt-0.5 text-muted-foreground">{step.icon}</div>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-foreground">
            {t(step.titleKey)}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {t(step.descriptionKey)}
          </p>
        </div>
      </div>

      {step.hintKey && (
        <p className="mb-4 border-l-2 border-primary/40 pl-3 text-xs text-muted-foreground">
          {t(step.hintKey)}
        </p>
      )}

      {children}
    </div>
  )
}
