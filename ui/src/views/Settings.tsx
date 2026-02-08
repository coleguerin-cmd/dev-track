import { useEffect, useState } from 'react';
import {
  User,
  Bot,
  Plug,
  ChevronRight,
  Save,
  RefreshCw,
  Check,
  X as XIcon,
  ExternalLink,
  Brain,
  Sparkles,
  Eye,
} from 'lucide-react';
import { RadarChart } from '../components/RadarChart';

const BASE = '/api/v1';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Failed');
  return json.data as T;
}

// ─── Types ──────────────────────────────────────────────────────────────────

type Section = 'profile' | 'ai' | 'integrations';

interface UserProfile {
  id: string;
  name: string;
  role: string;
  technical_level: number;
  attributes: Record<string, number>;
  communication_style: Record<string, boolean>;
  behavior: BehaviorProfile;
  context_notes: string[];
  ai_instructions: string;
  created: string;
  updated: string;
}

interface BehaviorProfile {
  session_length_preference: 'short' | 'medium' | 'long';
  context_window_habits: 'conservative' | 'moderate' | 'overloader';
  prompt_to_closure: boolean;
  closure_aggressiveness: 'gentle' | 'moderate' | 'firm';
  communication_pace: 'deliberate' | 'fast' | 'very_fast';
  prefers_action_over_planning: boolean;
}

interface AIConfig {
  providers: Record<string, { enabled: boolean }>;
  features: Record<string, { enabled: boolean; model_override: string | null }>;
  budget: { daily_limit_usd: number; warn_at_usd: number; pause_on_limit: boolean };
  defaults: { chat_model: string; fast_model: string; reasoning_model: string };
}

interface PluginInfo {
  id: string;
  name: string;
  icon: string;
  description: string;
  docsUrl: string;
  setupGuide: string;
  credentialFields: { key: string; label: string; type: string; required: boolean; placeholder: string; help: string }[];
  actions: { id: string; label: string; description: string }[];
  enabled: boolean;
  configured: boolean;
  last_tested: string | null;
  test_result: 'pass' | 'fail' | null;
}

// ─── Settings Page ──────────────────────────────────────────────────────────

const SECTIONS: { id: Section; label: string; icon: typeof User }[] = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'ai', label: 'AI Configuration', icon: Bot },
  { id: 'integrations', label: 'Integrations', icon: Plug },
];

