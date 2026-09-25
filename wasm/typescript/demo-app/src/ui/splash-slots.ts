// Slot bookkeeping for the splash dialog: the two input roles, URL sources
// typed or dropped by the user, the pair check that gates "Start", and the
// swap. Pure functions, free of DOM access, so the Node unit tests cover
// them; src/ui/splash.ts binds them to the markup.
import { assertCompatiblePair, type RegistrationInput } from '../io/normalize.ts'
import { nameFromUrl } from '../io/source-kind.ts'

/** The two input slots of a registration. */
export type SlotRole = 'fixed' | 'moving'

export const SLOT_ROLES: readonly SlotRole[] = ['fixed', 'moving']

/** One value per slot. */
export interface Slots<T> {
  fixed: T
  moving: T
}

/** "Fixed" or "Moving", as the dialog labels the slots. */
export function roleLabel(role: SlotRole): string {
  return role === 'fixed' ? 'Fixed' : 'Moving'
}

/** A URL as an ingest source, with the file name derived from its path. */
export interface UrlSource {
  url: string
  name: string
}

export function urlSource(url: string): UrlSource {
  return { url, name: nameFromUrl(url) }
}

/**
 * Source for text typed into a URL field: trimmed, and null when blank
 * (a `wa-input` reports an unset value as null).
 */
export function urlSourceFromText(text: string | null | undefined): UrlSource | null {
  const url = (text ?? '').trim()
  return url === '' ? null : urlSource(url)
}

/**
 * First URL in a dropped `text/uri-list` or plain-text payload: the first
 * non-blank line that is not a `#` comment and looks like an absolute or
 * root-relative URL. Null when there is none, so dropping arbitrary text
 * does not start a load.
 */
export function firstUrlFromList(text: string): string | null {
  for (const line of text.split(/\r?\n/)) {
    const candidate = line.trim()
    if (candidate === '' || candidate.startsWith('#')) {
      continue
    }
    return /^([a-z][a-z0-9+.-]*:\/\/|\/)/i.test(candidate) ? candidate : null
  }
  return null
}

/**
 * Why the loaded pair cannot be registered together, or null when it can
 * or when a slot is still empty. Wraps {@link assertCompatiblePair} so the
 * dialog can show the message as soon as both slots are filled.
 */
export function pairError(fixed?: RegistrationInput, moving?: RegistrationInput): string | null {
  if (!fixed || !moving) {
    return null
  }
  try {
    assertCompatiblePair(fixed, moving)
    return null
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

/** The two slots exchanged. */
export function swapSlots<T>(slots: Slots<T>): Slots<T> {
  return { fixed: slots.moving, moving: slots.fixed }
}
