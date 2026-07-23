import { MapPin } from 'lucide-react';

// Region badge for the admin combined view. Non-admins only ever see their own
// region's data, so this is rendered admin-only at each call site. `team` is the
// region string stamped on the doc (doc.teamId), e.g. "Dubai" / "Nigeria".
const REGION_STYLES = {
  Dubai: 'bg-blue-50 border-blue-200 text-[#2563eb]',
  Nigeria: 'bg-amber-50 border-amber-200 text-amber-700',
};

// Stable fallback palette so any future region gets a consistent (non-clashing) color.
const FALLBACK_PALETTE = [
  'bg-emerald-50 border-emerald-200 text-emerald-700',
  'bg-purple-50 border-purple-200 text-purple-700',
  'bg-rose-50 border-rose-200 text-rose-700',
  'bg-cyan-50 border-cyan-200 text-cyan-700',
];

function regionClass(team) {
  if (REGION_STYLES[team]) return REGION_STYLES[team];
  if (!team) return 'bg-slate-100 border-slate-200 text-slate-500';
  let hash = 0;
  for (let i = 0; i < team.length; i++) hash = (hash * 31 + team.charCodeAt(i)) & 0xffff;
  return FALLBACK_PALETTE[hash % FALLBACK_PALETTE.length];
}

export default function TeamTag({ team, className = '' }) {
  const label = team || '—';
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-black uppercase tracking-wider ${regionClass(team)} ${className}`}
      title={team ? `Team: ${team}` : 'No team assigned'}
    >
      <MapPin className="w-3 h-3" />
      {label}
    </span>
  );
}
