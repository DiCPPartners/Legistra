export default function PrivacyPolicy() {
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
      window.location.href = '/?accept=privacy'
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
            <h1 className="text-3xl font-bold text-slate-800">Privacy Policy</h1>
            <p className="mt-2 text-sm text-slate-500">Ultimo aggiornamento: {new Date().toLocaleDateString('it-IT', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>

          <div className="prose prose-slate max-w-none space-y-6 text-sm leading-relaxed text-slate-700">
            <section>
              <h2 className="mb-3 text-xl font-semibold text-slate-800">1. Titolare del trattamento</h2>
              <p>
                Il titolare del trattamento è DiCP&Partners, Via Privata del Gonfalone 3, 20123 Milano (MI), P.IVA 14429940969, email info@dicp-partners.com.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-slate-800">2. Tipologie di dati trattati</h2>
              <p>Il Sito può raccogliere:</p>
              <ul className="ml-6 list-disc space-y-2">
                <li>dati anagrafici e di contatto (es. nome, email) tramite moduli di iscrizione;</li>
                <li>dati tecnici di navigazione (indirizzo IP, log, cookie tecnici).</li>
              </ul>
              <p className="mt-3">
                Il Sito non è destinato al trattamento di dati sanitari o sensibili.
              </p>
              <p className="mt-2">
                Gli utenti sono espressamente invitati a non inserire o trasmettere dati idonei a rivelare lo stato di salute, opinioni politiche, religiose o orientamento sessuale.
              </p>
              <p className="mt-2">
                In caso di invio volontario di tali dati, il trattamento sarà ritenuto non richiesto né autorizzato, e DiCP&Partners non potrà essere considerata responsabile del loro utilizzo.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-slate-800">3. Finalità e base giuridica del trattamento</h2>
              <p>I dati personali vengono trattati esclusivamente per:</p>
              <ul className="ml-6 list-disc space-y-2">
                <li>fornire accesso al servizio richiesto (base giuridica: art. 6, par. 1, lett. b, GDPR);</li>
                <li>gestire la sicurezza del Sito e gli aspetti tecnici di funzionamento (legittimo interesse del titolare, art. 6, par. 1, lett. f, GDPR);</li>
                <li>eventuali comunicazioni commerciali solo previo consenso espresso (art. 6, par. 1, lett. a, GDPR).</li>
              </ul>
              <p className="mt-3">
                I dati non sono utilizzati per processi decisionali automatizzati, inclusa la profilazione, ai sensi dell'art. 22 GDPR.
              </p>
              <p className="mt-3">
                Il Titolare adotta, ove tecnicamente possibile, misure di pseudonimizzazione e anonimizzazione dei dati per ridurre al minimo i rischi per i diritti e le libertà degli interessati.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-slate-800">4. Elaborazione di documenti caricati</h2>
              <p>
                Qualora l'utente carichi documenti per l'elaborazione tramite modelli di intelligenza artificiale:
              </p>
              <ul className="ml-6 list-disc space-y-2 mt-2">
                <li>i file vengono elaborati temporaneamente e non conservati oltre il tempo strettamente necessario alla generazione della risposta;</li>
                <li>i dati contenuti nei documenti non sono utilizzati per addestrare modelli o sistemi di machine learning;</li>
                <li>i contenuti dei documenti non sono condivisi con terze parti diverse dai fornitori tecnici necessari all'elaborazione.</li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-slate-800">5. Conservazione dei dati</h2>
              <p>
                I dati sono conservati per il tempo strettamente necessario all'erogazione del servizio o fino alla revoca del consenso.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-slate-800">6. Comunicazione dei dati e sub-responsabili</h2>
              <p>
                I dati possono essere comunicati a fornitori di servizi tecnici debitamente nominati responsabili del trattamento ex art. 28 GDPR, tra cui:
              </p>
              <ul className="ml-6 list-disc space-y-2 mt-2">
                <li><strong>Supabase:</strong> piattaforma cloud per hosting, database e autenticazione;</li>
                <li><strong>OpenAI:</strong> fornitore di servizi di intelligenza artificiale per l'elaborazione dei contenuti;</li>
                <li>altri fornitori di servizi tecnici necessari al funzionamento della piattaforma.</li>
              </ul>
              <p className="mt-3">
                Tutti i sub-responsabili sono selezionati in base alla loro conformità al GDPR e sono vincolati da accordi contrattuali che garantiscono adeguate misure di sicurezza e protezione dei dati.
              </p>
              <p className="mt-3">
                I dati non sono trasferiti al di fuori dello Spazio Economico Europeo, salvo i casi in cui il trattamento tramite fornitori terzi comporti trasferimenti verso Paesi terzi con adeguate garanzie ex artt. 44–49 GDPR (es. clausole contrattuali standard approvate dalla Commissione Europea).
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-slate-800">7. Diritti dell'interessato</h2>
              <p>
                L'utente può in ogni momento esercitare i diritti previsti dagli artt. 15–22 GDPR: accesso, rettifica, cancellazione, limitazione, portabilità, opposizione.
              </p>
              <p className="mt-2">
                Le richieste vanno inviate a info@dicp-partners.com.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-slate-800">8. Registro dei trattamenti e DPO</h2>
              <p>
                Il Titolare mantiene un registro dei trattamenti dei dati personali ai sensi dell'art. 30 GDPR, disponibile su richiesta all'indirizzo info@dicp-partners.com.
              </p>
              <p className="mt-2">
                Non è stato nominato un Data Protection Officer (DPO) poiché non ricorrono le condizioni di cui all'art. 37 GDPR.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-slate-800">9. Misure di sicurezza</h2>
              <p>
                Il Titolare adotta misure tecniche e organizzative idonee a garantire la sicurezza dei dati trattati e a prevenire accessi non autorizzati, perdita o uso illecito.
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

