import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useConfirm } from '../../context/ConfirmContext';
import { contactInquiriesApi } from '../../lib/api/contactInquiries';
import { publicSiteHost } from '../../lib/publicSite';
import { relativeTime } from '../../lib/relativeTime';
import type { ContactInquiry } from '../../types/contactInquiry';

export default function ContactInquiriesAdminPage() {
  const confirm = useConfirm();
  const [inquiries, setInquiries] = useState<ContactInquiry[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = () => void contactInquiriesApi.list().then(setInquiries);
  useEffect(load, []);

  async function handleToggleReviewed(inquiry: ContactInquiry) {
    setBusy(true);
    try {
      await contactInquiriesApi.setReviewed(inquiry.id, !inquiry.reviewed);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(inquiry: ContactInquiry) {
    if (!(await confirm(`Delete the inquiry from "${inquiry.name}"? This cannot be undone.`, { confirmLabel: 'Delete' }))) {
      return;
    }
    setBusy(true);
    try {
      await contactInquiriesApi.remove(inquiry.id);
      load();
    } finally {
      setBusy(false);
    }
  }

  const siteHost = publicSiteHost();
  const unreviewedCount = (inquiries ?? []).filter((i) => !i.reviewed).length;
  const current = inquiries?.find((i) => i.id === selectedId) ?? inquiries?.[0] ?? null;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="m-0 text-[34px] font-extrabold leading-[1.1] text-ds-ink">Contact inquiries</h1>
        <span className="text-ds-muted">
          Messages from the contact form{siteHost ? ` on ${siteHost}` : ''} ·{' '}
          <strong className="font-semibold text-ds-ink">
            {unreviewedCount} new
          </strong>
        </span>
      </header>

      {inquiries === null ? (
        <p role="status" className="m-0 text-sm text-ds-muted">Loading...</p>
      ) : inquiries.length === 0 ? (
        <section className="cut bg-ds-panel">
          <p className="m-0 px-4 py-9 text-center text-ds-muted">No inquiries yet.</p>
        </section>
      ) : (
        <div className="flex flex-wrap items-start gap-5">
          <section
            aria-labelledby="iq-list"
            className="cut flex min-w-0 flex-[2_1_320px] flex-col bg-ds-panel pb-1.5 pt-5"
          >
            <h2 id="iq-list" className="h2 px-5 pb-3">Inbox</h2>
            {inquiries.map((inquiry) => {
              const selected = current?.id === inquiry.id;
              return (
                <button
                  key={inquiry.id}
                  type="button"
                  onClick={() => setSelectedId(inquiry.id)}
                  aria-pressed={selected}
                  className={`row-hover box-border flex w-full cursor-pointer items-start gap-3 border-0 border-t border-ds-line px-5 py-3.5 text-left text-ds-ink focus-visible:shadow-[inset_0_0_0_2px_var(--color-ds-ink)] focus-visible:outline-none ${
                    selected
                      ? 'bg-ds-raised shadow-[inset_3px_0_0_var(--color-w2w-red)]'
                      : 'bg-transparent'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`mt-1.5 h-[9px] w-[9px] flex-none -skew-x-20 ${
                      inquiry.reviewed ? 'bg-transparent' : 'bg-w2w-red'
                    }`}
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex justify-between gap-2">
                      <span className="font-bold">{inquiry.name}</span>
                      <span className="whitespace-nowrap text-xs text-ds-dim">
                        {relativeTime(inquiry.createdAt, { capitalize: true })}
                      </span>
                    </span>
                    <span className="text-xs font-semibold text-w2w-red-ink">{inquiry.interestedIn}</span>
                    {inquiry.message && (
                      <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[13px] text-ds-muted">
                        {inquiry.message}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </section>

          {current && (
            <article
              aria-labelledby="iq-name"
              className="cut flex min-w-0 flex-[3_1_440px] flex-col gap-[18px] bg-ds-panel p-6"
            >
              <div className="flex flex-wrap justify-between gap-3">
                <div className="flex flex-col gap-2">
                  <span className="chip self-start text-w2w-red-ink">{current.interestedIn}</span>
                  <div className="flex flex-col gap-0.5">
                    <h2 id="iq-name" className="m-0 text-[28px] font-extrabold leading-[1.15] text-ds-ink">
                      {current.name}
                    </h2>
                    <span
                      className="text-[13px] text-ds-muted"
                      title={new Date(current.createdAt).toLocaleString('en-GB', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                        hour12: false,
                      })}
                    >
                      Received {relativeTime(current.createdAt)}
                    </span>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <button
                    onClick={() => void handleToggleReviewed(current)}
                    disabled={busy}
                    className="btn-secondary min-h-10 px-4 text-[13px]"
                  >
                    {current.reviewed ? 'Mark as new' : 'Mark reviewed'}
                  </button>
                  <button
                    onClick={() => void handleDelete(current)}
                    disabled={busy}
                    className="btn-danger min-h-10 px-4 text-[13px]"
                  >
                    Delete
                  </button>
                </div>
              </div>

              <dl className="m-0 grid grid-cols-[auto_1fr] items-baseline gap-x-[18px] gap-y-2 text-sm">
                <dt className="lbl">Email</dt>
                <dd className="m-0">
                  <a href={`mailto:${current.email}`} className="text-w2w-red-ink no-underline transition-[filter] hover:brightness-125">
                    {current.email}
                  </a>
                </dd>
                <dt className="lbl">iRacing ID</dt>
                <dd className="m-0 font-semibold text-ds-ink">{current.iracingId || 'Not given'}</dd>
              </dl>

              {current.message && (
                <p className="cut-sm m-0 whitespace-pre-wrap bg-ds-field px-[18px] py-4 leading-[1.6] text-ds-ink-soft">
                  {current.message}
                </p>
              )}

              <div className="flex flex-wrap gap-2.5">
                <a href={`mailto:${current.email}`} className="btn-primary">
                  Reply by email
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="square"
                    aria-hidden="true"
                  >
                    <path d="M5 12h13M13 6l6 6-6 6" />
                  </svg>
                </a>
                <Link to="/admin/members" className="btn-secondary">
                  Check members queue
                </Link>
              </div>
            </article>
          )}
        </div>
      )}
    </div>
  );
}
