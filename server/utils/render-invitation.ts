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

const HEIGHT_SCRIPT = `<script>
(function() {
  function post() {
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
