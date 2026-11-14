/**
 * Split text into spans once at build time so `seek` can animate words or letters.
 * Spaces are kept as text nodes between word spans so line breaking stays natural.
 */
export function splitText(el: HTMLElement, text: string, by: 'word' | 'char'): HTMLSpanElement[] {
  el.textContent = '';
  const doc = el.ownerDocument;
  const spans: HTMLSpanElement[] = [];
  const words = text.split(/(\s+)/);
  for (const part of words) {
    if (part.length === 0) continue;
    if (/^\s+$/.test(part)) {
      el.append(doc.createTextNode(' '));
      continue;
    }
    if (by === 'word') {
      const s = doc.createElement('span');
      s.textContent = part;
      s.style.display = 'inline-block';
      el.append(s);
      spans.push(s);
    } else {
      // Keep each word together so letters never wrap mid-word.
      const word = doc.createElement('span');
      word.style.display = 'inline-block';
      word.style.whiteSpace = 'nowrap';
      for (const ch of Array.from(part)) {
        const s = doc.createElement('span');
        s.textContent = ch;
        s.style.display = 'inline-block';
        word.append(s);
        spans.push(s);
      }
      el.append(word);
    }
  }
  return spans;
}
