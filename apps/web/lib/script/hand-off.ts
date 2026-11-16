/**
 * The script travels between the dashboard, /start and /start/script in this tab's session
 * storage, not the URL: a long script in `?text=` made a URL the hosting layer rejects. It also
 * keeps the draft through a reload until the voice is made.
 */
const KEY = 'motionpop:script-draft';

export function putScriptDraft(text: string): void {
  try {
    if (text.trim()) sessionStorage.setItem(KEY, text);
    else sessionStorage.removeItem(KEY);
  } catch {
    // Storage blocked (private mode): the next screen starts empty, nothing breaks.
  }
}

export function readScriptDraft(): string {
  try {
    return sessionStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export function clearScriptDraft(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
