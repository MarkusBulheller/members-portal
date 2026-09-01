import { Navigate, useParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import AchievementsAdminPage from './AchievementsAdminPage';
import DiscordBotSettingsPage from './DiscordBotSettingsPage';
import IracingTeamsPage from './IracingTeamsPage';
import TeamHighlightsAdminPage from './TeamHighlightsAdminPage';

const TABS = [
  { slug: 'achievements', label: 'Achievements', Component: AchievementsAdminPage },
  { slug: 'iracing-teams', label: 'iRacing Teams', Component: IracingTeamsPage },
  { slug: 'team-highlights', label: 'Team Highlights', Component: TeamHighlightsAdminPage },
  { slug: 'discord-bot', label: 'Discord Bot', Component: DiscordBotSettingsPage },
] as const;

export default function SettingsAdminPage() {
  const { tab } = useParams<{ tab?: string }>();
  const active = TABS.find((t) => t.slug === tab);

  if (!active) {
    return <Navigate to={`/admin/settings/${TABS[0].slug}`} replace />;
  }

  return (
    <div>
      <div className="flex items-center gap-1 mb-8 border-b border-white/10">
        {TABS.map((t) => (
          <Link
            key={t.slug}
            to={`/admin/settings/${t.slug}`}
            className={`px-4 py-2.5 font-heading text-xs tracking-wide uppercase transition-colors border-b-2 -mb-px ${
              t.slug === active.slug
                ? 'text-w2w-red border-w2w-red'
                : 'text-white/60 border-transparent hover:text-white'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <active.Component />
    </div>
  );
}
