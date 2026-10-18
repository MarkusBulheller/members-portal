import { Navigate, useParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import AchievementsAdminPage from './AchievementsAdminPage';
import DiscordBotSettingsPage from './DiscordBotSettingsPage';
import IracingTeamsPage from './IracingTeamsPage';
import TeamHighlightsAdminPage from './TeamHighlightsAdminPage';

const TABS = [
  { slug: 'achievements', label: 'Achievements', Component: AchievementsAdminPage },
  { slug: 'iracing-teams', label: 'iRacing teams', Component: IracingTeamsPage },
  { slug: 'team-highlights', label: 'Team highlights', Component: TeamHighlightsAdminPage },
  { slug: 'discord-bot', label: 'Discord bot', Component: DiscordBotSettingsPage },
] as const;

export default function SettingsAdminPage() {
  const { tab } = useParams<{ tab?: string }>();
  const active = TABS.find((t) => t.slug === tab);

  if (!active) {
    return <Navigate to={`/admin/settings/${TABS[0].slug}`} replace />;
  }

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="m-0 text-[34px] font-extrabold leading-[1.1] text-ds-ink">Settings</h1>
        <span className="text-ds-muted">Admin only</span>
      </header>

      <nav aria-label="Settings" className="flex flex-wrap gap-1 border-b border-ds-line">
        {TABS.map((t) => (
          <Link
            key={t.slug}
            to={`/admin/settings/${t.slug}`}
            aria-current={t.slug === active.slug ? 'page' : undefined}
            className={`-mb-px flex min-h-[46px] items-center px-3.5 text-sm font-extrabold uppercase no-underline transition-colors ${
              t.slug === active.slug
                ? 'text-ds-ink shadow-[inset_0_-3px_0_var(--color-w2w-red)]'
                : 'text-ds-muted hover:text-ds-ink'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <active.Component />
    </div>
  );
}
