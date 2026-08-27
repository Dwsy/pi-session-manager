import { Code2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { createPortal } from 'react-dom'
import { useEffect, useId, useRef, useState } from 'react'
import MarkdownContent from '@/components/ui/MarkdownContent'

export interface SkillInvocation {
  name: string
  location: string
  body: string
  raw: string
}

export type SkillMessagePart =
  | { type: 'markdown'; content: string }
  | { type: 'skill'; skill: SkillInvocation }

const SKILL_BLOCK_RE = /<skill\b([^>]*)>([\s\S]*?)<\/skill\s*>/gi

function readAttribute(attributes: string, name: string): string {
  const match = attributes.match(
    new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'),
  )
  return match?.[1] ?? match?.[2] ?? ''
}

export function splitSkillInvocations(text: string): SkillMessagePart[] {
  const parts: SkillMessagePart[] = []
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = SKILL_BLOCK_RE.exec(text)) !== null) {
    const name = readAttribute(match[1], 'name').trim()
    if (!name) continue

    const before = text.slice(cursor, match.index)
    if (before.trim()) {
      parts.push({ type: 'markdown', content: before })
    }

    parts.push({
      type: 'skill',
      skill: {
        name,
        location: readAttribute(match[1], 'location').trim(),
        body: match[2],
        raw: match[0],
      },
    })
    cursor = match.index + match[0].length
  }

  const after = text.slice(cursor)
  if (after.trim()) {
    parts.push({ type: 'markdown', content: after })
  }

  return parts.length > 0 ? parts : [{ type: 'markdown', content: text }]
}

interface SkillInvocationBlockProps {
  skill: SkillInvocation
}

export function SkillInvocationBlock({ skill }: SkillInvocationBlockProps) {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const close = () => {
    setIsOpen(false)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="skill-invocation-block"
        onClick={() => setIsOpen(true)}
        aria-haspopup="dialog"
        aria-label={t('components.userMessage.openSkill', `Open skill ${skill.name}`)}
      >
        <Code2 className="skill-invocation-icon" aria-hidden="true" />
        <span className="skill-invocation-kind">SKILL</span>
        <span className="skill-invocation-name">{skill.name}</span>
        {skill.location && <span className="skill-invocation-location">{skill.location}</span>}
      </button>

      {isOpen && <SkillInvocationDialog skill={skill} onClose={close} />}
    </>
  )
}

interface SkillInvocationDialogProps {
  skill: SkillInvocation
  onClose: () => void
}

function SkillInvocationDialog({ skill, onClose }: SkillInvocationDialogProps) {
  const { t } = useTranslation()
  const titleId = useId()
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      onClose()
    }
    window.addEventListener('keydown', handleKey, true)
    return () => window.removeEventListener('keydown', handleKey, true)
  }, [onClose])

  useEffect(() => {
    closeButtonRef.current?.focus()
  }, [])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  const dialog = (
    <div
      className="user-message-modal-overlay motion-overlay-enter"
      onClick={event => {
        if (event.target === event.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="user-message-modal-container motion-overlay-surface-enter">
        <div className="user-message-modal-header">
          <div className="user-message-modal-title-area">
            <h3 id={titleId} className="user-message-modal-title">SKILL:{skill.name}</h3>
            {skill.location && (
              <p className="user-message-modal-subtitle skill-invocation-modal-path">
                <code>{skill.location}</code>
              </p>
            )}
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="user-message-modal-close-btn"
            onClick={onClose}
            aria-label={t('components.userMessage.close', 'Close')}
            title={t('components.userMessage.close', 'Close')}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="user-message-modal-body">
          <MarkdownContent content={skill.body.trim() || skill.raw} />
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined') return null
  return createPortal(dialog, document.body)
}

interface SkillAwareMessageProps {
  text: string
  searchQuery: string
}

export function SkillAwareMessage({ text, searchQuery }: SkillAwareMessageProps) {
  const parts = splitSkillInvocations(text)

  return (
    <div className="user-message-body">
      {parts.map((part, index) =>
        part.type === 'skill' ? (
          <SkillInvocationBlock key={`skill-${index}`} skill={part.skill} />
        ) : (
          <MarkdownContent
            key={`markdown-${index}`}
            content={part.content}
            searchQuery={searchQuery}
          />
        ),
      )}
    </div>
  )
}
