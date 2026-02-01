import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { X, ChevronDown, ChevronUp, Terminal, Bot, Wrench } from 'lucide-react';

interface SystemPromptDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SkillInfo {
  name: string;
  description: string;
  category?: string;
}

interface SkillDetail extends SkillInfo {
  content?: string;
}

const SystemPromptDialog: React.FC<SystemPromptDialogProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const [systemPrompt, setSystemPrompt] = useState<string>('');
  const [skills, setSkills] = useState<SkillDetail[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [expandedSystemPrompt, setExpandedSystemPrompt] = useState<boolean>(false);
  const [expandedTools, setExpandedTools] = useState<boolean>(false);
  const [expandedSkills, setExpandedSkills] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [prompt, skillsData] = await Promise.all([
        invoke<string>('get_system_prompt'),
        invoke<SkillInfo[]>('scan_skills')
      ]);
      setSystemPrompt(prompt);
      setSkills(skillsData.map((skill: SkillInfo) => ({ ...skill })));
    } catch (error) {
      console.error('Failed to load system prompt and skills:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSkillContent = async (skillName: string) => {
    if (expandedSkills[skillName]) {
      setExpandedSkills(prev => ({ ...prev, [skillName]: !prev[skillName] }));
      return;
    }

    try {
      const content = await invoke<string>('get_skill_content', { skill_name: skillName });
      setSkills(prev =>
        prev.map(skill =>
          skill.name === skillName ? { ...skill, content } : skill
        )
      );
      setExpandedSkills(prev => ({ ...prev, [skillName]: true }));
    } catch (error) {
      console.error(`Failed to load skill content for ${skillName}:`, error);
    }
  };

  const toggleSkill = (skillName: string) => {
    loadSkillContent(skillName);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#1e1e24] rounded-lg shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden border border-[#2d2838]">
        <div className="flex items-center justify-between p-6 border-b border-[#2d2838]">
          <h2 className="text-xl font-semibold text-[#e5e5e7] flex items-center gap-2">
            <Bot className="w-5 h-5 text-[#9575cd]" />
            {t('systemPrompt.title', 'System Prompt & Tools')}
          </h2>
          <button
            onClick={onClose}
            className="text-[#6a6f85] hover:text-[#e5e5e7] transition-colors"
            aria-label={t('common.close', 'Close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-[#6a6f85]">{t('common.loading', 'Loading...')}</div>
            </div>
          ) : (
            <>
              <div className="bg-[#2d2838] rounded-lg border border-[#3d3848] overflow-hidden">
                <button
                  onClick={() => setExpandedSystemPrompt(!expandedSystemPrompt)}
                  className="w-full flex items-center justify-between p-4 hover:bg-[#3d3848] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Terminal className="w-5 h-5 text-[#8abeb7]" />
                    <span className="font-medium text-[#e5e5e7]">
                      {t('systemPrompt.systemPrompt', 'System Prompt')}
                    </span>
                  </div>
                  {expandedSystemPrompt ? (
                    <ChevronUp className="w-5 h-5 text-[#6a6f85]" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-[#6a6f85]" />
                  )}
                </button>
                {expandedSystemPrompt && (
                  <div className="p-4 pt-0 border-t border-[#3d3848]">
                    <pre className="whitespace-pre-wrap text-sm text-[#e5e5e7] font-mono bg-[#1e1e24] p-4 rounded-lg max-h-96 overflow-y-auto">
                      {systemPrompt || t('systemPrompt.noPrompt', 'No system prompt configured')}
                    </pre>
                  </div>
                )}
              </div>

              <div className="bg-[#2d2838] rounded-lg border border-[#3d3848] overflow-hidden">
                <button
                  onClick={() => setExpandedTools(!expandedTools)}
                  className="w-full flex items-center justify-between p-4 hover:bg-[#3d3848] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Wrench className="w-5 h-5 text-[#9575cd]" />
                    <span className="font-medium text-[#e5e5e7]">
                      {t('systemPrompt.availableTools', 'Available Tools')}
                    </span>
                    <span className="text-xs bg-[#1e1e24] text-[#6a6f85] px-2 py-1 rounded-full">
                      {skills.length}
                    </span>
                  </div>
                  {expandedTools ? (
                    <ChevronUp className="w-5 h-5 text-[#6a6f85]" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-[#6a6f85]" />
                  )}
                </button>
                {expandedTools && (
                  <div className="p-4 pt-0 border-t border-[#3d3848] space-y-2">
                    {skills.length === 0 ? (
                      <div className="text-[#6a6f85] text-sm py-4">
                        {t('systemPrompt.noTools', 'No tools available')}
                      </div>
                    ) : (
                      skills.map((skill) => (
                        <div
                          key={skill.name}
                          className="bg-[#1e1e24] rounded-lg border border-[#3d3848] overflow-hidden"
                        >
                          <button
                            onClick={() => toggleSkill(skill.name)}
                            className="w-full flex items-center justify-between p-3 hover:bg-[#2d2838] transition-colors text-left"
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-[#e5e5e7]">{skill.name}</span>
                                {skill.category && (
                                  <span className="text-xs text-[#6a6f85] bg-[#2d2838] px-2 py-0.5 rounded">
                                    {skill.category}
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-[#6a6f85] mt-1">{skill.description}</p>
                            </div>
                            {expandedSkills[skill.name] ? (
                              <ChevronUp className="w-4 h-4 text-[#6a6f85] ml-2 flex-shrink-0" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-[#6a6f85] ml-2 flex-shrink-0" />
                            )}
                          </button>
                          {expandedSkills[skill.name] && skill.content && (
                            <div className="p-3 pt-0 border-t border-[#3d3848]">
                              <pre className="whitespace-pre-wrap text-xs text-[#e5e5e7] font-mono bg-[#2d2838] p-3 rounded-lg max-h-64 overflow-y-auto">
                                {skill.content}
                              </pre>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default SystemPromptDialog;