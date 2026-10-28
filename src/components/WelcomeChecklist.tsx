import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { driversApi } from '../lib/api/drivers';
import type { DriverProfile } from '../types/driver';

interface Step {
  key: string;
  title: string;
  hint: string;
  done: boolean;
  to: string;
  action: string;
}

const dismissKey = (userId: string) => `w2w.welcome.dismissed.${userId}`;

function readDismissed(userId: string | undefined): boolean {
  if (!userId) return false;
  try {
    return localStorage.getItem(dismissKey(userId)) === '1';
  } catch {
    return false;
  }
}

/** The steps that make a new member useful to the team, derived from their own profile (and
 * whether they have signed up for anything). Shown on the dashboard until everything is done, or
 * until the member hides it. Nothing is stored on the server. */
function buildSteps(profile: DriverProfile, hasSignedUp: boolean, hasOpenEvents: boolean): Step[] {
  const hasPreferences =
    !!profile.preferredClasses?.trim() ||
    profile.maxSuccessiveStints !== null ||
    profile.startingDriver ||
    profile.wetDriver ||
    profile.nightDriver;

  const steps: Step[] = [
    {
      key: 'iracing',
      title: 'Link your iRacing account',
      hint: 'Brings in your name, iRating and safety rating, and lets results find your stints.',
      done: !!profile.iracingCustomerId,
      to: '/drivers/me/edit#ir',
      action: 'Link',
    },
    {
      key: 'timezone',
      title: 'Set your time zone',
      hint: 'So stint plans and event times show in your own local time.',
      done: !!profile.timezone,
      to: '/drivers/me/edit#basics',
      action: 'Set',
    },
    {
      key: 'photo',
      title: 'Add a profile photo',
      hint: 'Upload one, or use your Discord avatar.',
      done: !!profile.avatarUrl,
      to: '/drivers/me/edit#basics',
      action: 'Add',
    },
    {
      key: 'prefs',
      title: 'Choose your race preferences',
      hint: 'Preferred classes, wet and night driving, starting driver. Used when teams are built.',
      done: hasPreferences,
      to: '/drivers/me/edit#prefs',
      action: 'Choose',
    },
  ];

  // Only offered while there is something to sign up for (or once it is already done).
  if (hasOpenEvents || hasSignedUp) {
    steps.push({
      key: 'signup',
      title: 'Sign up for an event',
      hint: 'Pick the start times you can do, and tell us your car class.',
      done: hasSignedUp,
      to: '/events',
      action: 'Open events',
    });
  }
  return steps;
}

export default function WelcomeChecklist({
  hasSignedUp,
  hasOpenEvents,
}: {
  hasSignedUp: boolean;
  hasOpenEvents: boolean;
}) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  // The member is known by the time the dashboard renders (RequireAuth), so read the flag once.
  const [dismissed, setDismissed] = useState(() => readDismissed(user?.id));

  useEffect(() => {
    if (dismissed) return;
    let cancelled = false;
    driversApi
      .getOwn()
      .then((loaded) => {
        if (!cancelled) setProfile(loaded);
      })
      .catch(() => {
        // No profile yet (or the request failed): simply don't show the checklist.
      });
    return () => {
      cancelled = true;
    };
  }, [dismissed]);

  const steps = useMemo(
    () => (profile ? buildSteps(profile, hasSignedUp, hasOpenEvents) : []),
    [profile, hasSignedUp, hasOpenEvents],
  );

  if (dismissed || !profile || steps.length === 0) return null;
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;

  function hide() {
    setDismissed(true);
    try {
      if (user?.id) localStorage.setItem(dismissKey(user.id), '1');
    } catch {
      // Storage unavailable (private window): it just comes back next visit.
    }
  }

  return (
    <section
      aria-labelledby="welcome-title"
      className="cut flex flex-col gap-3.5 bg-ds-panel px-4 pb-4 pt-4 shadow-[inset_0_-3px_0_var(--color-w2w-red)] sm:px-5 sm:pt-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-col gap-1">
          <h2 id="welcome-title" className="h2">
            Get set up
          </h2>
          <span className="text-[13px] text-ds-muted">A few quick steps so the team can plan around you.</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="num text-xl" aria-label={`${doneCount} of ${steps.length} steps done`}>
            {doneCount}
            <span className="text-ds-dim"> / {steps.length}</span>
          </span>
          <button
            type="button"
            onClick={hide}
            className="cursor-pointer border-0 bg-transparent p-1 text-xs font-semibold text-ds-muted hover:text-ds-ink"
          >
            Hide
          </button>
        </div>
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={doneCount}
        aria-label="Setup progress"
        className="h-1.5 bg-ds-control"
      >
        <div className="h-full bg-w2w-red" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
      </div>

      <ul className="m-0 flex list-none flex-col p-0">
        {steps.map((step) => (
          <li key={step.key} className="flex items-center gap-3 border-t border-ds-line py-2.5 first:border-t-0">
            <span
              aria-hidden="true"
              className={`cut-xs flex h-6 w-6 shrink-0 items-center justify-center ${
                step.done ? 'bg-w2w-red text-on-accent' : 'bg-ds-control text-ds-dim'
              }`}
            >
              {step.done ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              ) : null}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className={`text-sm font-bold ${step.done ? 'text-ds-muted line-through' : 'text-ds-ink'}`}>
                {step.title}
                <span className="sr-only">{step.done ? ' (done)' : ' (to do)'}</span>
              </span>
              {!step.done && <span className="text-xs text-ds-muted">{step.hint}</span>}
            </span>
            {!step.done && (
              <Link to={step.to} className="btn-secondary btn-sm shrink-0">
                {step.action}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
