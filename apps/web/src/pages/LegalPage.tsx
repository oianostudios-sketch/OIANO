import { Link, Navigate, useParams } from 'react-router-dom';

const documents: Record<string, { title: string; notice?: string; sections: Array<[string,string]> }> = {
  terms: { title: 'Terms of Service', notice: 'Counsel-review draft — not effective until OIANO publishes an effective date and legal entity.', sections: [
    ['The service','OIANO provides technology for studio discovery, bookings, projects, communication, payments and professional records. OIANO is not a label, publisher, collecting society, employer or law firm unless a separate signed agreement says otherwise.'],
    ['Your account','Provide accurate information, protect your credentials and use only permissions and accounts you control. Unlawful, infringing, abusive or technically harmful activity is prohibited.'],
    ['Your work','You retain ownership of your content and grant OIANO only the limited permission required to host, process and share it according to the actions and permissions you select.'],
    ['Bookings and payments','Bookings are with the identified studio and use the price, cancellation terms and fees shown before confirmation. Studios remain responsible for facilities, personnel, safety and service quality.'],
    ['Credits and rights','Credits record contribution; they do not transfer ownership. Rights records preserve authenticated decisions but do not replace independent legal advice.'],
  ]},
  privacy: { title: 'Privacy Policy', notice: 'Counsel-review draft — controller identity and jurisdiction disclosures must be completed before launch.', sections: [
    ['Data we use','Account and profile details, bookings, projects, messages, contribution and rights records, payment references, security/audit information and support communications.'],
    ['Why we use it','To operate accounts and permissions, fulfil bookings, process payments, coordinate projects, secure OIANO, support users and meet legal obligations.'],
    ['Sharing and retention','Information is shared with authorized project/studio participants and contracted infrastructure/payment providers. OIANO does not sell personal data. Retention depends on operational, financial, rights and legal requirements.'],
    ['Your choices','Request access, correction, export or deletion through privacy@oiano.net. OIANO verifies identity and may retain records required for fraud, payment, rights disputes or law.'],
  ]},
  cancellations: { title: 'Cancellation and Refund Policy', notice: 'Business-approval draft — the exact studio rule shown at checkout controls.', sections: [
    ['Recommended pilot rule','Full refund at least 48 hours before the session; 50% from 24–48 hours; no automatic refund within 24 hours. A studio cancellation receives a full refund. Consumer rights override this rule.'],
    ['How refunds work','Refunds return to the original payment method where possible. Wallet-funded refunds return through a recorded wallet transaction. Provider processing times vary.'],
    ['Evidence','Every refund must identify its booking, payment, reason and approving identity, and must create a balanced financial reversal.'],
  ]},
  rights: { title: 'Rights and Credits Notice', sections: [
    ['Contribution','An accepted invitation documents a project role.'],['Credit','A confirmed credit documents contribution but does not transfer copyright, master ownership or publishing rights.'],['Consent','Promotional consent applies only to its stated purpose, assets, channels and duration.'],['Ownership','An OIANO rights proposal becomes effective only after every identity-bound holder approves their named share. OIANO preserves evidence but does not determine legal correctness or replace legal advice.'],
  ]},
};

export default function LegalPage() {
  const { document = '' } = useParams();
  const item = documents[document];
  if (!item) return <Navigate to="/legal/terms" replace/>;
  return <main className="min-h-screen bg-[#070809] px-5 py-12 text-zinc-200"><article className="mx-auto max-w-3xl"><Link to="/enter" className="text-xs text-[#5A9BCB]">← OIANO</Link><p className="mt-10 text-[9px] font-mono uppercase tracking-[.24em] text-[#C9A84C]">OIANO policy</p><h1 className="mt-3 text-4xl font-semibold text-white">{item.title}</h1>{item.notice&&<p role="note" className="mt-5 rounded-xl border border-amber-300/15 bg-amber-300/[.04] p-4 text-xs leading-5 text-amber-200/70">{item.notice}</p>}<div className="mt-10 space-y-8">{item.sections.map(([heading,body])=><section key={heading}><h2 className="text-lg font-medium text-white">{heading}</h2><p className="mt-3 text-sm leading-7 text-zinc-500">{body}</p></section>)}</div><nav aria-label="Legal documents" className="mt-12 flex flex-wrap gap-3 border-t border-white/[.06] pt-6 text-xs">{Object.entries(documents).map(([key,value])=><Link key={key} to={`/legal/${key}`} className={key===document?'text-[#C9A84C]':'text-zinc-600'}>{value.title}</Link>)}</nav></article></main>;
}