export function Settings() {
  const [section, setSection] = useState<Section>('profile');

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-xl font-semibold tracking-tight mb-6">Settings</h1>

      <div className="flex gap-6 items-start">
        {/* Settings nav */}
        <div className="w-48 flex-shrink-0 space-y-0.5">
          {SECTIONS.map(s => {
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-[13px] rounded-md transition-colors ${
                  section === s.id
                    ? 'bg-surface-3 text-text-primary font-medium'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
                }`}
              >
                <Icon className="w-[15px] h-[15px] text-text-tertiary" strokeWidth={1.75} />
                <span>{s.label}</span>
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {section === 'profile' && <ProfileSection />}
          {section === 'ai' && <AISection />}
          {section === 'integrations' && <IntegrationsSection />}
        </div>
      </div>
    </div>
  );
}

// ─── Profile Section ────────────────────────────────────────────────────────

const ATTRIBUTE_LABELS: Record<string, string> = {
  coding: 'Coding',
  architecture: 'Architecture',
  design: 'Design',
  product: 'Product',
  devops: 'DevOps',
  data: 'Data',
  security: 'Security',
  testing: 'Testing',
};

const INTELLIGENCE_LABELS: Record<string, string> = {
  systems_thinking: 'Systems',
  product_intuition: 'Product',
  pattern_recognition: 'Patterns',
  learning_velocity: 'Learning',
  strategic_reasoning: 'Strategy',
  communication_clarity: 'Communication',
  technical_abstraction: 'Tech Abstraction',
  attention_to_detail: 'Detail',
};

const INTELLIGENCE_FULL_LABELS: Record<string, string> = {
  systems_thinking: 'Systems Thinking',
  product_intuition: 'Product Intuition',
  pattern_recognition: 'Pattern Recognition',
  learning_velocity: 'Learning Velocity',
  strategic_reasoning: 'Strategic Reasoning',
  communication_clarity: 'Communication',
  technical_abstraction: 'Technical Abstraction',
  attention_to_detail: 'Attention to Detail',
};

function ProfileSection() {
  const [profile, setProfile] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`${BASE}/ai/profile`).then(r => r.json()).then(d => {
      if (d.ok && d.data) {
        const p = d.data;
        if (!p.behavior) {
          p.behavior = {
            session_length_preference: 'long',
            context_window_habits: 'overloader',
            prompt_to_closure: true,
            closure_aggressiveness: 'moderate',
            communication_pace: 'very_fast',
            prefers_action_over_planning: true,
          };
        }
        setProfile(p);
      }
    }).catch(() => {});
  }, []);

  const saveProfile = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      await fetch(`${BASE}/ai/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (!profile) return <div className="text-sm text-text-tertiary py-8 text-center">Loading profile...</div>;

  const observed = profile.ai_observed || {};
  const attributes = observed.attributes || {};
  const intelligence = observed.intelligence_breakdown || {};

  const attributeRadarData = Object.entries(ATTRIBUTE_LABELS).map(([key, label]) => ({
    label,
    value: attributes[key] || 0,
    max: 10,
  }));

  const intelligenceRadarData = Object.entries(INTELLIGENCE_LABELS).map(([key, shortLabel]) => ({
    label: shortLabel,
    value: intelligence[key] || 0,
    max: 10,
  }));

  const iqScore = observed.intelligence_score || 0;
  const iqColor = iqScore >= 130 ? 'text-accent-purple' : iqScore >= 110 ? 'text-accent-blue' : iqScore >= 90 ? 'text-text-primary' : 'text-accent-yellow';
  const iqLabel = iqScore >= 140 ? 'Exceptional' : iqScore >= 130 ? 'Very High' : iqScore >= 120 ? 'Superior' : iqScore >= 110 ? 'High Average' : iqScore >= 90 ? 'Average' : 'Below Average';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">User Profile</h2>
          <p className="text-xs text-text-tertiary mt-0.5">AI-observed cognitive profile and behavioral patterns</p>
        </div>
        <button onClick={saveProfile} disabled={saving} className="btn-primary text-xs flex items-center gap-1.5">
          {saved ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
          {saving ? 'Saving...' : saved ? 'Saved' : 'Save Changes'}
        </button>
      </div>

      {/* Identity + Intelligence Score header */}
      <div className="bg-surface-2 border border-border rounded-lg p-5">
        <div className="flex items-start gap-6">
          {/* Left: Identity */}
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-accent-purple/15 flex items-center justify-center">
                <User className="w-5 h-5 text-accent-purple" strokeWidth={1.75} />
              </div>
              <div>
                <input
                  className="bg-transparent text-lg font-semibold text-text-primary border-none outline-none w-full"
                  value={profile.name}
                  onChange={e => setProfile({ ...profile, name: e.target.value })}
                />
                <input
                  className="bg-transparent text-xs text-text-tertiary border-none outline-none w-full"
                  value={profile.role}
                  onChange={e => setProfile({ ...profile, role: e.target.value })}
                  placeholder="Role"
                />
              </div>
            </div>
            {observed.assessment_notes && (
              <details className="mt-3 group">
                <summary className="text-[10px] text-text-tertiary cursor-pointer hover:text-text-secondary select-none flex items-center gap-1">
                  <ChevronRight className="w-3 h-3 group-open:rotate-90 transition-transform" />
                  {observed.assessment_notes.length} AI observations
                </summary>
                <div className="space-y-1.5 mt-2">
                  {observed.assessment_notes.map((note: string, i: number) => (
                    <p key={i} className="text-[11px] text-text-secondary leading-relaxed flex items-start gap-1.5">
                      <Eye className="w-3 h-3 mt-0.5 text-text-tertiary flex-shrink-0" strokeWidth={2} />
                      {note}
                    </p>
                  ))}
                </div>
              </details>
            )}
          </div>

          {/* Right: Intelligence Score */}
          <div className="text-center flex-shrink-0 w-36">
            <div className="relative inline-flex items-center justify-center">
              <svg width="120" height="120" viewBox="0 0 120 120">
                {/* Background ring */}
                <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" strokeWidth="3" className="text-border" />
                {/* Score ring */}
                <circle
                  cx="60" cy="60" r="50"
                  fill="none"
                  stroke={iqScore >= 130 ? '#a855f7' : iqScore >= 110 ? '#3b82f6' : '#71717a'}
                  strokeWidth="3"
                  strokeDasharray={`${(iqScore / 160) * 314} 314`}
                  strokeLinecap="round"
                  transform="rotate(-90 60 60)"
                  className="transition-all duration-1000"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-2xl font-bold ${iqColor}`}>{iqScore}</span>
                <span className="text-[9px] text-text-tertiary uppercase tracking-wider">IQ Score</span>
              </div>
            </div>
            <p className={`text-xs font-medium mt-1 ${iqColor}`}>{iqLabel}</p>
            <p className="text-[9px] text-text-tertiary mt-0.5">
              {observed.sessions_observed || 0} sessions · {Math.round((observed.confidence || 0) * 100)}% confidence
            </p>
          </div>
        </div>
      </div>

      {/* Web Diagrams */}
      <div className="grid grid-cols-2 gap-5">
        {/* Intelligence Breakdown */}
        <div className="bg-surface-2 border border-border rounded-lg p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Brain className="w-3.5 h-3.5 text-accent-purple" strokeWidth={2} />
            <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Cognitive Profile</h3>
          </div>
          <div className="flex justify-center">
            <RadarChart data={intelligenceRadarData} size={260} color="#a855f7" />
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
            {Object.entries(INTELLIGENCE_FULL_LABELS).map(([key, label]) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-[10px] text-text-tertiary">{label}</span>
                <span className="text-[10px] font-mono text-text-secondary">{intelligence[key] || 0}/10</span>
              </div>
            ))}
          </div>
        </div>

        {/* Skills/Attributes */}
        <div className="bg-surface-2 border border-border rounded-lg p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Sparkles className="w-3.5 h-3.5 text-accent-blue" strokeWidth={2} />
            <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Technical Skills</h3>
          </div>
          <div className="flex justify-center">
            <RadarChart data={attributeRadarData} size={260} color="#3b82f6" />
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
            {Object.entries(ATTRIBUTE_LABELS).map(([key, label]) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-[10px] text-text-tertiary">{label}</span>
                <span className="text-[10px] font-mono text-text-secondary">{attributes[key] || 0}/10</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Deep Assessment */}
      {observed.deep_assessment && (
        <div className="bg-surface-2 border border-border rounded-lg p-4 space-y-4">
          <div className="flex items-center gap-1.5 mb-1">
            <Eye className="w-3.5 h-3.5 text-accent-cyan" strokeWidth={2} />
            <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Deep Assessment</h3>
            <span className="ml-auto text-[9px] text-text-tertiary">
              {observed.projects_audited?.length || 0} projects audited · {observed.deep_assessment.methodology ? 'Full audit' : 'Partial'}
            </span>
          </div>

          {observed.deep_assessment.iq_calibration_notes && (
            <p className="text-[11px] text-text-secondary leading-relaxed bg-surface-3 rounded-md p-3 border border-border/50 italic">
              {observed.deep_assessment.iq_calibration_notes}
            </p>
          )}

          <div className="grid grid-cols-2 gap-4">
            {observed.deep_assessment.cognitive_strengths && (
              <div>
                <h4 className="text-[10px] font-semibold text-status-pass uppercase tracking-wider mb-2">Cognitive Strengths</h4>
                <div className="space-y-1.5">
                  {observed.deep_assessment.cognitive_strengths.map((s: string, i: number) => (
                    <p key={i} className="text-[11px] text-text-secondary leading-relaxed flex items-start gap-1.5">
                      <span className="text-status-pass mt-0.5 flex-shrink-0">+</span>
                      {s}
                    </p>
                  ))}
                </div>
              </div>
            )}
            {observed.deep_assessment.cognitive_weaknesses && (
              <div>
                <h4 className="text-[10px] font-semibold text-accent-yellow uppercase tracking-wider mb-2">Weaknesses</h4>
                <div className="space-y-1.5">
                  {observed.deep_assessment.cognitive_weaknesses.map((w: string, i: number) => (
                    <p key={i} className="text-[11px] text-text-secondary leading-relaxed flex items-start gap-1.5">
                      <span className="text-accent-yellow mt-0.5 flex-shrink-0">~</span>
                      {w}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>

          {observed.deep_assessment.work_style_profile && (
            <div className="pt-2 border-t border-border/50">
              <h4 className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">Work Style</h4>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(observed.deep_assessment.work_style_profile).map(([key, value]: [string, any]) => (
                  <div key={key} className="text-[11px]">
                    <span className="text-text-tertiary">{key.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}:</span>
                    <span className="text-text-secondary ml-1">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Actionable Targets */}
      {observed.actionable_targets && (
        <div className="bg-surface-2 border border-border rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Sparkles className="w-3.5 h-3.5 text-accent-blue" strokeWidth={2} />
            <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Development Targets</h3>
          </div>
          <div className="space-y-3">
            {observed.actionable_targets.map((t: any, i: number) => (
              <div key={i} className="bg-surface-3 border border-border/50 rounded-md p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-text-primary">{t.area}</span>
                </div>
                <p className="text-[10px] text-text-tertiary">{t.current}</p>
                <p className="text-[11px] text-accent-blue">{t.target}</p>
                <p className="text-[10px] text-text-tertiary italic">{t.why}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Comparative Framing */}
      {observed.comparative_framing && (
        <div className="bg-surface-2 border border-border rounded-lg p-4 space-y-4">
          <div className="flex items-center gap-1.5 mb-1">
            <Eye className="w-3.5 h-3.5 text-accent-purple" strokeWidth={2} />
            <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Comparative Position</h3>
          </div>
          {observed.comparative_framing.archetype && (
            <p className="text-[12px] text-text-secondary bg-surface-3 rounded-md p-3 border border-border/50">
              <span className="font-semibold text-text-primary">Archetype:</span> {observed.comparative_framing.archetype}
            </p>
          )}
          <div className="grid grid-cols-3 gap-3">
            {Object.entries(observed.comparative_framing).filter(([k]) => k.startsWith('vs_')).map(([key, group]: [string, any]) => (
              <div key={key} className="space-y-1.5">
                <h4 className="text-[10px] font-semibold text-text-tertiary uppercase">{key.replace('vs_', 'vs ').replace(/_/g, ' ')}</h4>
                {Object.entries(group).map(([metric, value]: [string, any]) => (
                  <div key={metric} className="text-[10px]">
                    <span className="text-text-tertiary capitalize">{metric.replace(/_/g, ' ')}:</span>
                    <span className="text-text-secondary ml-1">{value}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Dependency */}
      {observed.ai_dependency_estimate && (
        <div className="bg-surface-2 border border-border rounded-lg p-4 space-y-3">
          <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">AI Dependency</h3>
          <div className="space-y-2">
            {Object.entries(observed.ai_dependency_estimate).filter(([k]) => !['overall', 'risk'].includes(k)).map(([key, value]: [string, any]) => (
              <div key={key} className="flex items-center gap-3">
                <span className="text-[10px] text-text-tertiary w-36 flex-shrink-0 capitalize">{key.replace(/_/g, ' ')}</span>
                <div className="flex-1 h-1.5 bg-surface-4 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent-blue rounded-full"
                    style={{ width: `${parseInt((value as string).match(/(\d+)%/)?.[1] || '50')}%` }}
                  />
                </div>
                <span className="text-[10px] text-text-secondary w-48 flex-shrink-0">{value}</span>
              </div>
            ))}
          </div>
          {observed.ai_dependency_estimate.overall && (
            <p className="text-[11px] text-text-secondary mt-2 italic">{observed.ai_dependency_estimate.overall}</p>
          )}
          {observed.ai_dependency_estimate.risk && (
            <p className="text-[10px] text-text-tertiary">{observed.ai_dependency_estimate.risk}</p>
          )}
        </div>
      )}

      {/* Session Observation Log */}
      {profile.session_observations?.observations?.length > 0 && (
        <div className="bg-surface-2 border border-border rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Eye className="w-3.5 h-3.5 text-text-tertiary" strokeWidth={2} />
            <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Session Observation Log</h3>
            <span className="ml-auto text-[9px] text-text-tertiary">{profile.session_observations.observations.length} observations</span>
          </div>
          <p className="text-[9px] text-text-tertiary italic">Raw AI-to-AI observations from each coding session. These feed into score adjustments over time.</p>
          <div className="space-y-2">
            {profile.session_observations.observations.map((obs: any, i: number) => (
              <div key={i} className="bg-surface-3 border border-border/50 rounded-md p-3 space-y-2">
                <div className="flex items-center gap-2 text-[10px] text-text-tertiary">
                  <span>Session {obs.session}</span>
                  <span>·</span>
                  <span>{obs.date}</span>
                  <span>·</span>
                  <span className="text-text-secondary">{obs.observer}</span>
                  <span>·</span>
                  <span>{obs.source}</span>
                </div>
                <p className="text-[11px] text-text-secondary leading-relaxed">{obs.notes}</p>
                {obs.attribute_signals && (
                  <div className="grid grid-cols-2 gap-1 pt-1 border-t border-border/30">
                    {Object.entries(obs.attribute_signals).map(([key, value]: [string, any]) => (
                      <div key={key} className="text-[10px]">
                        <span className="text-text-tertiary">{key.replace(/_/g, ' ')}:</span>
                        <span className="text-text-secondary ml-1">{value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI tag line */}
      <div className="flex items-center gap-2 px-1">
        <Eye className="w-3 h-3 text-text-tertiary" strokeWidth={2} />
        <p className="text-[10px] text-text-tertiary italic">
          Scores are AI-observed and update dynamically based on your conversations. Last assessed: {observed.last_assessed || 'Never'}
        </p>
      </div>

      {/* Behavior patterns — user can adjust these */}
      <div className="bg-surface-2 border border-border rounded-lg p-4 space-y-4">
        <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Behavior Patterns</h3>
        <p className="text-[10px] text-text-tertiary">AI-observed with manual override. The AI adapts session management based on these.</p>
        <div className="grid grid-cols-2 gap-4">
          <SelectField
            label="Session Length"
            value={profile.behavior?.session_length_preference || 'long'}
            options={[
              { value: 'short', label: 'Short (< 1 hour)' },
              { value: 'medium', label: 'Medium (1-3 hours)' },
              { value: 'long', label: 'Long (3+ hours)' },
            ]}
            onChange={v => setProfile({ ...profile, behavior: { ...profile.behavior, session_length_preference: v } })}
          />
          <SelectField
            label="Context Window Habits"
            value={profile.behavior?.context_window_habits || 'overloader'}
            options={[
              { value: 'conservative', label: 'Conservative — stays focused' },
              { value: 'moderate', label: 'Moderate — balanced' },
              { value: 'overloader', label: 'Overloader — throws a lot at once' },
            ]}
            onChange={v => setProfile({ ...profile, behavior: { ...profile.behavior, context_window_habits: v } })}
          />
          <SelectField
            label="Communication Pace"
            value={profile.behavior?.communication_pace || 'very_fast'}
            options={[
              { value: 'deliberate', label: 'Deliberate — thinks before speaking' },
              { value: 'fast', label: 'Fast — moves quickly' },
              { value: 'very_fast', label: 'Very Fast — rapid-fire' },
            ]}
            onChange={v => setProfile({ ...profile, behavior: { ...profile.behavior, communication_pace: v } })}
          />
          <SelectField
            label="Closure Prompting"
            value={profile.behavior?.closure_aggressiveness || 'moderate'}
            options={[
              { value: 'gentle', label: 'Gentle — subtle hints' },
              { value: 'moderate', label: 'Moderate — clear suggestions' },
              { value: 'firm', label: 'Firm — direct prompts' },
            ]}
            onChange={v => setProfile({ ...profile, behavior: { ...profile.behavior, closure_aggressiveness: v } })}
          />
        </div>
        <div className="flex items-center gap-6 pt-2">
          <ToggleField
            label="Prompt me to end sessions"
            checked={profile.behavior?.prompt_to_closure ?? true}
            onChange={v => setProfile({ ...profile, behavior: { ...profile.behavior, prompt_to_closure: v } })}
          />
          <ToggleField
            label="Prefers action over planning"
            checked={profile.behavior?.prefers_action_over_planning ?? true}
            onChange={v => setProfile({ ...profile, behavior: { ...profile.behavior, prefers_action_over_planning: v } })}
          />
        </div>
      </div>

      {/* AI Instructions — editable */}
      <div className="bg-surface-2 border border-border rounded-lg p-4 space-y-3">
        <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">AI Instructions</h3>
        <p className="text-[10px] text-text-tertiary">Custom instructions injected into every AI conversation. Edit to change how AI works with you.</p>
        <textarea
          className="input text-xs font-sans resize-y min-h-[80px]"
          rows={4}
          value={profile.ai_instructions || ''}
          onChange={e => setProfile({ ...profile, ai_instructions: e.target.value })}
        />
      </div>

      {/* Context notes — editable */}
      <div className="bg-surface-2 border border-border rounded-lg p-4 space-y-3">
        <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Context Notes</h3>
        <p className="text-[10px] text-text-tertiary">Key things the AI knows about you. AI-generated, editable.</p>
        <div className="space-y-2">
          {(profile.context_notes || []).map((note: string, i: number) => (
            <div key={i} className="flex items-start gap-2">
              <input
                className="input text-xs flex-1"
                value={note}
                onChange={e => {
                  const notes = [...(profile.context_notes || [])];
                  notes[i] = e.target.value;
                  setProfile({ ...profile, context_notes: notes });
                }}
              />
              <button
                onClick={() => {
                  const notes = (profile.context_notes || []).filter((_: any, idx: number) => idx !== i);
                  setProfile({ ...profile, context_notes: notes });
                }}
                className="p-1.5 text-text-tertiary hover:text-accent-red transition-colors"
              >
                <XIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <button
            onClick={() => setProfile({ ...profile, context_notes: [...(profile.context_notes || []), ''] })}
            className="btn-ghost text-xs"
          >
            + Add note
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── AI Configuration Section ───────────────────────────────────────────────

function AISection() {
  const [config, setConfig] = useState<AIConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [models, setModels] = useState<{ id: string; name: string; provider: string; tier: string }[]>([]);

  useEffect(() => {
    fetch(`${BASE}/ai/config`).then(r => r.json()).then(d => {
      if (d.ok) setConfig(d.data);
    }).catch(() => {});

    fetch(`${BASE}/ai/models`).then(r => r.json()).then(d => {
      if (d.ok) setModels(d.data.models || []);
    }).catch(() => {});
  }, []);

  const saveConfig = async () => {
    if (!config) return;
    setSaving(true);
    try {
      await fetch(`${BASE}/ai/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (!config) return <div className="text-sm text-text-tertiary py-8 text-center">Loading AI config...</div>;

  // Deduplicate models for dropdowns
  const uniqueModels = new Map<string, typeof models[0]>();
  for (const m of models) {
    if (/tts|transcribe|audio|diarize|search|codex/.test(m.id)) continue;
    const key = `${m.provider}:${m.name}`;
    if (!uniqueModels.has(key) || m.id.length < (uniqueModels.get(key)?.id.length || 999)) {
      uniqueModels.set(key, m);
    }
  }
  const modelList = Array.from(uniqueModels.values());

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">AI Configuration</h2>
          <p className="text-xs text-text-tertiary mt-0.5">Provider settings, model defaults, and budget controls</p>
        </div>
        <button onClick={saveConfig} disabled={saving} className="btn-primary text-xs flex items-center gap-1.5">
          {saved ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
          {saving ? 'Saving...' : saved ? 'Saved' : 'Save Changes'}
        </button>
      </div>

      {/* Providers */}
      <div className="bg-surface-2 border border-border rounded-lg p-4 space-y-3">
        <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Providers</h3>
        <div className="space-y-2">
          {Object.entries(config.providers).map(([id, provider]) => (
            <div key={id} className="flex items-center justify-between px-3 py-2 bg-surface-3 rounded-md">
              <div className="flex items-center gap-2.5">
                <span className={`w-2 h-2 rounded-full ${provider.enabled ? 'bg-status-pass' : 'bg-surface-4'}`} />
                <span className="text-sm font-medium text-text-primary capitalize">{id}</span>
              </div>
              <ToggleSwitch
                checked={provider.enabled}
                onChange={v => setConfig({
                  ...config,
                  providers: { ...config.providers, [id]: { ...provider, enabled: v } },
                })}
              />
            </div>
          ))}
        </div>
        <p className="text-[10px] text-text-tertiary">API keys are configured in <code className="text-accent-blue">.credentials.json</code>. A Settings UI for managing keys is coming soon.</p>
      </div>

      {/* Default models */}
      <div className="bg-surface-2 border border-border rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Default Models</h3>
          <span className="text-[10px] text-text-tertiary">{models.length} models available</span>
        </div>
        <div className="grid grid-cols-1 gap-3">
          <ModelSelect
            label="Chat Model"
            description="Used for AI chat conversations"
            value={config.defaults.chat_model}
            models={modelList}
            onChange={v => setConfig({ ...config, defaults: { ...config.defaults, chat_model: v } })}
          />
          <ModelSelect
            label="Fast Model"
            description="Used for quick operations (summaries, classifications)"
            value={config.defaults.fast_model}
            models={modelList}
            onChange={v => setConfig({ ...config, defaults: { ...config.defaults, fast_model: v } })}
          />
          <ModelSelect
            label="Reasoning Model"
            description="Used for complex analysis and planning"
            value={config.defaults.reasoning_model}
            models={modelList}
            onChange={v => setConfig({ ...config, defaults: { ...config.defaults, reasoning_model: v } })}
          />
        </div>
      </div>

      {/* Budget */}
      <div className="bg-surface-2 border border-border rounded-lg p-4 space-y-4">
        <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Budget Controls</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-text-secondary mb-1 block">Daily Limit (USD)</label>
            <input
              type="number"
              step="0.50"
              min="0"
              className="input text-sm font-mono"
              value={config.budget.daily_limit_usd}
              onChange={e => setConfig({
                ...config,
                budget: { ...config.budget, daily_limit_usd: parseFloat(e.target.value) || 0 },
              })}
            />
          </div>
          <div>
            <label className="text-xs text-text-secondary mb-1 block">Warn At (USD)</label>
            <input
              type="number"
              step="0.50"
              min="0"
              className="input text-sm font-mono"
              value={config.budget.warn_at_usd}
              onChange={e => setConfig({
                ...config,
                budget: { ...config.budget, warn_at_usd: parseFloat(e.target.value) || 0 },
              })}
            />
          </div>
        </div>
        <ToggleField
          label="Pause when budget limit is reached"
          checked={config.budget.pause_on_limit}
          onChange={v => setConfig({ ...config, budget: { ...config.budget, pause_on_limit: v } })}
        />
      </div>

      {/* Features */}
      <div className="bg-surface-2 border border-border rounded-lg p-4 space-y-3">
        <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">AI Features</h3>
        <div className="space-y-2">
          {Object.entries(config.features).map(([id, feature]) => (
            <div key={id} className="flex items-center justify-between px-3 py-2 bg-surface-3 rounded-md">
              <div>
                <span className="text-xs font-medium text-text-primary">{formatFeatureName(id)}</span>
              </div>
              <ToggleSwitch
                checked={feature.enabled}
                onChange={v => setConfig({
                  ...config,
                  features: { ...config.features, [id]: { ...feature, enabled: v } },
                })}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Integrations Section ───────────────────────────────────────────────────

function IntegrationsSection() {
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [editCreds, setEditCreds] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    apiFetch<{ plugins: PluginInfo[] }>('/integrations')
      .then(d => setPlugins(d.plugins))
      .catch(() => {});
  }, []);

  const selected = plugins.find(p => p.id === selectedId);

  useEffect(() => {
    if (selectedId) {
      apiFetch<{ plugin: PluginInfo; credentials: Record<string, string> }>(`/integrations/${selectedId}`)
        .then(d => {
          setCredentials(d.credentials);
          setEditCreds({});
          setTestResult(null);
          setShowGuide(false);
        })
        .catch(() => {});
    }
  }, [selectedId]);

  const saveCredentials = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      await apiFetch(`/integrations/${selectedId}/credentials`, {
        method: 'POST',
        body: JSON.stringify({ credentials: editCreds }),
      });
      const d = await apiFetch<{ plugin: PluginInfo; credentials: Record<string, string> }>(`/integrations/${selectedId}`);
      setCredentials(d.credentials);
      setEditCreds({});
      const pl = await apiFetch<{ plugins: PluginInfo[] }>('/integrations');
      setPlugins(pl.plugins);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    if (!selectedId) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await apiFetch<{ ok: boolean; message: string }>(`/integrations/${selectedId}/test`, { method: 'POST' });
      setTestResult(result);
      const pl = await apiFetch<{ plugins: PluginInfo[] }>('/integrations');
      setPlugins(pl.plugins);
    } catch (err: any) {
      setTestResult({ ok: false, message: err.message });
    } finally {
      setTesting(false);
    }
  };

  const toggleEnabled = async (pluginId: string, enabled: boolean) => {
    await apiFetch(`/integrations/${pluginId}/${enabled ? 'enable' : 'disable'}`, { method: 'POST' });
    const pl = await apiFetch<{ plugins: PluginInfo[] }>('/integrations');
    setPlugins(pl.plugins);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold">Integrations</h2>
        <p className="text-xs text-text-tertiary mt-0.5">Connect your development tools</p>
      </div>

      <div className="grid grid-cols-3 gap-5 items-start">
        {/* Plugin list */}
        <div className="space-y-1.5">
          {plugins.map(p => (
            <div
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              className={`bg-surface-2 border rounded-md p-3 cursor-pointer transition-colors ${
                selectedId === p.id ? 'border-accent-blue/40 bg-surface-3' : 'border-border hover:border-border-strong hover:bg-surface-3'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-text-primary">{p.name}</span>
                    {p.enabled && p.configured && (
                      <span className={`w-1.5 h-1.5 rounded-full ${p.test_result === 'pass' ? 'bg-status-pass' : p.test_result === 'fail' ? 'bg-status-fail' : 'bg-status-neutral'}`} />
                    )}
                  </div>
                  <p className="text-[10px] text-text-tertiary truncate mt-0.5">{p.description}</p>
                </div>
                <ToggleSwitch
                  checked={p.enabled}
                  onChange={(v) => { toggleEnabled(p.id, v); }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Plugin detail */}
        <div className="col-span-2">
          {selected ? (
            <div className="bg-surface-2 border border-border rounded-lg p-5 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-text-primary">{selected.name}</h3>
                  <p className="text-xs text-text-tertiary mt-0.5">{selected.description}</p>
                </div>
                <a href={selected.docsUrl} target="_blank" rel="noreferrer" className="btn-ghost text-xs flex items-center gap-1">
                  Docs <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              {/* Setup guide */}
              <button onClick={() => setShowGuide(!showGuide)} className="text-xs text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1">
                <ChevronRight className={`w-3 h-3 transition-transform ${showGuide ? 'rotate-90' : ''}`} />
                Setup Guide
              </button>
              {showGuide && (
                <div className="bg-surface-0 rounded-md p-4 text-xs text-text-secondary whitespace-pre-wrap leading-relaxed animate-fade-in">
                  {selected.setupGuide}
                </div>
              )}

              {/* Credentials */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Credentials</h4>
                {selected.credentialFields.map(field => (
                  <div key={field.key}>
                    <label className="text-xs text-text-secondary mb-1 flex items-center gap-1">
                      {field.label}
                      {field.required && <span className="text-accent-red text-[10px]">*</span>}
                    </label>
                    <input
                      type={field.type === 'token' ? 'password' : 'text'}
                      className="input font-mono text-xs"
                      placeholder={credentials[field.key] || field.placeholder}
                      value={editCreds[field.key] || ''}
                      onChange={e => setEditCreds({ ...editCreds, [field.key]: e.target.value })}
                    />
                    <p className="text-[10px] text-text-tertiary mt-0.5">{field.help}</p>
                    {credentials[field.key] && !editCreds[field.key] && (
                      <p className="text-[10px] text-status-pass mt-0.5 flex items-center gap-1">
                        <Check className="w-2.5 h-2.5" /> Saved: {credentials[field.key]}
                      </p>
                    )}
                  </div>
                ))}

                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={saveCredentials}
                    disabled={saving || Object.keys(editCreds).length === 0}
                    className="btn-primary text-xs"
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button onClick={testConnection} disabled={testing} className="btn-ghost text-xs flex items-center gap-1">
                    <RefreshCw className={`w-3 h-3 ${testing ? 'animate-spin' : ''}`} />
                    {testing ? 'Testing...' : 'Test Connection'}
                  </button>
                </div>

                {testResult && (
                  <div className={`p-3 rounded-md text-xs animate-fade-in ${
                    testResult.ok
                      ? 'bg-status-pass/10 text-status-pass border border-status-pass/20'
                      : 'bg-status-fail/10 text-status-fail border border-status-fail/20'
                  }`}>
                    <span className="font-medium">{testResult.ok ? 'Connected' : 'Failed'}</span>
                    <p className="text-[10px] mt-1 opacity-80">{testResult.message}</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-surface-2 border border-border rounded-lg p-12 text-center">
              <Plug className="w-8 h-8 text-text-tertiary mx-auto mb-3" strokeWidth={1.5} />
              <p className="text-sm text-text-secondary mb-1">Select an integration</p>
              <p className="text-xs text-text-tertiary">Configure your development stack tools.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Shared Components ──────────────────────────────────────────────────────

function SelectField({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-xs text-text-secondary mb-1 block">{label}</label>
      <select
        className="input text-xs"
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function ModelSelect({ label, description, value, models, onChange }: {
  label: string;
  description: string;
  value: string;
  models: { id: string; name: string; provider: string; tier: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-4 px-3 py-2.5 bg-surface-3 rounded-md">
      <div className="flex-1 min-w-0">
        <span className="text-xs font-medium text-text-primary">{label}</span>
        <p className="text-[10px] text-text-tertiary">{description}</p>
      </div>
      <select
        className="bg-surface-2 border border-border rounded px-2 py-1 text-xs text-text-secondary max-w-[200px]"
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        {['anthropic', 'openai', 'google'].map(provider => {
          const pm = models.filter(m => m.provider === provider);
          if (pm.length === 0) return null;
          return (
            <optgroup key={provider} label={provider.charAt(0).toUpperCase() + provider.slice(1)}>
              {pm.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </optgroup>
          );
        })}
      </select>
    </div>
  );
}

function ToggleField({ label, checked, onChange }: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <ToggleSwitch checked={checked} onChange={onChange} />
      <span className="text-xs text-text-secondary">{label}</span>
    </label>
  );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
      className={`w-8 h-[18px] rounded-full transition-colors flex items-center flex-shrink-0 ${
        checked ? 'bg-accent-blue justify-end' : 'bg-surface-4 justify-start'
      }`}
    >
      <span className="w-3.5 h-3.5 rounded-full bg-white mx-0.5 transition-transform" />
    </button>
  );
}

function formatFeatureName(id: string): string {
  return id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
