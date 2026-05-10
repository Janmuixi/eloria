import { substituteTemplate, type TemplateData } from './template-substitute'
import { formatDate, toEventDate } from '~/shared/date-format'

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
  function post() {
    fitWording();
    var h = document.documentElement.scrollHeight || document.body.scrollHeight;
    parent.postMessage({ type: 'invitation-height', height: h }, '*');
  }
  window.addEventListener('load', post);
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
  const formattedDate = formatDate(toEventDate(event.date), event.language, 'long')

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
