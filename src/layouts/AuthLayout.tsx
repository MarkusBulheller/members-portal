import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-w2w-black flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-8">
          <span className="font-display font-black text-2xl tracking-widest text-w2w-white">
            W2<span className="text-w2w-red">W</span>
          </span>
          <span className="h-5 w-px bg-white/20" />
          <span className="font-heading text-xs tracking-[0.3em] text-white/65 uppercase">Members</span>
        </div>
        <div className="bg-w2w-charcoal border border-white/10 clip-corner p-8">{children}</div>
      </div>
    </div>
  );
}
