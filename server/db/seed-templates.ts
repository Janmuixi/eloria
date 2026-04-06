import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { templates, tiers } from './schema'
import { eq } from 'drizzle-orm'

const dbUrl = process.env.DATABASE_URL || 'file:./db/eloria.db'
const sqlite = new Database(dbUrl.replace('file:', ''))
const db = drizzle(sqlite, { schema: { templates, tiers } })

const rusticAutumnHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Lora:ital,wght@0,400;0,600;1,400&display=swap');

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: 'Lora', Georgia, serif;
    background: #fdf6ee;
    color: #4a3728;
    min-height: 100vh;
  }

  .invitation {
    max-width: 640px;
    margin: 0 auto;
    padding: 60px 40px;
    text-align: center;
    position: relative;
  }

  .border-frame {
    border: 2px solid #c4956a;
    padding: 50px 40px;
    position: relative;
  }

  .border-frame::before,
  .border-frame::after {
    content: '';
    position: absolute;
    width: 30px;
    height: 30px;
    border-color: #b8834a;
  }

  .border-frame::before {
    top: 8px;
    left: 8px;
    border-top: 3px solid #b8834a;
    border-left: 3px solid #b8834a;
  }

  .border-frame::after {
    bottom: 8px;
    right: 8px;
    border-bottom: 3px solid #b8834a;
    border-right: 3px solid #b8834a;
  }

  .leaf-divider {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    margin: 28px 0;
    color: #c4956a;
    font-size: 20px;
  }

  .leaf-divider .line {
    width: 60px;
    height: 1px;
    background: #c4956a;
  }

  .together {
    font-family: 'Lora', serif;
    font-size: 13px;
    letter-spacing: 0.25em;
    text-transform: uppercase;
    color: #9a7350;
    margin-bottom: 20px;
  }

  .couple-name {
    font-family: 'Playfair Display', serif;
    font-size: 48px;
    font-weight: 700;
    color: #5c3d20;
    line-height: 1.2;
  }

  .ampersand {
    font-family: 'Playfair Display', serif;
    font-style: italic;
    font-size: 32px;
    color: #b8834a;
    margin: 8px 0;
  }

  .event-date {
    font-family: 'Playfair Display', serif;
    font-size: 20px;
    color: #7a5c3e;
    margin-top: 8px;
  }

  .wording {
    font-family: 'Lora', serif;
    font-style: italic;
    font-size: 16px;
    line-height: 1.8;
    color: #6b5241;
    max-width: 420px;
    margin: 0 auto;
    white-space: pre-line;
  }

  .venue-section h3 {
    font-family: 'Playfair Display', serif;
    font-size: 18px;
    font-weight: 700;
    color: #5c3d20;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    margin-bottom: 12px;
  }

  .venue-name {
    font-family: 'Lora', serif;
    font-size: 18px;
    font-weight: 600;
    color: #6b5241;
    margin-bottom: 4px;
  }

  .venue-address {
    font-family: 'Lora', serif;
    font-size: 14px;
    color: #9a7350;
  }

  .footer-note {
    font-family: 'Lora', serif;
    font-size: 12px;
    color: #b8a089;
    margin-top: 30px;
    letter-spacing: 0.1em;
  }
</style>
</head>
<body>
  <div class="invitation">
    <div class="border-frame">
      <p class="together">Together with their families</p>

      <h1 class="couple-name">{{coupleName1}}</h1>
      <p class="ampersand">&amp;</p>
      <h1 class="couple-name">{{coupleName2}}</h1>

      <div class="leaf-divider">
        <span class="line"></span>
        <span>&#127809;</span>
        <span class="line"></span>
      </div>

      <p class="event-date">{{date}}</p>

      <div class="leaf-divider">
        <span class="line"></span>
        <span>&#127809;</span>
        <span class="line"></span>
      </div>

      <div class="wording">{{wording}}</div>

      <div class="leaf-divider">
        <span class="line"></span>
        <span>&#10047;</span>
        <span class="line"></span>
      </div>

      <div class="venue-section">
        <h3>Venue</h3>
        <p class="venue-name">{{venue}}</p>
        <p class="venue-address">{{venueAddress}}</p>
      </div>

      <p class="footer-note">We joyfully request the honour of your presence</p>
    </div>
  </div>
