import { useEffect, useState } from 'react';
import { useConfirm } from '../../context/ConfirmContext';
import { contactInquiriesApi } from '../../lib/api/contactInquiries';
import type { ContactInquiry } from '../../types/contactInquiry';

export default function ContactInquiriesAdminPage() {
  const confirm = useConfirm();
  const [inquiries, setInquiries] = useState<ContactInquiry[] | null>(null);
  const [busy, setBusy] = useState(false);

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

  const unreviewedCount = (inquiries ?? []).filter((i) => !i.reviewed).length;

  return (
    <div>
      <p className="font-heading text-xs tracking-[0.3em] text-w2w-red uppercase mb-2">Admin</p>
      <h1 className="font-display font-black text-3xl uppercase text-w2w-white mb-2">Contact Inquiries</h1>
      <p className="text-white/65 text-sm mb-8">
        Submissions from the "Join the Grid" form on the public marketing site.
        {unreviewedCount > 0 && <span className="text-w2w-red"> {unreviewedCount} unreviewed.</span>}
      </p>

      {inquiries === null ? (
        <p className="text-white/65 text-sm">Loading...</p>
      ) : inquiries.length === 0 ? (
        <p className="text-white/65 text-sm">No inquiries yet.</p>
      ) : (
        <div className="space-y-3">
          {inquiries.map((inquiry) => (
            <div
              key={inquiry.id}
              className={`bg-w2w-charcoal border px-5 py-4 ${inquiry.reviewed ? 'border-white/10 opacity-60' : 'border-w2w-red/30'}`}
            >
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-heading font-semibold text-white text-sm">{inquiry.name}</p>
                    <span className="px-2 py-0.5 text-[10px] font-heading uppercase tracking-wide bg-white/5 text-white/65">
                      {inquiry.interestedIn}
                    </span>
                    {!inquiry.reviewed && (
                      <span className="px-2 py-0.5 text-[10px] font-heading uppercase tracking-wide bg-w2w-red/15 text-w2w-red">
                        New
                      </span>
                    )}
                  </div>
                  <p className="text-white/65 text-xs mt-1">
                    <a href={`mailto:${inquiry.email}`} className="hover:text-white">
                      {inquiry.email}
                    </a>
                    {inquiry.iracingId && <span> · iRacing ID: {inquiry.iracingId}</span>}
                  </p>
                  <p className="text-white/40 text-[11px] mt-1">
                    {new Date(inquiry.createdAt).toLocaleString(undefined, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => void handleToggleReviewed(inquiry)}
                    disabled={busy}
                    className="px-3 py-1.5 border border-white/20 text-white/60 hover:text-white hover:border-white/40 disabled:opacity-50 font-heading text-[11px] uppercase tracking-wide transition-colors"
                  >
                    {inquiry.reviewed ? 'Mark Unreviewed' : 'Mark Reviewed'}
                  </button>
                  <button
                    onClick={() => void handleDelete(inquiry)}
                    disabled={busy}
                    className="px-3 py-1.5 border border-w2w-red/40 text-w2w-red hover:bg-w2w-red/10 disabled:opacity-50 font-heading text-[11px] uppercase tracking-wide transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
              {inquiry.message && <p className="mt-3 text-white/70 text-sm leading-relaxed max-w-2xl">{inquiry.message}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
