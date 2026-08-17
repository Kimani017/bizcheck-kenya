// src/errors.js
// ─────────────────────────────────────────────────────────────────────────────
// Two jobs:
//
//   1. Turn raw errors into sentences a Kenyan shopper can act on.
//      "23505" and "new row violates row-level security policy" are not
//      messages — they are diagnostics that leaked into the UI.
//
//   2. Report the RAW error to the admin queue, so nothing is lost by
//      showing the friendly version. The user sees plain English; you see
//      the stack trace.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase'

// ── Postgres / PostgREST codes ───────────────────────────────────────────────
const PG_CODES = {
  '23505': 'That already exists. It may have been saved already — check before trying again.',
  '23503': "Something this depends on is missing. Refresh the page and try again.",
  '23502': 'A required field was left empty.',
  '23514': "That value isn't allowed. Check the amounts and try again.",
  '22P02': "Something was typed in a format we didn't expect. Check your entries.",
  '42501': "You don't have permission to do that.",
  '42P01': 'Something is missing on our side. We have been notified.',
  'P0001': null,        // custom raise — handled by APP_CODES below
  '40001': 'Too many people did that at once. Please try again.',
  '53300': 'We are very busy right now. Please try again in a moment.',
  '57014': 'That took too long. Please try again.',
  'PGRST301': 'Your session expired. Please log in again.',
  'PGRST116': "We couldn't find that.",
}

// ── Our own raised exceptions ────────────────────────────────────────────────
// These are the codes our RPCs raise deliberately, e.g.
//   raise exception 'INSUFFICIENT_BALANCE' using errcode = 'P0001';
const APP_CODES = {
  AUTH_REQUIRED:            'Please log in to continue.',
  ADMIN_REQUIRED:           'Only an admin can do that.',
  INSUFFICIENT_BALANCE:     "You don't have enough Checks for this. Add some to your wallet first.",
  INSUFFICIENT_CREDITS:     "You've run out of credits.",
  OUT_OF_STOCK:             'That item just sold out.',
  ORDER_NOT_FOUND:          "We couldn't find that order.",
  ALREADY_CONFIRMED:        'That has already been confirmed.',
  IDEMPOTENCY_KEY_REQUIRED: 'Something went wrong starting your order. Please try again.',
  LEDGER_IMMUTABLE:         'Transaction records cannot be changed. An admin has been notified.',
  RESOLUTION_NOTE_REQUIRED: 'Please write a short note explaining how this was resolved.',
  BANNED:                   'This account has been suspended. Contact support@bizcheckkenya.com',
  RATE_LIMITED:             "You're doing that too quickly. Wait a moment and try again.",
}

// ── Network / auth ───────────────────────────────────────────────────────────
const MESSAGE_PATTERNS = [
  [/failed to fetch|network ?error|networkerror/i,
    'No internet connection. Check your data or Wi-Fi and try again.'],
  [/timeout|timed out/i,
    'That took too long. Check your connection and try again.'],
  [/invalid login credentials/i,
    'That email or password is not right.'],
  [/email not confirmed/i,
    'Please confirm your email first — check your inbox.'],
  [/user already registered/i,
    'An account with that email already exists. Try logging in.'],
  [/password should be at least/i,
    'Your password needs to be at least 6 characters.'],
  [/jwt expired|invalid token|session.*expired/i,
    'Your session expired. Please log in again.'],
  [/row-level security|violates row level/i,
    "You don't have permission to do that."],
  [/rate limit|too many requests/i,
    "You're doing that too quickly. Wait a moment and try again."],
  [/duplicate key/i,
    'That already exists.'],
  [/storage.*not found|object not found/i,
    "We couldn't find that file."],
  [/payload too large|file too large/i,
    'That file is too big. Try one under 5MB.'],
]

const FALLBACK = "Something went wrong on our side. We've been told about it — please try again."

/**
 * Convert any error into a sentence worth showing a user.
 * Never returns a code, a stack trace, or a table name.
 */