</body>
</html>`

const rusticAutumnCss = `/* Rustic Autumn — inline styles within the HTML template */`

const modernMinimalHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=DM+Serif+Display&display=swap');

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    background: #ffffff;
    color: #1a1a1a;
    min-height: 100vh;
  }

  .invitation {
    max-width: 600px;
    margin: 0 auto;
    padding: 80px 40px;
    text-align: center;
  }

  .tag {
    display: inline-block;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: #999;
    margin-bottom: 48px;
  }

  .couple-name {
    font-family: 'DM Serif Display', serif;
    font-size: 52px;
    font-weight: 400;
    color: #111;
    line-height: 1.15;
  }

  .ampersand {
    font-family: 'DM Serif Display', serif;
    font-size: 28px;
    color: #43608f;
    margin: 12px 0;
  }

  .divider {
    width: 48px;
    height: 2px;
    background: #43608f;
    margin: 40px auto;
  }

  .event-date {
    font-size: 18px;
    font-weight: 300;
    color: #333;
    letter-spacing: 0.05em;
  }

  .wording {
    font-size: 15px;
    font-weight: 300;
    line-height: 1.9;
    color: #555;
    max-width: 440px;
    margin: 0 auto;
    white-space: pre-line;
  }

  .venue-section {
    margin-top: 0;
  }

  .venue-label {
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: #999;
    margin-bottom: 12px;
  }

  .venue-name {
    font-family: 'DM Serif Display', serif;
    font-size: 22px;
    color: #222;
    margin-bottom: 6px;
  }

  .venue-address {
    font-size: 14px;
    font-weight: 300;
    color: #777;
  }

  .footer {
    margin-top: 60px;
    padding-top: 32px;
    border-top: 1px solid #eee;
  }

  .footer p {
    font-size: 12px;
    font-weight: 400;
    color: #bbb;
    letter-spacing: 0.1em;
  }
</style>
</head>
<body>
  <div class="invitation">
    <span class="tag">Wedding Invitation</span>

    <h1 class="couple-name">{{coupleName1}}</h1>
    <p class="ampersand">&amp;</p>
    <h1 class="couple-name">{{coupleName2}}</h1>

    <div class="divider"></div>

    <p class="event-date">{{date}}</p>

    <div class="divider"></div>

    <div class="wording">{{wording}}</div>

    <div class="divider"></div>

    <div class="venue-section">
      <p class="venue-label">Venue</p>
      <p class="venue-name">{{venue}}</p>
      <p class="venue-address">{{venueAddress}}</p>
    </div>

    <div class="footer">
      <p>We look forward to celebrating with you</p>
    </div>
  </div>
</body>
</html>`

const modernMinimalCss = `/* Modern Minimal — inline styles within the HTML template */`

const classicElegantHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400;1,500&family=Cinzel:wght@400;500;600&display=swap');

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: 'Cormorant Garamond', Georgia, serif;
    background: #0d0b12;
    color: #e8e0d0;
    min-height: 100vh;
  }

  .invitation {
    max-width: 640px;
    margin: 0 auto;
    padding: 60px 40px;
    text-align: center;
    position: relative;
  }

  .gold-border {
    border: 1px solid #c9a84c;
    padding: 56px 44px;
    position: relative;
    background: linear-gradient(180deg, rgba(201, 168, 76, 0.04) 0%, rgba(13, 11, 18, 0) 50%, rgba(201, 168, 76, 0.04) 100%);
  }

  .gold-border::before {
    content: '';
    position: absolute;
    inset: 6px;
    border: 1px solid rgba(201, 168, 76, 0.3);
    pointer-events: none;
  }

  .ornament {
    color: #c9a84c;
    font-size: 28px;
    margin: 24px 0;
    letter-spacing: 16px;
    line-height: 1;
  }

  .together {
    font-family: 'Cormorant Garamond', serif;
    font-style: italic;
    font-size: 15px;
    color: #a89a80;
    letter-spacing: 0.15em;
    margin-bottom: 24px;
  }

  .couple-name {
    font-family: 'Cinzel', serif;
    font-size: 44px;
    font-weight: 500;
    color: #c9a84c;
    line-height: 1.2;
    letter-spacing: 0.05em;
    text-shadow: 0 0 40px rgba(201, 168, 76, 0.15);
  }

  .ampersand {
    font-family: 'Cormorant Garamond', serif;
    font-style: italic;
    font-size: 36px;
    color: #a89a80;
    margin: 10px 0;
  }

  .gold-line {
    width: 80px;
    height: 1px;
    background: linear-gradient(90deg, transparent, #c9a84c, transparent);
    margin: 32px auto;
  }

  .event-date {
    font-family: 'Cinzel', serif;
    font-size: 16px;
    font-weight: 400;
    color: #d4c5a9;
    letter-spacing: 0.2em;
  }

  .wording {
    font-family: 'Cormorant Garamond', serif;
    font-style: italic;
    font-size: 18px;
    line-height: 1.9;
    color: #b8a88e;
    max-width: 420px;
    margin: 0 auto;
    white-space: pre-line;
  }

  .venue-section h3 {
    font-family: 'Cinzel', serif;
    font-size: 13px;
    font-weight: 500;
    color: #c9a84c;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    margin-bottom: 14px;
  }

  .venue-name {
    font-family: 'Cormorant Garamond', serif;
    font-size: 22px;
    font-weight: 600;
    color: #e0d5c0;
    margin-bottom: 6px;
  }

  .venue-address {
    font-family: 'Cormorant Garamond', serif;
    font-size: 15px;
    color: #8a7d6a;
  }

  .footer-note {
    font-family: 'Cormorant Garamond', serif;
    font-style: italic;
    font-size: 13px;
    color: #6b6050;
    margin-top: 36px;
    letter-spacing: 0.1em;
  }
</style>
</head>
<body>
  <div class="invitation">
    <div class="gold-border">
      <div class="ornament">&#10022; &#10022; &#10022;</div>

      <p class="together">Together with their families</p>

      <h1 class="couple-name">{{coupleName1}}</h1>
      <p class="ampersand">&amp;</p>
      <h1 class="couple-name">{{coupleName2}}</h1>

      <div class="gold-line"></div>

      <p class="event-date">{{date}}</p>

      <div class="gold-line"></div>

      <div class="wording">{{wording}}</div>

      <div class="gold-line"></div>

      <div class="venue-section">
        <h3>Venue</h3>
        <p class="venue-name">{{venue}}</p>
        <p class="venue-address">{{venueAddress}}</p>
      </div>

      <p class="footer-note">The honour of your presence is requested</p>

      <div class="ornament">&#10022; &#10022; &#10022;</div>
    </div>
  </div>
</body>
</html>`

const classicElegantCss = `/* Classic Elegant — inline styles within the HTML template */`

async function seedTemplates() {
  console.log('Seeding templates...')

  // Get the basic tier (minimum tier for starter templates)
  const basicTier = await db.select().from(tiers).where(eq(tiers.slug, 'basic')).limit(1)
  if (!basicTier.length) {
    console.error('Basic tier not found. Run db:seed first.')
    process.exit(1)
  }
  const basicTierId = basicTier[0]?.id
  if (!basicTierId) {
    console.error('Basic tier not found. Run db:seed first.')
    process.exit(1)
  }

  await db.insert(templates).values([
    {
      name: 'Rustic Autumn',
      slug: 'rustic-autumn',
      category: 'rustic',
      previewImageUrl: '/images/templates/rustic-autumn.jpg',
      htmlTemplate: rusticAutumnHtml,
      cssTemplate: rusticAutumnCss,
      colorScheme: JSON.stringify({
        primary: '#b8834a',
        secondary: '#c4956a',
        background: '#fdf6ee',
        text: '#4a3728',
        accent: '#5c3d20',
      }),
      fontPairings: JSON.stringify({
        heading: 'Playfair Display',
        body: 'Lora',
      }),
      tags: JSON.stringify(['rustic', 'autumn', 'warm', 'outdoor', 'barn', 'country']),
      minimumTierId: basicTierId,
    },
    {
      name: 'Modern Minimal',
      category: 'modern',
      previewImageUrl: '/images/templates/modern-minimal.jpg',
      htmlTemplate: modernMinimalHtml,
      cssTemplate: modernMinimalCss,
      slug: 'modern-minimal',
      colorScheme: JSON.stringify({
        primary: '#314571',
        secondary: '#8ea3c3',
        background: '#FEFDF9',
        text: '#101722',
        accent: '#43608f',
      }),
      fontPairings: JSON.stringify({
        heading: 'DM Serif Display',
        body: 'Inter',
      }),
      tags: JSON.stringify(['modern', 'minimal', 'clean', 'contemporary', 'simple']),
      minimumTierId: basicTierId,
    },
    {
      name: 'Classic Elegant',
      category: 'classic',
      previewImageUrl: '/images/templates/classic-elegant.jpg',
      htmlTemplate: classicElegantHtml,
      cssTemplate: classicElegantCss,
      slug: 'classic-elegant',
      colorScheme: JSON.stringify({
        primary: '#c9a84c',
        secondary: '#a89a80',
        background: '#0d0b12',
        text: '#e8e0d0',
        accent: '#d4c5a9',
      }),
      fontPairings: JSON.stringify({
        heading: 'Cinzel',
        body: 'Cormorant Garamond',
      }),
      tags: JSON.stringify(['classic', 'elegant', 'formal', 'traditional', 'luxury', 'gold']),
      minimumTierId: basicTierId,
    },
  ]).onConflictDoNothing()

  console.log('Template seeding complete.')
  sqlite.close()
}

seedTemplates()
