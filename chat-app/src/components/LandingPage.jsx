import { useState, useEffect } from 'react'
import AuthLayout from './AuthLayout'
import Logo from './Logo'

// Frasi che scorrono
const ROTATING_WORDS = ['Trascrizioni', 'Cronologie', 'Analisi', 'Pareri', 'Sintesi']

// Icone SVG
const Icons = {
  eye: (
    <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  sparkle: (
    <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
    </svg>
  ),
  pencil: (
    <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
    </svg>
  ),
  scale: (
    <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 01-2.031.352 5.988 5.988 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.97zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.97z" />
    </svg>
  ),
  hospital: (
    <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" />
    </svg>
  ),
  shield: (
    <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  ),
  building: (
    <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
    </svg>
  ),
  document: (
    <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  ),
  lock: (
    <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
    </svg>
  ),
  globe: (
    <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
    </svg>
  ),
  trash: (
    <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  ),
}



// Sicurezza
const SECURITY_FEATURES = [
  { icon: Icons.lock, title: 'Crittografia End-to-End', desc: 'Tutti i dati sono crittografati in transito e a riposo' },
  { icon: Icons.globe, title: 'GDPR Compliant', desc: 'Piena conformità con le normative europee sulla privacy' },
  { icon: Icons.trash, title: 'Cancellazione Automatica', desc: 'I documenti vengono eliminati dopo 7 giorni' },
]

// Cosa puoi fare
const CAPABILITIES = [
  'Estrarre dati rilevanti da fascicoli processuali',
  'Ricostruire cronologie processuali complete',
  'Identificare profili di responsabilità e criticità',
  'Analizzare contratti e clausole contrattuali',
  'Generare pareri legali strutturati',
  'Analizzare atti giudiziari e provvedimenti',
  'Cercare nella giurisprudenza e nella dottrina',
  'Generare memo legali in stile professionale',
]

export default function LandingPage() {
  const [showAuth, setShowAuth] = useState(false)
  const [wordIndex, setWordIndex] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)

  useEffect(() => {
    const interval = setInterval(() => {
      setIsAnimating(true)
      setTimeout(() => {
        setWordIndex((prev) => (prev + 1) % ROTATING_WORDS.length)
        setIsAnimating(false)
      }, 200)
    }, 2500)
    return () => clearInterval(interval)
  }, [])

  if (showAuth) {
    return <AuthLayout onBack={() => setShowAuth(false)} />
  }

  return (
    <div className="min-h-screen text-slate-900 overflow-hidden">
      {/* Sfondo identico a AuthLayout */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-white via-slate-50/30 to-white" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_50%,rgba(47,154,167,0.06),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_50%,rgba(62,184,168,0.04),transparent_50%)]" />
        <svg className="absolute inset-0 h-full w-full opacity-[0.02]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="landing-grid" width="50" height="50" patternUnits="userSpaceOnUse">
              <path d="M 50 0 L 0 0 0 50" fill="none" stroke="currentColor" strokeWidth="1"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#landing-grid)" />
        </svg>
      </div>

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-lg border-b border-slate-200 shadow-[0_4px_20px_rgba(0,0,0,0.08)]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <span className="text-xl font-black text-black" style={{ fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif', fontSize: '40px', fontWeight: '900', backgroundClip: 'unset', WebkitBackgroundClip: 'unset', color: 'rgba(0, 0, 0, 1)' }}>Legistra</span>
          </div>
          <button
            onClick={() => setShowAuth(true)}
            className="w-[150px] h-[50px] rounded-full bg-gradient-to-r from-[#2f9aa7] to-[#3eb8a8] px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#2f9aa7]/25 transition-all hover:shadow-xl hover:scale-105"
          >
            Accedi
          </button>
        </div>
      </header>

      {/* Hero */}
      <section className="relative min-h-screen flex items-center justify-center px-5 py-16 border border-black" style={{ background: 'linear-gradient(135deg, rgba(255, 255, 255, 1) 0%, rgba(248, 250, 252, 0.5) 50%, rgba(255, 255, 255, 1) 100%)' }}>
        <div className="max-w-6xl mx-auto px-5 pt-24 pb-16 text-center relative z-10">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full bg-white border border-slate-200 px-4 py-2 mb-8 shadow-[0_4px_20px_rgba(0,0,0,0.1)]">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#2f9aa7] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#2f9aa7]"></span>
            </span>
            <span className="text-sm text-[#2f9aa7] font-medium">Intelligenza artificiale per professionisti legali</span>
          </div>

          {/* Main headline */}
          <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-tight mb-6">
            <span className="text-slate-900">Genera</span>
            <br />
            <span 
              className={`inline-block bg-gradient-to-r from-[#2f9aa7] via-[#3eb8a8] to-[#2f9aa7] bg-clip-text text-transparent transition-all duration-200 ${
                isAnimating ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'
              }`}
            >
              {ROTATING_WORDS[wordIndex]}
            </span>
            <br />
            <span className="text-slate-900">in Secondi</span>
          </h1>

          {/* Subtitle */}
          <p className="text-lg sm:text-xl text-neutral-900 max-w-3xl mx-auto mb-10 leading-relaxed">
            L'assistente AI progettato per <strong>avvocati</strong>. 
            Carica documenti legali, ottieni analisi professionali istantanee.
          </p>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
            <button
              onClick={() => setShowAuth(true)}
              className="group relative w-full sm:w-auto overflow-hidden rounded-full bg-gradient-to-r from-[#2f9aa7] to-[#3eb8a8] px-8 py-4 text-base font-semibold text-white shadow-[0_8px_30px_rgba(47,154,167,0.4)] transition-all hover:shadow-[0_12px_40px_rgba(47,154,167,0.5)] hover:scale-105"
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                Prova Gratis
                <svg className="h-5 w-5 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-[#3eb8a8] to-[#2f9aa7] opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
            <button
              onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
              className="w-full sm:w-auto rounded-full border-2 border-slate-200 bg-white px-8 py-4 text-base font-semibold text-slate-700 shadow-[0_4px_20px_rgba(0,0,0,0.1)] transition-all hover:border-[#2f9aa7] hover:text-[#2f9aa7] hover:shadow-[0_8px_30px_rgba(0,0,0,0.15)]"
            >
              Scopri le funzionalità
            </button>
          </div>

          {/* Stats */}
          <div className="inline-flex items-center gap-6 sm:gap-10 rounded-2xl bg-white border border-slate-200 px-8 py-5 shadow-[0_8px_40px_rgba(0,0,0,0.12)]">
            <div className="text-center">
              <div className="text-2xl sm:text-3xl font-bold text-[#2f9aa7]">3</div>
              <div className="text-xs text-slate-500 uppercase tracking-wider mt-1">AI Models</div>
            </div>
            <div className="h-10 w-px bg-slate-200" />
            <div className="text-center">
              <div className="text-2xl sm:text-3xl font-bold text-[#2f9aa7]">99.7%</div>
              <div className="text-xs text-slate-500 uppercase tracking-wider mt-1">Accuratezza</div>
            </div>
            <div className="h-10 w-px bg-slate-200" />
            <div className="text-center">
              <div className="text-2xl sm:text-3xl font-bold text-[#2f9aa7]">&lt;30s</div>
              <div className="text-xs text-slate-500 uppercase tracking-wider mt-1">Per Analisi</div>
            </div>
          </div>
        </div>
      </section>

      {/* Come Funziona - Istruzioni */}
      <section className="relative px-6 py-24 lg:px-8 bg-white">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="text-center mb-16">
            <span className="inline-block px-4 py-2 rounded-full bg-[#2f9aa7]/10 text-[#2f9aa7] text-sm font-semibold mb-4">
              Guida all'utilizzo
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 mb-4">
              Come funziona Legistra
            </h2>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto">
              Cinque passaggi per ottenere il massimo dalla piattaforma
            </p>
          </div>

          {/* Step 1 */}
          <div className="mb-16">
            <div className="flex items-start gap-6 p-8 rounded-3xl bg-gradient-to-r from-slate-50 to-white border-2 border-slate-200 shadow-lg">
              <div className="flex-shrink-0 w-20 h-20 rounded-2xl bg-gradient-to-br from-[#2f9aa7] to-[#3eb8a8] flex items-center justify-center text-white text-3xl font-bold shadow-lg">
                1
              </div>
              <div className="flex-1">
                <h3 className="text-2xl font-bold text-slate-900 mb-3">Carica la documentazione</h3>
                <p className="text-lg text-slate-600 mb-4 leading-relaxed">
                  Per iniziare, inserisci i documenti del caso: atti giudiziari, contratti, sentenze o qualsiasi altro documento legale. Sono disponibili due modalita:
                </p>
                
                {/* Due metodi di caricamento */}
                <div className="grid sm:grid-cols-2 gap-4 mb-4">
                  {/* Metodo 1: Pulsante + */}
                  <div className="p-5 rounded-xl bg-slate-100 border-2 border-slate-300">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 rounded-xl bg-[#2f9aa7] flex items-center justify-center text-white text-2xl font-bold shadow-md">
                        +
                      </div>
                      <span className="text-lg font-bold text-slate-900">Pulsante "+"</span>
                    </div>
                    <p className="text-slate-600">Nella barra in basso, premere il pulsante <strong>"+"</strong> per selezionare i file dal proprio dispositivo.</p>
                  </div>
                  
                  {/* Metodo 2: Drag & Drop */}
                  <div className="p-5 rounded-xl bg-[#2f9aa7]/10 border-2 border-[#2f9aa7]/30 border-dashed">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 rounded-xl bg-[#2f9aa7] flex items-center justify-center shadow-md">
                        <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                        </svg>
                      </div>
                      <span className="text-lg font-bold text-slate-900">Trascinamento diretto</span>
                    </div>
                    <p className="text-slate-600">In alternativa, trascinare i file PDF direttamente nella finestra della chat.</p>
                  </div>
                </div>

                {/* Illustrazione Drop Zone */}
                <div className="relative p-6 rounded-2xl bg-gradient-to-br from-[#2f9aa7]/5 to-[#3eb8a8]/5 border-2 border-dashed border-[#2f9aa7]/40">
                  <div className="flex items-center justify-center gap-6">
                    {/* Icona file che viene trascinato */}
                    <div className="relative">
                      <div className="w-16 h-20 rounded-lg bg-white border-2 border-slate-300 shadow-lg flex flex-col items-center justify-center">
                        <svg className="h-8 w-8 text-red-500" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 2l5 5h-5V4zm-3 9h4v2h-4v-2zm0 4h4v2h-4v-2zm-2-4h.01v2H8v-2zm0 4h.01v2H8v-2z"/>
                        </svg>
                        <span className="text-[10px] text-slate-500 mt-1">PDF</span>
                      </div>
                      {/* Animazione freccia */}
                      <div className="absolute -right-4 top-1/2 -translate-y-1/2">
                        <svg className="h-8 w-8 text-[#2f9aa7] animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                      </div>
                    </div>
                    
                    {/* Drop zone simulata */}
                    <div className="w-48 h-24 rounded-xl border-2 border-dashed border-[#2f9aa7] bg-white flex flex-col items-center justify-center">
                      <svg className="h-10 w-10 text-[#2f9aa7] mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3" />
                      </svg>
                      <span className="text-sm font-medium text-[#2f9aa7]">Rilascia qui</span>
                    </div>
                  </div>
                  <p className="text-center text-[#2f9aa7] font-medium mt-4 text-lg">
                    I file vengono elaborati automaticamente dopo il caricamento.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Step 2 */}
          <div className="mb-16">
            <div className="flex items-start gap-6 p-8 rounded-3xl bg-gradient-to-r from-slate-50 to-white border-2 border-slate-200 shadow-lg">
              <div className="flex-shrink-0 w-20 h-20 rounded-2xl bg-gradient-to-br from-[#2f9aa7] to-[#3eb8a8] flex items-center justify-center text-white text-3xl font-bold shadow-lg">
                2
              </div>
              <div className="flex-1">
                <h3 className="text-2xl font-bold text-slate-900 mb-3">Seleziona l'elaborazione</h3>
                <p className="text-lg text-slate-600 mb-4 leading-relaxed">
                  Dopo il caricamento, premere <strong>"Azioni AI"</strong> per scegliere il tipo di elaborazione desiderata:
                </p>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-blue-50 border border-blue-200">
                    <div className="w-10 h-10 rounded-lg bg-[#3b82f6] flex items-center justify-center">
                      <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3a3 3 0 00-3 3v5a3 3 0 006 0V6a3 3 0 00-3-3z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 11v1a7 7 0 01-14 0v-1M12 19v2" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">Trascrizione</p>
                      <p className="text-sm text-slate-500">Estrazione del testo dai documenti</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-green-50 border border-green-200">
                    <div className="w-10 h-10 rounded-lg bg-[#10b981] flex items-center justify-center">
                      <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">Analisi Giuridica</p>
                      <p className="text-sm text-slate-500">Analisi giuridica completa</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-orange-50 border border-orange-200">
                    <div className="w-10 h-10 rounded-lg bg-[#f59e0b] flex items-center justify-center">
                      <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">Cronologia Processuale</p>
                      <p className="text-sm text-slate-500">Ricostruzione temporale degli eventi</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-purple-50 border border-purple-200">
                    <div className="w-10 h-10 rounded-lg bg-[#8b5cf6] flex items-center justify-center">
                      <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">Coerenza Documentale</p>
                      <p className="text-sm text-slate-500">Verifica delle incongruenze</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200">
                    <div className="w-10 h-10 rounded-lg bg-[#ef4444] flex items-center justify-center">
                      <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">Resp. Professionale</p>
                      <p className="text-sm text-slate-500">Valutazione aderenza agli standard</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Step 3 - EMULAZIONE (evidenziato) */}
          <div className="mb-16">
            <div className="relative flex items-start gap-6 p-8 rounded-3xl bg-gradient-to-r from-[#2f9aa7]/10 to-[#3eb8a8]/10 border-2 border-[#2f9aa7] shadow-xl">
              {/* Badge speciale */}
              <div className="absolute -top-4 left-8 px-4 py-1 rounded-full bg-[#2f9aa7] text-white text-sm font-bold shadow-lg">
                ⭐ FUNZIONE SPECIALE
              </div>
              <div className="flex-shrink-0 w-20 h-20 rounded-2xl bg-gradient-to-br from-[#2f9aa7] to-[#3eb8a8] flex items-center justify-center text-white text-3xl font-bold shadow-lg">
                3
              </div>
              <div className="flex-1 pt-2">
                <h3 className="text-2xl font-bold text-slate-900 mb-3">Genera documenti nel tuo stile</h3>
                <p className="text-lg text-slate-600 mb-6 leading-relaxed">
                  La funzione principale di Legistra: l'intelligenza artificiale apprende il vostro stile di scrittura e genera nuovi documenti indistinguibili dai vostri.
                </p>
                
                {/* Sub-steps per emulazione */}
                <div className="space-y-4 mb-6">
                  <div className="flex items-start gap-4 p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[#2f9aa7] flex items-center justify-center text-white font-bold">
                      A
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 mb-1">Accedere alla sezione Templates</p>
                      <p className="text-slate-600">Nel menu a sinistra, selezionare <strong>"Templates"</strong>. Questa sezione consente di caricare i propri documenti di riferimento.</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-4 p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[#2f9aa7] flex items-center justify-center text-white font-bold">
                      B
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 mb-1">Caricare un documento di esempio</p>
                      <p className="text-slate-600">Selezionare una categoria (ad esempio "Diritto Civile" o "Diritto Penale") e caricare un PDF di un proprio parere precedente. Il sistema analizzerà struttura, linguaggio e stile.</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-4 p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[#2f9aa7] flex items-center justify-center text-white font-bold">
                      C
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 mb-1">Generare il documento</p>
                      <p className="text-slate-600">Nelle Azioni AI, selezionare la categoria personalizzata. Il sistema produrra un nuovo documento <strong>con la stessa struttura, lo stesso linguaggio e lo stesso stile</strong> del modello caricato.</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 p-5 rounded-xl bg-white border-2 border-[#2f9aa7]/30 shadow-md">
                  <div className="flex-shrink-0">
                    <svg className="h-16 w-16 text-[#2f9aa7]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-bold text-slate-900 text-lg">Risultato</p>
                    <p className="text-slate-600">Il documento generato sara indistinguibile per struttura e stile da quelli prodotti personalmente. Maggiore e' il numero di template caricati, migliore sara la qualita dell'emulazione.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Step 4 - PubMed */}
          <div className="mb-16">
            <div className="flex items-start gap-6 p-8 rounded-3xl bg-gradient-to-r from-slate-50 to-white border-2 border-slate-200 shadow-lg">
              <div className="flex-shrink-0 w-20 h-20 rounded-2xl bg-gradient-to-br from-[#2f9aa7] to-[#3eb8a8] flex items-center justify-center text-white text-3xl font-bold shadow-lg">
                4
              </div>
              <div className="flex-1">
                <h3 className="text-2xl font-bold text-slate-900 mb-3">Consulta giurisprudenza e dottrina</h3>
                <p className="text-lg text-slate-600 mb-4 leading-relaxed">
                  L'integrazione con le <strong>banche dati giuridiche</strong> consente di accedere alla giurisprudenza e alla dottrina direttamente dalla piattaforma.
                </p>
                <div className="space-y-4 mb-4">
                  <div className="flex items-start gap-4 p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-[#2f9aa7] flex items-center justify-center">
                      <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 mb-1">Ricerca articoli</p>
                      <p className="text-slate-600">Selezionare <strong>"Giurisprudenza"</strong> nel menu a sinistra. E' possibile cercare per materia, articolo di legge, giudice o parola chiave.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4 p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-[#2f9aa7] flex items-center justify-center">
                      <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.98 1.804a1 1 0 00-1.96 0l-.24 1.192a1 1 0 01-.784.785l-1.192.238a1 1 0 000 1.962l1.192.238a1 1 0 01.785.785l.238 1.192a1 1 0 001.962 0l.238-1.192a1 1 0 01.785-.785l1.192-.238a1 1 0 000-1.962l-1.192-.238a1 1 0 01-.785-.785l-.238-1.192z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 mb-1">Generazione review</p>
                      <p className="text-slate-600">Il pulsante <strong>"Genera Memo"</strong> produce un memo legale basato sulla giurisprudenza trovata, completo di riferimenti.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4 p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-[#2f9aa7] flex items-center justify-center">
                      <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 mb-1">Supporto automatico in chat</p>
                      <p className="text-slate-600">Durante le conversazioni, il sistema <strong>consulta automaticamente le banche dati giuridiche</strong> per fornire risposte basate sugli orientamenti giurisprudenziali piu' recenti.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Step 5 */}
          <div className="mb-8">
            <div className="flex items-start gap-6 p-8 rounded-3xl bg-gradient-to-r from-slate-50 to-white border-2 border-slate-200 shadow-lg">
              <div className="flex-shrink-0 w-20 h-20 rounded-2xl bg-gradient-to-br from-[#2f9aa7] to-[#3eb8a8] flex items-center justify-center text-white text-3xl font-bold shadow-lg">
                5
              </div>
              <div className="flex-1">
                <h3 className="text-2xl font-bold text-slate-900 mb-3">Esporta il risultato</h3>
                <p className="text-lg text-slate-600 mb-4 leading-relaxed">
                  Ogni documento generato puo essere esportato nei formati professionali:
                </p>
                <div className="flex flex-wrap gap-4">
                  <div className="flex items-center gap-3 px-6 py-4 rounded-xl bg-slate-100 border border-slate-300">
                    <svg className="h-8 w-8 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h8a2 2 0 012 2v9a2 2 0 01-2 2H8a2 2 0 01-2-2V9a2 2 0 012-2z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16 3H9a2 2 0 00-2 2v1" />
                    </svg>
                    <div>
                      <p className="font-bold text-slate-900">Copia</p>
                      <p className="text-sm text-slate-500">Negli appunti, pronto per essere incollato</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 px-6 py-4 rounded-xl bg-slate-100 border border-slate-300">
                    <svg className="h-8 w-8 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                    <div>
                      <p className="font-bold text-slate-900">Esporta</p>
                      <p className="text-sm text-slate-500">Formato Word o PDF, con impaginazione professionale</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* Cosa puoi fare */}
      <section className="relative px-6 py-20 lg:px-8 bg-gradient-to-br from-[#2f9aa7] to-[#3eb8a8] shadow-[0_-20px_60px_rgba(0,0,0,0.15),0_20px_60px_rgba(0,0,0,0.15)]">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="flex flex-wrap text-3xl sm:text-4xl font-bold text-white mb-6">
                Infinite possibilità
              </h2>
              <ul className="space-y-4">
                {CAPABILITIES.map((cap, idx) => (
                  <li key={idx} className="flex items-start gap-3">
                    <svg className="h-6 w-6 text-white flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-white/90">{cap}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Demo mockup con ombra forte */}
            <div className="relative">
              <div className="rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 p-1 shadow-[0_20px_60px_rgba(0,0,0,0.3)] min-h-[335px]">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
                  <div className="h-3 w-3 rounded-full bg-white/30" />
                  <div className="h-3 w-3 rounded-full bg-white/30" />
                  <div className="h-3 w-3 rounded-full bg-white/30" />
                </div>
                <div className="p-5 space-y-4">
                  <div className="flex justify-end">
                    <div className="rounded-xl bg-white/20 px-4 py-6 max-w-[80%]">
                      <p className="text-sm text-white/90">Analizza questo fascicolo processuale</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="h-8 w-8 rounded-full bg-white/30 flex-shrink-0" />
                    <div className="flex-1 rounded-xl bg-white/10 border border-white/20 px-4 py-7">
                      <p className="text-sm text-white/90 leading-relaxed">
                        <span className="font-semibold">Analisi completata.</span> Ho identificato 3 criticità nel procedimento e ricostruito la cronologia completa degli atti...
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust & Security */}
      <section className="relative px-6 py-20 lg:px-8 bg-slate-50">
        {/* Ombre di sezione */}
        <div className="absolute inset-0 shadow-[inset_0_20px_60px_-20px_rgba(0,0,0,0.1)] -z-10" />
        <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-slate-200/50 to-transparent -z-10" />
        
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
            Sicurezza e conformità
          </h2>
          <p className="text-lg text-slate-600 mb-12">
            I tuoi documenti sono al sicuro. Legistra rispetta i più alti standard di sicurezza e privacy.
          </p>

          <div className="grid sm:grid-cols-3 gap-6">
            {SECURITY_FEATURES.map((feature, idx) => (
              <div key={idx} className="p-6 rounded-2xl bg-white border border-slate-200 shadow-[0_8px_30px_rgba(0,0,0,0.1)] hover:shadow-[0_12px_40px_rgba(0,0,0,0.15)] transition-all">
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-[#2f9aa7]/10 to-[#3eb8a8]/10 text-[#2f9aa7] mb-4">
                  {feature.icon}
                </div>
                <h3 className="font-bold text-slate-900 mb-2">{feature.title}</h3>
                <p className="text-sm text-slate-500">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA finale */}
      <section className="relative px-6 py-24 lg:px-8 bg-gradient-to-br from-white via-slate-50/50 to-white">
        <div className="absolute inset-0 shadow-[inset_0_20px_60px_-20px_rgba(0,0,0,0.06)] -z-10" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(47,154,167,0.06),transparent_70%)] -z-10" />
        
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 mb-6">
            Inizia a risparmiare ore di lavoro
          </h2>
          <button
            onClick={() => setShowAuth(true)}
            className="group inline-flex items-center gap-3 rounded-full bg-gradient-to-r from-[#2f9aa7] to-[#3eb8a8] px-10 py-5 text-lg font-semibold text-white shadow-[0_10px_40px_rgba(47,154,167,0.4)] transition-all hover:shadow-[0_16px_60px_rgba(47,154,167,0.5)] hover:scale-105"
          >
            Crea Account Gratuito
            <svg className="h-5 w-5 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative border-t border-slate-200 bg-slate-50 px-6 py-12 lg:px-8 shadow-[inset_0_10px_30px_-10px_rgba(0,0,0,0.1)]">
        <div className="absolute inset-x-0 inset-y-0 bg-gradient-to-t from-[#2f9aa7]/5 via-transparent to-transparent shadow-[0_4px_12px_rgba(0,0,0,0.15)]" />
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xl font-black text-black" style={{ fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif', fontSize: '40px', fontWeight: '900', backgroundClip: 'unset', WebkitBackgroundClip: 'unset', color: 'rgba(0, 0, 0, 1)' }}>Legistra</span>
              </div>
              <p className="text-slate-600 max-w-sm">
                L'assistente AI per professionisti legali. Analizza, comprende e genera documenti in pochi secondi.
              </p>
            </div>
            <ul className="flex flex-wrap gap-6 text-sm text-slate-600">
              <li><a href="/termini-e-condizioni" className="hover:text-[#2f9aa7] transition-colors">Termini di servizio</a></li>
              <li><a href="/privacy-policy" className="hover:text-[#2f9aa7] transition-colors">Privacy Policy</a></li>
              <li><a href="/cookie-policy" className="hover:text-[#2f9aa7] transition-colors">Cookie Policy</a></li>
            </ul>
          </div>
          <div className="pt-8 border-t border-slate-200 text-center text-sm text-slate-500">
            © {new Date().getFullYear()} Legistra. Tutti i diritti riservati.
          </div>
        </div>
      </footer>
    </div>
  )
}
