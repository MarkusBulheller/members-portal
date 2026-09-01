import { useAccent } from '../context/AccentContext';
import { ACCENT_OPTIONS, type Accent } from '../lib/accent';

export default function AccentPicker() {
  const { accent, setAccent } = useAccent();

  return (
    <select
      value={accent}
      onChange={(e) => setAccent(e.target.value as Accent)}
      aria-label="Accent color"
      className="w-full bg-w2w-black border border-white/15 text-white text-xs px-2 py-1.5 focus:outline-none focus:border-w2w-red"
    >
      {ACCENT_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
