import Link from 'next/link';
import { Pricing } from '@/components/landing/pricing';
import { t, tr } from '@/i18n';

interface Item { title: string; text: string }
const container = 'mx-auto max-w-6xl px-6';
const h2 = 'text-3xl font-bold tracking-tight';

function Section({ id, title, subtitle, children, tint }: { id: string; title: string; subtitle?: string; children: React.ReactNode; tint?: boolean }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={`scroll-mt-16 py-20 ${tint ? 'bg-white' : ''}`}>
      <div className={container}>
        <h2 id={`${id}-title`} className={`${h2} text-center`}>{title}</h2>
        {subtitle && <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600">{subtitle}</p>}
        {children}
      </div>
    </section>
  );
}

function VerticalCard({ id, title, text, points }: { id: string; title: string; text: string; points: string[] }) {
  return (
    <article id={id} className="scroll-mt-20 rounded-2xl border border-slate-200 bg-white p-8">
      <h3 className="text-xl font-semibold">{title}</h3>
      <p className="mt-3 text-slate-600">{text}</p>
      <ul className="mt-5 space-y-2 text-sm">
        {points.map((p) => <li key={p} className="flex gap-2"><span className="text-brand-600" aria-hidden>✓</span>{p}</li>)}
      </ul>
    </article>
  );
}

export default function Landing() {
  const steps = tr<Item[]>('landing.how.steps');
  const features = tr<Item[]>('landing.features.items');
  const faqs = tr<{ q: string; a: string }[]>('landing.faqSection.items');
  const hotels = tr<{ title: string; text: string; points: string[] }>('landing.hotels');
  const restos = tr<{ title: string; text: string; points: string[] }>('landing.restaurants');

  return (
    <>
      <a href="#contenu" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:rounded focus:bg-white focus:px-3 focus:py-2">Aller au contenu</a>
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className={`${container} flex h-16 items-center justify-between`}>
          <Link href="/" className="font-bold">WhatsApp Business Assistant</Link>
          <nav aria-label="Navigation principale" className="hidden items-center gap-6 text-sm md:flex">
            <a href="#comment-ca-marche" className="hover:text-brand-700">{t('landing.nav.how')}</a>
            <a href="#fonctionnalites" className="hover:text-brand-700">{t('landing.nav.features')}</a>
            <a href="#tarifs" className="hover:text-brand-700">{t('landing.nav.pricing')}</a>
            <a href="#faq" className="hover:text-brand-700">{t('landing.nav.faq')}</a>
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/login" className="font-medium hover:text-brand-700">{t('landing.nav.login')}</Link>
            <Link href="/register" className="hidden rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white hover:bg-brand-700 sm:block">{t('landing.ctaStart')}</Link>
          </div>
        </div>
      </header>

      <main id="contenu">
        <section className="py-20 sm:py-28" aria-labelledby="hero-title">
          <div className={`${container} grid items-center gap-12 lg:grid-cols-2`}>
            <div>
              <h1 id="hero-title" className="text-4xl font-bold tracking-tight sm:text-5xl">{t('landing.title')}</h1>
              <p className="mt-6 text-lg text-slate-600">{t('landing.subtitle')}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/register" className="rounded-lg bg-brand-600 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-700">{t('landing.ctaStart')}</Link>
                <a href="#demonstration" className="rounded-lg border border-slate-300 bg-white px-6 py-3 text-sm font-semibold hover:bg-slate-100">{t('landing.ctaDemo')}</a>
              </div>
              <p className="mt-3 text-sm text-slate-500">{t('landing.trialNote')}</p>
            </div>

            <figure id="demonstration" className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <figcaption className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400">{t('landing.demo.label')}</figcaption>
              <div className="space-y-3 text-sm">
                <div className="flex justify-start"><p className="max-w-[85%] rounded-2xl rounded-bl-sm bg-slate-100 px-4 py-2"><span className="sr-only">{t('landing.demo.customer')} : </span>{t('landing.demo.c1')}</p></div>
                <div className="flex justify-end"><p className="max-w-[85%] rounded-2xl rounded-br-sm bg-brand-600 px-4 py-2 text-white"><span className="sr-only">{t('landing.demo.assistant')} : </span>{t('landing.demo.a1')}</p></div>
                <div className="flex justify-start"><p className="max-w-[85%] rounded-2xl rounded-bl-sm bg-slate-100 px-4 py-2"><span className="sr-only">{t('landing.demo.customer')} : </span>{t('landing.demo.c2')}</p></div>
                <div className="flex justify-end"><p className="max-w-[85%] rounded-2xl rounded-br-sm bg-brand-600 px-4 py-2 text-white"><span className="sr-only">{t('landing.demo.assistant')} : </span>{t('landing.demo.a2')}</p></div>
              </div>
              <p className="mt-4 text-xs text-slate-500">{t('landing.demo.note')}</p>
            </figure>
          </div>
        </section>

        <Section id="comment-ca-marche" title={t('landing.how.title')} tint>
          <ol className="mt-12 grid gap-8 md:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s.title} className="rounded-2xl border border-slate-200 p-6">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 font-bold text-brand-700">{i + 1}</span>
                <h3 className="mt-4 font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{s.text}</p>
              </li>
            ))}
          </ol>
        </Section>

        <Section id="fonctionnalites" title={t('landing.features.title')}>
          <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <li key={f.title} className="rounded-2xl border border-slate-200 bg-white p-6">
                <h3 className="font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{f.text}</p>
              </li>
            ))}
          </ul>
        </Section>

        <section className="pb-20" aria-label="Secteurs">
          <div className={`${container} grid gap-6 md:grid-cols-2`}>
            <VerticalCard id="hotels" {...hotels} />
            <VerticalCard id="restaurants" {...restos} />
          </div>
        </section>

        <Section id="tarifs" title={t('landing.pricing.title')} subtitle={t('landing.pricing.subtitle')} tint>
          <Pricing />
        </Section>

        <Section id="faq" title={t('landing.faqSection.title')}>
          <div className="mx-auto mt-10 max-w-3xl divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
            {faqs.map((f) => (
              <details key={f.q} className="group p-5">
                <summary className="flex cursor-pointer list-none items-center justify-between font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                  {f.q}<span aria-hidden className="ml-4 text-slate-400 transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm text-slate-600">{f.a}</p>
              </details>
            ))}
          </div>
        </Section>

        <section className="bg-slate-900 py-20 text-center text-white" aria-labelledby="final-title">
          <div className={container}>
            <h2 id="final-title" className={h2}>{t('landing.final.title')}</h2>
            <p className="mt-3 text-slate-300">{t('landing.final.text')}</p>
            <Link href="/register" className="mt-8 inline-block rounded-lg bg-brand-500 px-7 py-3 text-sm font-semibold text-white hover:bg-brand-600">{t('landing.ctaStart')}</Link>
            <p className="mt-3 text-sm text-slate-400">{t('landing.trialNote')}</p>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white py-10 text-sm text-slate-500">
        <div className={`${container} flex flex-col items-center justify-between gap-3 sm:flex-row`}>
          <p>{t('landing.footer.tagline')}</p>
          <p>© {new Date().getFullYear()} WhatsApp Business Assistant. {t('landing.footer.rights')}</p>
        </div>
      </footer>
    </>
  );
}
