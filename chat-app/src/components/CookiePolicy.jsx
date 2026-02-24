export default function CookiePolicy() {
  const params = new URLSearchParams(window.location.search)
  const fromSignup = params.get('from') === 'signup'
  const policy = params.get('policy')

  const handleBack = () => {
    if (fromSignup) {
      window.location.href = '/'
    } else {
      window.location.href = '/'
    }
  }

  const handleAccept = () => {
    if (fromSignup) {
      window.location.href = '/?accept=cookies'
    } else {
      window.location.href = '/'
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-[#f4f6fb] to-[#e8edf7] px-4 py-12">
      <div className="mx-auto max-w-4xl">
        <div className="rounded-3xl border border-slate-200 bg-white/95 p-8 shadow-[0_25px_80px_rgba(148,163,184,0.3)] backdrop-blur md:p-12">
          <div className="mb-8">
            <button
              type="button"
              onClick={handleBack}
              className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-[#3d9fae] transition hover:text-[#21707a]"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Torna indietro
            </button>
            <h1 className="text-3xl font-bold text-slate-800">Cookie Policy</h1>
            <p className="mt-2 text-sm text-slate-500">Ultimo aggiornamento: {new Date().toLocaleDateString('it-IT', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>

          <div className="prose prose-slate max-w-none space-y-6 text-sm leading-relaxed text-slate-700">
            <section>
              <h2 className="mb-3 text-xl font-semibold text-slate-800">1. Cosa sono i cookie</h2>
              <p>
                I cookie sono piccoli file di testo che i siti visitati inviano al dispositivo dell'utente per migliorarne l'esperienza di navigazione.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-slate-800">2. Tipologie di cookie utilizzati</h2>
              <p>
                Il Sito utilizza solo cookie tecnici e di sessione, necessari al corretto funzionamento della piattaforma (es. autenticazione utente, gestione preferenze).
              </p>
              <p className="mt-2">
                Non vengono utilizzati cookie di profilazione o marketing.
              </p>
              <p className="mt-3">
                Qualora vengano utilizzati cookie analitici anonimi (es. Plausible, Matomo o simili), questi sono configurati in modalità anonima e non consentono l'identificazione degli utenti.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-slate-800">3. Cookie di terze parti</h2>
              <p>
                Possono essere presenti cookie di terze parti connessi ai servizi tecnici utilizzati (es. Supabase, Stripe), necessari al funzionamento della piattaforma.
              </p>
              <p className="mt-2">
                Le relative informative sono disponibili sui siti ufficiali dei rispettivi fornitori.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-slate-800">4. Gestione dei cookie</h2>
              <p>
                Poiché il Sito non utilizza cookie di profilazione, non è richiesto il consenso preventivo tramite banner.
              </p>
              <p className="mt-2">
                L'utente può in ogni caso gestire o eliminare i cookie tramite le impostazioni del proprio browser.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-slate-800">5. Gestione dei dati raccolti tramite cookie</h2>
              <p>
                Per informazioni dettagliate sul trattamento dei dati personali raccolti tramite cookie tecnici, si rinvia alla{' '}
                <a href="/privacy-policy" className="font-semibold text-[#3d9fae] underline-offset-4 hover:text-[#21707a]">
                  Privacy Policy
                </a>.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-slate-800">6. Aggiornamenti</h2>
              <p>
                La presente Cookie Policy può essere aggiornata in qualsiasi momento; le modifiche saranno pubblicate su questa pagina con data di revisione aggiornata.
              </p>
            </section>
          </div>

          <div className="mt-8 border-t border-slate-200 pt-6">
            <button
              type="button"
              onClick={handleAccept}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#8C2B42] via-[#A5435A] to-[#B85468] px-6 py-3 text-sm font-semibold text-white shadow-[0_14px_32px_rgba(72,209,181,0.4)] transition hover:scale-[1.01] hover:shadow-[0_20px_45px_rgba(72,209,181,0.5)]"
            >
              {fromSignup ? 'Accetto' : 'Torna alla home'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

