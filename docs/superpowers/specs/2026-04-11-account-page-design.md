# Account Page Design

**Date:** 2026-04-11
**Status:** Approved

## Overview

A read-only account page under the protected dashboard area showing the user's basic profile info: name, email, and number of events created. No subscription management or plan info in this iteration.

## Route & File

- **Page:** `pages/dashboard/account.vue`
- **Route:** `/dashboard/account`
- **Layout:** `dashboard` (existing, no changes to layout needed beyond adding nav link)
- **Auth:** Protected by existing `auth` middleware (same pattern as all dashboard pages)

## Navigation

Add a "My Account" sidebar link to `layouts/dashboard.vue`:
- Appears below "Create Event" in both the desktop sidebar and the mobile sidebar overlay
- Same styling as existing nav items: `active-class` champagne highlight, same hover states
- Uses i18n key `nav.myAccount`

## Page Content

A single white card with three read-only fields displayed vertically:

| Label | i18n key | Value source |
|---|---|---|
| Name | `account.name` | `user.name` from `useAuth()` |
| Email | `account.email` | `user.email` from `useAuth()` |
| Events Created | `account.eventsCreated` | `GET /api/auth/me/stats` → `eventCount` |

Each field: small uppercase label, regular body text value below it. Card style matches existing detail pages (white background, `charcoal-200` border, rounded corners, padding).

Page title: `account.title` ("My Account").

## API

### `GET /api/auth/me/stats`

New endpoint. Requires authentication (same `requireAuth` utility as other protected endpoints).

**Response:**
```json
{ "eventCount": 3 }
```

**Logic:** Count rows in `events` table where `userId` matches the authenticated user's id.

## i18n

New keys added to both `en.json` and `es.json`:

| Key | English | Spanish |
|---|---|---|
| `nav.myAccount` | My Account | Mi cuenta |
| `account.title` | My Account | Mi cuenta |
| `account.name` | Name | Nombre |
| `account.email` | Email | Correo electrónico |
| `account.eventsCreated` | Events Created | Eventos creados |

## Out of Scope (this iteration)

- Editing name or email
- Changing password
- Plan/subscription display
- Cancel subscription
