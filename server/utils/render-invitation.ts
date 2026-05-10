import { substituteTemplate, type TemplateData } from './template-substitute'

export type EventRowForRender = {
  coupleName1: string
  coupleName2: string
  date: string
  venue: string
  venueAddress: string
  venueMapUrl: string | null
  description: string | null
  customization: string | null
  language: string
}

// Shrink-to-fit must run before height is reported so the iframe is sized
// against the adjusted layout, not the overflowing one.
const HEIGHT_SCRIPT = `<script>
(function() {
  var MAX_WORDING_LINES = 6;
  function fitWording() {
    var w = document.querySelector('.wording');
    if (!w) return;
    w.style.removeProperty('font-size');
    var cs = window.getComputedStyle(w);
    var orig = parseFloat(cs.fontSize);
    if (!isFinite(orig) || orig <= 0) return;
    var lh = parseFloat(cs.lineHeight);
    if (!isFinite(lh) || lh <= 0) lh = orig * 1.4;
    var maxH = lh * MAX_WORDING_LINES;
    var min = Math.max(8, orig * 0.55);
    var fs = orig;
    var safety = 60;
    while (w.scrollHeight > maxH && fs > min && safety-- > 0) {
      fs -= 0.5;
      w.style.fontSize = fs + 'px';
    }
  }
  function measureHeight() {
    // Templates set 'min-height: 100vh' on body, so body.scrollHeight echoes the
    // current iframe height instead of the actual content height. Measure the
    // invitation wrapper directly when present, and add body padding so the
    // template's intentional breathing room is preserved.
    var card = document.querySelector('.card, .invitation');
    if (!card) return document.documentElement.scrollHeight || document.body.scrollHeight;
    var rect = card.getBoundingClientRect();
    var bs = window.getComputedStyle(document.body);
    var pad = (parseFloat(bs.paddingTop) || 0) + (parseFloat(bs.paddingBottom) || 0);
    return Math.ceil(rect.height + pad);
  }
  function post() {
    fitWording();
    parent.postMessage({ type: 'invitation-height', height: measureHeight() }, '*');
  }
  window.addEventListener('load', post);
  // The iframe's load event can fire before the parent attaches its message
  // listener; a follow-up post on the next macrotask catches that race.
  setTimeout(post, 50);
  if (window.ResizeObserver) {
    new ResizeObserver(post).observe(document.body);
  } else {
    window.addEventListener('resize', post);
  }
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(post);
  }
})();
</script>`

const ROBOTS_META = '<meta name="robots" content="noindex, nofollow">'

export function renderInvitation(
  event: EventRowForRender,
  htmlTemplate: string,
  translations: Record<string, unknown>,
): string {
  const wording = extractWording(event.customization)
  const formattedDate = formatDate(event.date, event.language)

  const data: TemplateData = {
    coupleName1: event.coupleName1,
    coupleName2: event.coupleName2,
    date: formattedDate,
    venue: event.venue,
    venueAddress: event.venueAddress,
    wording,
    venueMapUrl: event.venueMapUrl ?? '',
    description: event.description ?? '',
  }

  const substituted = substituteTemplate(htmlTemplate, data, translations)
  return injectMetaAndScript(substituted)
}

function extractWording(customization: string | null): string {
  if (!customization) return ''
  try {
    const parsed = JSON.parse(customization)
    return typeof parsed?.wording === 'string' ? parsed.wording : ''
  } catch {
    return ''
  }
}

function formatDate(dateStr: string, language: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  if (Number.isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString(language, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function injectMetaAndScript(html: string): string {
  let out = html
  if (/<\/head>/i.test(out)) {
    out = out.replace(/<\/head>/i, `${ROBOTS_META}</head>`)
  } else {
    out = `${ROBOTS_META}${out}`
  }
  if (/<\/body>/i.test(out)) {
    out = out.replace(/<\/body>/i, `${HEIGHT_SCRIPT}</body>`)
  } else {
    out = `${out}${HEIGHT_SCRIPT}`
  }
  return out
}
