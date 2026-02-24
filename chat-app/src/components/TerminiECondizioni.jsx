export default function TerminiECondizioni() {
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
      window.location.href = '/?accept=terms'
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
            <h1 className="text-3xl font-bold text-slate-800">Termini e Condizioni d'Uso</h1>
            <p className="mt-2 text-sm text-slate-500">Ultimo aggiornamento: {new Date().toLocaleDateString('it-IT', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>

          <div className="prose prose-slate max-w-none space-y-6 text-sm leading-relaxed text-slate-700">
            <section>
              <h2 className="mb-3 text-xl font-semibold text-slate-800">1. Titolare del Sito</h2>
              <p>
                Il presente sito web www.dicp-partners.com (di seguito "Sito") è di proprietà di DiCP&Partners, con sede legale in Via Privata del Gonfalone 3, 20123 Milano (MI), P.IVA 14429940969, email di contatto info@dicp-partners.com (di seguito "Titolare").
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-slate-800">2. Oggetto</h2>
              <p>
                Il Sito offre agli utenti l'accesso a una piattaforma di automazione e intelligenza artificiale per l'elaborazione di pareri informativi in ambito legale e sviluppo software personalizzato.
              </p>
              <p className="mt-2">
                Il servizio fornito ha esclusivamente finalità informative e di supporto tecnologico e non costituisce in alcun modo consulenza legale vincolante, parere professionale o rappresentanza in giudizio.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-slate-800">3. Limitazione di responsabilità</h2>
              <p className="mb-3 font-semibold text-slate-800">
                AI Disclosure: Il contenuto generato è prodotto da un sistema automatizzato di intelligenza artificiale e non da un professionista umano.
              </p>
              <ul className="ml-6 list-disc space-y-2">
                <li>Le informazioni generate dall'intelligenza artificiale sono automatiche e non verificate da un professionista legale.</li>
                <li>L'elaborazione può contenere errori o bias e nessuna decisione legale, processuale o contrattuale deve essere basata su tali risultati.</li>
                <li>DiCP&Partners non assume alcuna responsabilità per decisioni, comportamenti o azioni intraprese dagli utenti sulla base delle informazioni fornite dal Sito.</li>
                <li>Il servizio non sostituisce in alcun modo il parere di un avvocato qualificato. L'utente è invitato a rivolgersi sempre a professionisti legali abilitati per consulenza o rappresentanza.</li>
                <li>Le risposte generate dal sistema possono variare nel tempo a seguito di aggiornamenti del modello di intelligenza artificiale e non rappresentano verità clinica o giuridica assoluta.</li>
              </ul>
              <p className="mt-4">
                Le informazioni di natura giuridica o legale fornite dal sistema non devono essere interpretate come pareri legali vincolanti.
              </p>
              <p className="mt-2">
                L'utente deve sempre consultare un avvocato o un professionista legale abilitato per qualsiasi decisione giuridica.
              </p>
              <p className="mt-2">
                Non inviare né condividere informazioni che possano identificare persone terze o rivelare dati sensibili senza autorizzazione.
              </p>
              <p className="mt-4 font-semibold">
                DiCP&Partners e i suoi affiliati non saranno responsabili per perdite, danni o conseguenze derivanti dall'affidamento, totale o parziale, sui contenuti generati dai modelli di intelligenza artificiale.
              </p>
              <p className="mt-3">
                Il servizio utilizza tecnologie di intelligenza artificiale fornite da terze parti (inclusa, a titolo esemplificativo, OpenAI API). Il Titolare non è responsabile del funzionamento, della disponibilità o della qualità dei servizi forniti da tali terze parti, né per eventuali interruzioni, errori o limitazioni derivanti dall'utilizzo di tali servizi.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-slate-800">4. Uso vietato del servizio</h2>
              <p>Il Sito non è progettato né inteso per il trattamento di dati personali di natura sanitaria o sensibile.</p>
              <p className="mt-2">
                È vietato inserire o caricare sul Sito dati personali sensibili di terzi senza autorizzazione.
              </p>
              <p className="mt-2">
                In caso di caricamento accidentale di dati sensibili non autorizzati, tali contenuti vengono eliminati automaticamente e non sono oggetto di trattamento ulteriore, ai sensi dell'art. 17 GDPR (diritto alla cancellazione).
              </p>
              <p className="mt-2">
                L'eventuale invio di tali dati avviene sotto la piena responsabilità dell'utente, esonerando il Titolare da qualsiasi responsabilità o obbligo di trattamento ai sensi dell'art. 9 GDPR.
              </p>
              <p className="mt-3">
                L'uso del Sito è consentito solo a utenti maggiorenni o con autorizzazione del tutore legale.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-slate-800">5. Registrazione e accesso</h2>
              <p>L'utente può registrarsi o accedere a un'area riservata del Sito.</p>
              <p className="mt-2">
                Le credenziali di accesso sono personali e non cedibili. L'utente si impegna a mantenerle riservate e a non consentirne l'uso da parte di terzi.
              </p>
              <p className="mt-3">
                L'utente si impegna a manlevare e tenere indenne DiCP&Partners da qualsiasi pretesa, danno o richiesta di risarcimento derivante da uso improprio del servizio.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-slate-800">6. Corrispettivi e pagamenti</h2>
              <p>
                Il pagamento dei servizi acquistati tramite il Sito avviene mediante Stripe o altri metodi di pagamento indicati.
              </p>
              <p className="mt-2">
                Tutti i pagamenti sono gestiti da piattaforme terze conformi agli standard di sicurezza PCI-DSS; il Titolare non conserva dati relativi alle carte di pagamento.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-slate-800">7. Diritto di recesso</h2>
              <p>
                Trattandosi di servizi digitali personalizzati e immediatamente usufruibili, ai sensi dell'art. 59 lett. a) e o) del Codice del Consumo, il diritto di recesso non si applica una volta iniziata l'erogazione del servizio.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-slate-800">8. Esclusione dell'obbligo di sorveglianza</h2>
              <p>
                Ai sensi dell'art. 17 del D.Lgs. 70/2003, il Titolare non è tenuto a controllare le informazioni memorizzate o trasmesse dagli utenti, salvo obblighi di legge o ordini dell'autorità competente.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-slate-800">9. Limitazione d'uso a fini di ricerca</h2>
              <p>
                Il servizio può essere utilizzato a fini di ricerca o sperimentazione, fermo restando che l'utente riconosce e accetta che la piattaforma può essere in fase di sviluppo e che le funzionalità possono essere modificate o sospese senza preavviso.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-slate-800">10. Proprietà intellettuale</h2>
              <p>
                Tutti i contenuti del Sito (testi, codice, grafica, marchi, software) sono di proprietà di DiCP&Partners o dei rispettivi titolari e sono protetti dalla normativa sul diritto d'autore e sui segni distintivi.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-slate-800">11. Foro competente</h2>
              <p>Le presenti condizioni sono regolate dalla legge italiana.</p>
              <p className="mt-2">Per ogni controversia è competente in via esclusiva il Foro di Milano.</p>
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

