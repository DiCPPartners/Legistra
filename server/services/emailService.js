/**
 * Servizio email con Resend
 * Gestisce: benvenuto, reset password, notifiche documento pronto
 */

import { Resend } from 'resend'
import { createContextLogger } from './logger.js'

const log = createContextLogger('Email')

const resend = new Resend(process.env.RESEND_API_KEY)

// In development usa il dominio di test di Resend
// In produzione va configurato il dominio verificato
const FROM_EMAIL = process.env.EMAIL_FROM || 'Legistra <onboarding@resend.dev>'
const APP_NAME = 'Legistra'
const APP_URL = process.env.APP_URL || 'http://localhost:5173'

const BRAND_COLOR = '#7B1F34'

function baseTemplate(content) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 20px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
  <!-- Header -->
  <tr><td style="background:${BRAND_COLOR};padding:32px 40px;text-align:center">
    <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700;letter-spacing:-0.5px">${APP_NAME}</h1>
    <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:13px">Assistente Legale AI</p>
  </td></tr>
  <!-- Content -->
  <tr><td style="padding:40px">
    ${content}
  </td></tr>
  <!-- Footer -->
  <tr><td style="background:#f8fafc;padding:24px 40px;text-align:center;border-top:1px solid #e2e8f0">
    <p style="margin:0;color:#94a3b8;font-size:12px">${APP_NAME} - Assistente Legale AI</p>
    <p style="margin:4px 0 0;color:#94a3b8;font-size:11px">Questa email e' stata inviata automaticamente. Non rispondere a questo indirizzo.</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`
}

function button(text, url) {
  return `<table cellpadding="0" cellspacing="0" style="margin:28px 0"><tr><td>
    <a href="${url}" style="display:inline-block;background:${BRAND_COLOR};color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">${text}</a>
  </td></tr></table>`
}

/**
 * Email di benvenuto alla registrazione
 */
export async function sendWelcomeEmail({ to, firstName }) {
  const name = firstName || 'utente'
  const html = baseTemplate(`
    <h2 style="margin:0 0 16px;color:#1e293b;font-size:22px">Benvenuto su ${APP_NAME}, ${name}!</h2>
    <p style="color:#475569;font-size:15px;line-height:1.7;margin:0 0 8px">
      Il tuo account e' stato creato con successo. ${APP_NAME} e' il tuo assistente legale basato sull'intelligenza artificiale.
    </p>
    <p style="color:#475569;font-size:15px;line-height:1.7;margin:0 0 8px">Ecco cosa puoi fare:</p>
    <ul style="color:#475569;font-size:15px;line-height:1.9;padding-left:20px;margin:0 0 8px">
      <li><strong>Analisi documenti</strong> - Carica atti, contratti e fascicoli processuali</li>
      <li><strong>Generazione documenti</strong> - Crea pareri legali con i tuoi template</li>
      <li><strong>Ricerca Giurisprudenza</strong> - Cerca nella giurisprudenza e nella dottrina</li>
      <li><strong>Chat AI</strong> - Consulenza legale in tempo reale</li>
    </ul>
    ${button('Accedi a ' + APP_NAME, APP_URL)}
    <p style="color:#94a3b8;font-size:13px;margin:0">Se non hai creato questo account, ignora questa email.</p>
  `)

  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `Benvenuto su ${APP_NAME}!`,
      html,
    })
    log.info('Welcome email sent', { to, id: result.data?.id })
    return result
  } catch (error) {
    log.error('Failed to send welcome email', { to, error: error.message })
    throw error
  }
}

/**
 * Email di reset password
 */
