import { Trophy, Star, Flame, Target, Zap, Award, CheckCircle2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { SessionStats, HeatmapPoint } from '../../types'

interface Achievement {
  id: string
  icon: any
  title: string
  description: string
  unlocked: boolean
  progress?: number
  color: string
}

interface AchievementsProps {
  stats: SessionStats
  title?: string
}

export default function Achievements({ stats, title = 'Achievements' }: AchievementsProps) {
  const { t } = useTranslation()
  const calculateAchievements = (): Achievement[] => {
    const achievements: Achievement[] = []

    // First Session
    achievements.push({
      id: 'first-session',
      icon: Star,
      title: 'First Steps',
      description: 'Complete your first session',
      unlocked: stats.total_sessions >= 1,
      color: '#569cd6',
    })

    // 10 Sessions
    achievements.push({
      id: 'ten-sessions',
      icon: Trophy,
      title: 'Getting Started',
      description: 'Complete 10 sessions',
      unlocked: stats.total_sessions >= 10,
      progress: Math.min((stats.total_sessions / 10) * 100, 100),
      color: '#7ee787',
    })

    // 50 Sessions
    achievements.push({
      id: 'fifty-sessions',
      icon: Award,
      title: 'Dedicated Learner',
      description: 'Complete 50 sessions',
      unlocked: stats.total_sessions >= 50,
      progress: Math.min((stats.total_sessions / 50) * 100, 100),
      color: '#ffa657',
    })

    // 100 Sessions
    achievements.push({
      id: 'hundred-sessions',
      icon: Trophy,
      title: 'Century Club',
      description: 'Complete 100 sessions',
      unlocked: stats.total_sessions >= 100,
      progress: Math.min((stats.total_sessions / 100) * 100, 100),
      color: '#ff6b6b',
    })

    // 7 Day Streak
    const streak = stats.heatmap_data
      .filter((p: HeatmapPoint) => p.level > 0)
      .slice(-7)
      .length === 7 ? 7 : 0

    achievements.push({
      id: 'week-streak',
      icon: Flame,
      title: 'Week Warrior',
      description: 'Maintain a 7-day activity streak',
      unlocked: streak >= 7,
      progress: Math.min((streak / 7) * 100, 100),
      color: '#c792ea',
    })

    // 30 Day Streak
    const monthStreak = stats.heatmap_data
      .filter((p: HeatmapPoint) => p.level > 0)
      .slice(-30)
      .length >= 30 ? 30 : 0

    achievements.push({
      id: 'month-streak',
      icon: Zap,
      title: 'Monthly Master',
      description: 'Maintain a 30-day activity streak',
      unlocked: monthStreak >= 30,
      progress: Math.min((monthStreak / 30) * 100, 100),
      color: '#82aaff',
    })

    // High Volume
    achievements.push({
      id: 'high-volume',
      icon: Target,
      title: 'Message Master',
      description: 'Send 1000+ messages',
      unlocked: stats.total_messages >= 1000,
      progress: Math.min((stats.total_messages / 1000) * 100, 100),
      color: '#f78c6c',
    })

    // Active Days
    const activeDays = stats.heatmap_data.filter(p => p.level > 0).length
    achievements.push({
      id: 'active-days',
      icon: CheckCircle2,
      title: 'Consistent Coder',
      description: 'Be active on 30+ different days',
      unlocked: activeDays >= 30,
      progress: Math.min((activeDays / 30) * 100, 100),
      color: '#ffcb6b',
    })

    return achievements
  }

  const achievements = calculateAchievements()
  const unlockedCount = achievements.filter(a => a.unlocked).length
  const totalCount = achievements.length
  const progressPercent = (unlockedCount / totalCount) * 100

  return (
    <div className="bg-secondary rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium flex items-center gap-2 text-foreground">
          <Trophy className="h-4 w-4 text-muted-foreground" />
          {title}
        </h3>
        <div className="text-xs text-muted-foreground">
          <span className="text-foreground font-medium">{unlockedCount}</span>/{totalCount}
        </div>
      </div>

      {/* Overall Progress */}
      <div className="mb-4">
        <div className="flex justify-between text-xs mb-2">
          <span className="text-muted-foreground">Overall Progress</span>
          <span className="text-foreground font-medium">{progressPercent.toFixed(0)}%</span>
        </div>
        <div className="h-2 bg-background rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-info via-success to-warning rounded-full transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Achievements Grid */}
      <div className="grid grid-cols-2 gap-3">
        {achievements.map((achievement) => {
          const Icon = achievement.icon
          return (
            <div
              key={achievement.id}
              className={`relative p-3 rounded-lg transition-all ${
                achievement.unlocked
                  ? 'bg-background border border-border'
                  : 'bg-background/50 border border-transparent opacity-60'
              }`}
            >
              {/* Icon */}
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${
                  achievement.unlocked ? '' : 'grayscale'
                }`}
                style={{ backgroundColor: `${achievement.color}20` }}
              >
                <Icon
                  className="h-4 w-4"
                  style={{ color: achievement.unlocked ? achievement.color : '#6a6f85' }}
                />
              </div>

              {/* Title */}
              <div className="text-xs font-medium text-foreground mb-1">{achievement.title}</div>

              {/* Description */}
              <div className="text-[10px] text-muted-foreground mb-2">{achievement.description}</div>

              {/* Progress Bar (if not fully unlocked) */}
              {achievement.progress !== undefined && !achievement.unlocked && (
                <div>
                  <div className="h-1 bg-surface-dark rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${achievement.progress}%`,
                        backgroundColor: achievement.color,
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Unlocked Badge */}
              {achievement.unlocked && (
                <div className="absolute top-2 right-2">
                  <div className="w-4 h-4 rounded-full bg-success flex items-center justify-center">
                    <CheckCircle2 className="h-2.5 w-2.5 text-background" />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Motivational Message */}
      {unlockedCount === totalCount && (
        <div className="mt-4 pt-4 border-t border-background text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Trophy className="h-4 w-4 text-warning" />
            <span className="text-sm font-medium text-warning">All Achievements Unlocked!</span>
          </div>
          <div className="text-[10px] text-muted-foreground">{t('dashboard.achievements.powerUserMessage')}</div>
        </div>
      )}

      {unlockedCount > 0 && unlockedCount < totalCount && (
        <div className="mt-4 pt-4 border-t border-background text-center">
          <div className="text-[10px] text-muted-foreground">
            {totalCount - unlockedCount} more achievement{totalCount - unlockedCount > 1 ? 's' : ''} to go!
          </div>
        </div>
      )}
    </div>
  )
}