export function friendlyError(err) {
  if (!err) return FALLBACK

  const raw     = typeof err === 'string' ? err : (err.message || '')
  const code    = err.code || err.error_code || err.status

  // 1. Our own raised codes — the message body IS the code
  for (const [key, msg] of Object.entries(APP_CODES)) {
    if (raw.includes(key)) return msg
  }

  // 2. Postgres / PostgREST codes
  if (code && PG_CODES[code]) return PG_CODES[code]

  // 3. HTTP statuses
  if (code === 401 || code === '401') return 'Please log in to continue.'
  if (code === 403 || code === '403') return "You don't have permission to do that."
  if (code === 404 || code === '404') return "We couldn't find that."
  if (code === 429 || code === '429') return "You're doing that too quickly. Wait a moment."
  if (code >= 500 && code < 600)      return 'Our servers are having trouble. Please try again shortly.'

  // 4. Message patterns
  for (const [pattern, msg] of MESSAGE_PATTERNS) {
    if (pattern.test(raw)) return msg
  }

  // 5. Nothing matched. Show the fallback, never the raw text — raw Postgres
  //    errors leak table and column names.
  return FALLBACK
}

// ═════════════════════════════════════════════════════════════════════════════
// ERROR REPORTING
// ═════════════════════════════════════════════════════════════════════════════

const reported = new Set()          // fingerprints already sent this session
const MAX_PER_SESSION = 20          // stops an error loop flooding the table
let sentThisSession = 0

function fingerprint(err, context) {
  const raw = typeof err === 'string' ? err : (err?.message || 'unknown')
  // First stack frame only — line numbers shift between builds, the function
  // name does not.
  const frame = (err?.stack || '').split('\n')[1]?.trim().slice(0, 80) || ''
  return `${context}|${raw.slice(0, 120)}|${frame}`
}

/**
 * Send an error to the admin queue. Safe to call from anywhere — it never
 * throws, because an error in the error reporter is how you lose a whole app.
 */
export async function reportError(err, context = 'unknown', extra = {}) {
  try {
    if (sentThisSession >= MAX_PER_SESSION) return

    const fp = fingerprint(err, context)
    if (reported.has(fp)) return        // already sent this exact one
    reported.add(fp)
    sentThisSession++

    const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }))

    await supabase.from('client_errors').insert({
      user_id:      user?.id ?? null,
      context,
      message:      (typeof err === 'string' ? err : err?.message || 'Unknown error').slice(0, 1000),
      error_code:   err?.code ? String(err.code).slice(0, 50) : null,
      stack:        (err?.stack || '').slice(0, 4000),
      url:          typeof window !== 'undefined' ? window.location.href.slice(0, 500) : null,
      user_agent:   typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 500) : null,
      extra:        Object.keys(extra).length ? extra : null,
      fingerprint:  fp.slice(0, 300),
    })
  } catch {
    // Swallow deliberately. Reporting failures must never surface to the user
    // or recurse into another report.
  }
}

/**
 * Handle an error in one call: report it, return the friendly message.
 *
 *   const { error } = await supabase.rpc('place_order', {...})
 *   if (error) { setError(handleError(error, 'place_order')); return }
 */
export function handleError(err, context = 'unknown', extra = {}) {
  reportError(err, context, extra)
  return friendlyError(err)
}

/**
 * Catch errors nobody wrapped in a try/catch — the ones that currently vanish.
 * Call once from main.jsx.
 */
export function installGlobalErrorHandlers() {
  if (typeof window === 'undefined') return

  window.addEventListener('error', (event) => {
    // Failed <img>/<script> loads fire this too and are rarely actionable.
    if (event.target && event.target !== window) return
    reportError(event.error || event.message, 'window.onerror', {
      filename: event.filename, lineno: event.lineno, colno: event.colno,
    })
  })

  window.addEventListener('unhandledrejection', (event) => {
    reportError(event.reason, 'unhandledrejection')
  })
}