export async function sendPasswordResetEmail({ to, resetLink, firstName }) {
  const name = firstName || 'utente'
  const html = baseTemplate(`
    <h2 style="margin:0 0 16px;color:#1e293b;font-size:22px">Reset password</h2>
    <p style="color:#475569;font-size:15px;line-height:1.7;margin:0 0 8px">
      Ciao ${name}, abbiamo ricevuto una richiesta di reset della password per il tuo account ${APP_NAME}.
    </p>
    <p style="color:#475569;font-size:15px;line-height:1.7;margin:0 0 8px">
      Clicca il pulsante qui sotto per impostare una nuova password:
    </p>
    ${button('Reimposta password', resetLink)}
    <p style="color:#94a3b8;font-size:13px;margin:0 0 4px">Questo link scade tra 1 ora.</p>
    <p style="color:#94a3b8;font-size:13px;margin:0">Se non hai richiesto il reset, ignora questa email. La tua password non verra' modificata.</p>
  `)

  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `${APP_NAME} - Reset password`,
      html,
    })
    log.info('Password reset email sent', { to, id: result.data?.id })
    return result
  } catch (error) {
    log.error('Failed to send password reset email', { to, error: error.message })
    throw error
  }
}

/**
 * Email di notifica documento pronto
 */
export async function sendDocumentReadyEmail({ to, firstName, documentType, conversationId }) {
  const name = firstName || 'utente'
  const docUrl = `${APP_URL}?conversation=${conversationId}`
  const html = baseTemplate(`
    <h2 style="margin:0 0 16px;color:#1e293b;font-size:22px">Documento pronto</h2>
    <p style="color:#475569;font-size:15px;line-height:1.7;margin:0 0 8px">
      Ciao ${name}, il tuo documento <strong>${documentType || 'legale'}</strong> e' stato generato ed e' pronto per la revisione.
    </p>
    <p style="color:#475569;font-size:15px;line-height:1.7;margin:0 0 8px">
      Puoi visualizzarlo, modificarlo ed esportarlo in Word o PDF dalla piattaforma.
    </p>
    ${button('Visualizza documento', docUrl)}
  `)

  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `${APP_NAME} - Il tuo documento e' pronto`,
      html,
    })
    log.info('Document ready email sent', { to, documentType, id: result.data?.id })
    return result
  } catch (error) {
    log.error('Failed to send document ready email', { to, error: error.message })
    throw error
  }
}

/**
 * Email di aggiornamento con nuove funzionalita'
 */
export async function sendUpdateEmail({ to, firstName, version, features }) {
  const name = firstName || 'utente'
  const featuresList = (features || []).map(f =>
    `<tr><td style="padding:12px 16px;border-bottom:1px solid #f1f5f9">
      <strong style="color:#1e293b;font-size:14px">${f.title}</strong>
      <p style="margin:4px 0 0;color:#64748b;font-size:13px;line-height:1.5">${f.description}</p>
    </td></tr>`
  ).join('')

  const html = baseTemplate(`
    <h2 style="margin:0 0 16px;color:#1e293b;font-size:22px">Novita' su ${APP_NAME}${version ? ` (v${version})` : ''}</h2>
    <p style="color:#475569;font-size:15px;line-height:1.7;margin:0 0 20px">
      Ciao ${name}, abbiamo aggiornato ${APP_NAME} con nuove funzionalita' per migliorare il tuo lavoro.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;overflow:hidden;margin:0 0 24px">
      <tr><td style="background:${BRAND_COLOR};padding:12px 16px">
        <strong style="color:#fff;font-size:14px">Cosa c'e' di nuovo</strong>
      </td></tr>
      ${featuresList}
    </table>
    ${button('Prova le novita\'', APP_URL)}
    <p style="color:#94a3b8;font-size:12px;margin:16px 0 0">Non vuoi ricevere questi aggiornamenti? Contattaci per disattivare le notifiche.</p>
  `)

  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `${APP_NAME} - Nuove funzionalita'${version ? ` (v${version})` : ''}`,
      html,
    })
    log.info('Update email sent', { to, version, id: result.data?.id })
    return result
  } catch (error) {
    log.error('Failed to send update email', { to, error: error.message })
    throw error
  }
}

/**
 * Email generica personalizzata
 */
export async function sendEmail({ to, subject, html: customHtml, text }) {
  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html: customHtml || undefined,
      text: text || undefined,
    })
    log.info('Email sent', { to, subject, id: result.data?.id })
    return result
  } catch (error) {
    log.error('Failed to send email', { to, subject, error: error.message })
    throw error
  }
}
