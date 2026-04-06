# i18n Translation Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete i18n support across all Vue frontend files by adding missing translation keys and replacing hardcoded strings with `t()` calls.

**Architecture:** Add missing translation keys to en.json/es.json, then systematically fix each Vue file to use `useI18n()` and `t()` for all user-facing text.

**Tech Stack:** Vue 3, Nuxt 3, @nuxtjs/i18n

---

## Task 1: Add Missing Translation Keys

**Files:**
- Modify: `i18n/lang/en.json`
- Modify: `i18n/lang/es.json`

**Step 1: Add `success` section to en.json**

Add after the `ai` section:

```json
  "success": {
    "seoTitle": "Payment Successful - Eloria",
    "verifyingPayment": "Verifying Payment...",
    "verifyingDescription": "Please wait while we confirm your payment.",
    "paymentSuccessful": "Payment Successful!",
    "invitationLive": "Your invitation is now live. Share it with your guests!",
    "paymentProcessing": "Payment Processing",
    "paymentStillProcessing": "Payment is still processing. Please check back shortly.",
    "paymentVerificationFailed": "Could not verify payment. Please check your event dashboard.",
    "goToDashboard": "Go to Event Dashboard"
  },
  "errors": {
    "failedToSendInvitations": "Failed to send invitations",
    "failedToDeleteEvent": "Failed to delete event",
    "failedToGeneratePdf": "Failed to generate PDF",
    "failedToCreateEvent": "Failed to create event",
    "failedToLoadTemplates": "Failed to load templates",
    "failedToSaveTemplate": "Failed to save template",
    "failedToGenerateWording": "Failed to generate wording",
    "failedToSaveCustomization": "Failed to save customization",
    "failedToLoadTiers": "Failed to load tiers",
    "failedToStartPayment": "Failed to start payment. Stripe may not be configured.",
    "invitationNotFound": "Invitation not found",
    "somethingWentWrong": "Something went wrong",
    "invalidResetLink": "Invalid or expired reset link",
    "failedToResetPassword": "Failed to reset password",
    "failedToSendResetLink": "Failed to send reset link",
    "verificationFailed": "Verification failed. The link may have expired.",
    "registrationFailed": "Registration failed",
    "loginFailed": "Login failed"
  },
  "seo": {
    "signIn": "Sign In - Eloria",
    "createAccount": "Create Account - Eloria",
    "verifyEmail": "Verify Email - Eloria",
    "resetPassword": "Reset Password - Eloria",
    "setNewPassword": "Set New Password - Eloria",
    "weddingInvitation": "{name}'s Wedding"
  },
  "templatePreview": {
    "partner1": "Partner 1",
    "partner2": "Partner 2",
    "weddingDate": "Wedding Date",
    "venue": "Venue",
    "address": "Address",
    "wordingPlaceholder": "Your invitation wording will appear here.",
    "iframeTitle": "Invitation preview"
  },
  "aria": {
    "toggleMenu": "Toggle menu"
  }
```

**Step 2: Add same sections to es.json**

```json
  "success": {
    "seoTitle": "Pago Exitoso - Eloria",
    "verifyingPayment": "Verificando Pago...",
    "verifyingDescription": "Por favor espera mientras confirmamos tu pago.",
    "paymentSuccessful": "¡Pago Exitoso!",
    "invitationLive": "Tu invitación ya está activa. ¡Compártela con tus invitados!",
    "paymentProcessing": "Procesando Pago",
    "paymentStillProcessing": "El pago aún se está procesando. Por favor vuelve a revisar pronto.",
    "paymentVerificationFailed": "No se pudo verificar el pago. Por favor revisa tu panel de eventos.",
    "goToDashboard": "Ir al Panel de Evento"
  },
  "errors": {
    "failedToSendInvitations": "Error al enviar invitaciones",
    "failedToDeleteEvent": "Error al eliminar el evento",
    "failedToGeneratePdf": "Error al generar PDF",
    "failedToCreateEvent": "Error al crear el evento",
    "failedToLoadTemplates": "Error al cargar plantillas",
    "failedToSaveTemplate": "Error al guardar plantilla",
    "failedToGenerateWording": "Error al generar texto",
    "failedToSaveCustomization": "Error al guardar personalización",
    "failedToLoadTiers": "Error al cargar planes",
    "failedToStartPayment": "Error al iniciar el pago. Stripe puede no estar configurado.",
    "invitationNotFound": "Invitación no encontrada",
    "somethingWentWrong": "Algo salió mal",
    "invalidResetLink": "Enlace de restablecimiento inválido o expirado",
    "failedToResetPassword": "Error al restablecer contraseña",
    "failedToSendResetLink": "Error al enviar enlace de restablecimiento",
    "verificationFailed": "La verificación falló. El enlace puede haber expirado.",
    "registrationFailed": "Error en el registro",
    "loginFailed": "Error al iniciar sesión"
  },
  "seo": {
    "signIn": "Iniciar Sesión - Eloria",
    "createAccount": "Crear Cuenta - Eloria",
    "verifyEmail": "Verificar Correo - Eloria",
    "resetPassword": "Restablecer Contraseña - Eloria",
    "setNewPassword": "Nueva Contraseña - Eloria",
    "weddingInvitation": "Boda de {name}"
  },
  "templatePreview": {
    "partner1": "Pareja 1",
    "partner2": "Pareja 2",
    "weddingDate": "Fecha de Boda",
    "venue": "Lugar",
    "address": "Dirección",
    "wordingPlaceholder": "El texto de tu invitación aparecerá aquí.",
    "iframeTitle": "Vista previa de invitación"
  },
  "aria": {
    "toggleMenu": "Alternar menú"
  }
```

**Step 3: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('i18n/lang/en.json'))"` and same for es.json

---

## Task 2: Fix success.vue (Missing i18n)

**Files:**
- Modify: `pages/dashboard/events/[id]/success.vue`

**Step 1: Add useI18n import and setup**

At the top of the `<script setup>` section, add:

```typescript
const { t } = useI18n()
```

**Step 2: Replace all hardcoded strings**

Replace:
- `'Verifying Payment...'` → `t('success.verifyingPayment')`
- `'Please wait while we confirm your payment.'` → `t('success.verifyingDescription')`
- `'Payment Successful!'` → `t('success.paymentSuccessful')`
- `'Your invitation is now live. Share it with your guests!'` → `t('success.invitationLive')`
- `'Payment Processing'` → `t('success.paymentProcessing')`
- `'Payment is still processing. Please check back shortly.'` → `t('success.paymentStillProcessing')`
- `'Could not verify payment. Please check your event dashboard.'` → `t('success.paymentVerificationFailed')`
- `'Go to Event Dashboard'` → `t('success.goToDashboard')`

**Step 3: Update SEO title**

Replace `useHead({ title: 'Payment Successful - Eloria' })` with:

```typescript
useHead({ title: t('success.seoTitle') })
```

**Step 4: Verify the file**

Run: `npm run dev` and navigate to success page to verify translations work.

---

## Task 3: Fix layouts/dashboard.vue (Missing i18n)

**Files:**
- Modify: `layouts/dashboard.vue`

**Step 1: Add useI18n setup**

Add at the top of script:

```typescript
const { t } = useI18n()
```

**Step 2: Replace nav strings**

Replace:
- `'My Events'` → `t('dashboard.myEvents')`
- `'Create Event'` → `t('dashboard.createEvent')`
- `'Dashboard'` → `t('dashboard.title')`
- `'Sign out'` → `t('nav.signOut')`

---

## Task 4: Fix TemplatePreview.vue (Missing i18n)

**Files:**
- Modify: `components/invitation/TemplatePreview.vue`

**Step 1: Add useI18n setup**

```typescript
const { t } = useI18n()
```

**Step 2: Replace hardcoded strings**

Replace:
- `'Partner 1'` → `t('templatePreview.partner1')`
- `'Partner 2'` → `t('templatePreview.partner2')`
- `'Wedding Date'` → `t('templatePreview.weddingDate')`
- `'Venue'` → `t('templatePreview.venue')`
- `'Address'` → `t('templatePreview.address')`
- `'Your invitation wording will appear here.'` → `t('templatePreview.wordingPlaceholder')`
- `'Invitation preview'` → `t('templatePreview.iframeTitle')`

---

## Task 5: Fix pages/dashboard/events/[id]/settings.vue

**Files:**
- Modify: `pages/dashboard/events/[id]/settings.vue`

**Step 1: Replace all hardcoded strings with existing translation keys**

The translations already exist in `settings` and `eventDetail` sections:

- `'Back to Events'` → `t('eventDetail.backToEvents')`
- `'Event not found.'` → `t('eventDetail.eventNotFound')`
- `'Event Settings'` → `t('settings.title')`
- `'Public Invitation Link'` → `t('eventDetail.publicInvitationLink')`
- `'Copied!'` → `t('common.copied')`
- `'Copy'` → `t('common.copy')`
- `'Settings saved successfully!'` → `t('settings.settingsSaved')`
- `'Event Title'` → `t('settings.eventTitle')`
- `'Partner 1 Name'` → `t('settings.partner1Name')`
- `'Partner 2 Name'` → `t('settings.partner2Name')`
- `'Date'` → `t('settings.date')`
- `'Venue'` → `t('settings.venue')`
- `'Venue Address'` → `t('settings.venueAddress')`
- `'Map URL'` → `t('settings.mapUrl')`
- `'https://maps.google.com/...'` → `t('settings.mapUrlPlaceholder')`
- `'Description'` → `t('settings.description')`
- `'Optional description or notes'` → `t('settings.descriptionPlaceholder')`
- `'Saving...'` → `t('settings.saving')`
- `'Save Changes'` → `t('settings.saveChanges')`
- `'Change Template'` → `t('settings.changeTemplate')`

---

## Task 6: Fix pages/dashboard/events/[id]/guests.vue

**Files:**
- Modify: `pages/dashboard/events/[id]/guests.vue`

**Step 1: Replace all hardcoded strings with existing translation keys**

The translations already exist in `guests` and `common` sections:

- `'Remove this guest?'` → `t('guests.confirmRemove')`
- `'Back to Events'` → `t('eventDetail.backToEvents')`
- `'Guest List'` → `t('guests.guestList')`
- `'Import CSV'` → `t('guests.importCsv')`
- `'Add Guest'` → `t('guests.addGuest')`
- `'Name *'` → `t('guests.nameRequired')`
- `'Guest name'` → `t('guests.guestNamePlaceholder')`
- `'Email'` → `t('common.email')`
- `'guest@email.com'` → `t('guests.emailPlaceholder')`
- `'Adding...'` → `t('guests.adding')`
- `'Add'` → `t('guests.add')`
- `'Cancel'` → `t('common.cancel')`
- `'Import from CSV'` → `t('guests.importFromCsv')`
- `'Paste CSV data below. Each line: name,email or just name'` → `t('guests.csvHelp', { format1: 'name,email', format2: 'name' })`
- `'John Doe,john@email.com\nJane Smith'` → `t('guests.csvPlaceholder')`
- `'Importing...'` → `t('guests.importing')`
- `'Import'` → `t('guests.import')`
- `'Successfully imported X guests!'` → `t('guests.importSuccess', { count: importResult.count })`
- `'No guests added yet.'` → `t('guests.noGuests')`
- `'Add guests individually or import from CSV.'` → `t('guests.noGuestsHelp')`
- `'Name'` (table header) → `t('guests.tableHeaderName')`
- `'Email'` (table header) → `t('guests.tableHeaderEmail')`
- `'RSVP Status'` → `t('guests.tableHeaderRsvp')`
- `'Actions'` → `t('guests.tableHeaderActions')`
- `'Remove'` → `t('common.remove')`
- `'—'` → `t('guests.noEmail')`

---

## Task 7: Fix pages/dashboard/events/new.vue

**Files:**
- Modify: `pages/dashboard/events/new.vue`

**Step 1: Replace hardcoded error messages**

Replace:
- `'Failed to create event'` → `t('errors.failedToCreateEvent')`
- `'Failed to load templates'` → `t('errors.failedToLoadTemplates')`
- `'Failed to save template'` → `t('errors.failedToSaveTemplate')`
- `'Failed to generate wording'` → `t('errors.failedToGenerateWording')`
- `'Failed to save customization'` → `t('errors.failedToSaveCustomization')`
- `'Failed to load tiers'` → `t('errors.failedToLoadTiers')`
- `'Failed to start payment. Stripe may not be configured.'` → `t('errors.failedToStartPayment')`

---

## Task 8: Fix pages/dashboard/events/[id]/index.vue

**Files:**
- Modify: `pages/dashboard/events/[id]/index.vue`

**Step 1: Replace hardcoded error messages**

- `'Failed to send invitations'` → `t('errors.failedToSendInvitations')`
- `'Failed to delete event'` → `t('errors.failedToDeleteEvent')`
- `'Failed to generate PDF'` → `t('errors.failedToGeneratePdf')`

**Step 2: Fix hardcoded locale**

Replace `'en-US'` with `locale.value` or a computed property that uses the current i18n locale.

---

## Task 9: Fix pages/i/[slug].vue

**Files:**
- Modify: `pages/i/[slug].vue`

**Step 1: Replace hardcoded strings**

- `'Invitation not found'` → `t('errors.invitationNotFound')`
- `'Something went wrong'` → `t('errors.somethingWentWrong')`
- `'s Wedding'` → use `t('seo.weddingInvitation', { name: event.coupleName1 })`

**Step 2: Fix hardcoded locale**

Replace `'en-US'` with `locale.value`

---

## Task 10: Fix auth pages (login, register, verify, forgot-password, reset-password)

**Files:**
- Modify: `pages/auth/login.vue`
- Modify: `pages/auth/register.vue`
- Modify: `pages/auth/verify.vue`
- Modify: `pages/auth/forgot-password.vue`
- Modify: `pages/auth/reset-password.vue`

**Step 1: Replace SEO titles**

- `login.vue`: `'Sign In - Eloria'` → `t('seo.signIn')`
- `register.vue`: `'Create Account - Eloria'` → `t('seo.createAccount')`
- `verify.vue`: `'Verify Email - Eloria'` → `t('seo.verifyEmail')`
- `forgot-password.vue`: `'Reset Password - Eloria'` → `t('seo.resetPassword')`
- `reset-password.vue`: `'Set New Password - Eloria'` → `t('seo.setNewPassword')`

**Step 2: Replace error messages**

- `login.vue`: `'Login failed'` → `t('errors.loginFailed')`
- `register.vue`: `'Registration failed'` → `t('errors.registrationFailed')`
- `verify.vue`: `'Verification failed. The link may have expired.'` → `t('errors.verificationFailed')`
- `forgot-password.vue`: `'Failed to send reset link'` → `t('errors.failedToSendResetLink')`
- `reset-password.vue`: `'Invalid reset link'` → `t('errors.invalidResetLink')`, `'Invalid or expired reset link'` → `t('errors.invalidResetLink')`, `'Failed to reset password'` → `t('errors.failedToResetPassword')`

**Step 3: Replace placeholder in forgot-password.vue**

- `'you@example.com'` → `t('common.email').toLowerCase()` or add a specific placeholder key

---

## Task 11: Fix components/ui/Navbar.vue

**Files:**
- Modify: `components/ui/Navbar.vue`

**Step 1: Replace aria-label**

- `'Toggle menu'` → `t('aria.toggleMenu')`

---

## Task 12: Verify All Translations Work

**Step 1: Run the dev server**

```bash
npm run dev
```

**Step 2: Test all affected pages**

Navigate through:
- Auth pages (login, register, forgot-password, reset-password, verify)
- Dashboard and event pages
- Settings and guests pages
- Success page
- Public invitation page

**Step 3: Test language switching**

Switch between English and Spanish and verify all text updates correctly.

**Step 4: Commit changes**

```bash
git add i18n/lang/*.json pages/**/*.vue layouts/*.vue components/**/*.vue
git commit -m "feat(i18n): complete i18n support across all frontend components"
```

---

## Summary

| Task | Files Changed | Type |
|------|---------------|------|
| 1 | en.json, es.json | Add translation keys |
| 2 | success.vue | Add i18n, replace 8 strings |
| 3 | dashboard.vue | Add i18n, replace 5 strings |
| 4 | TemplatePreview.vue | Add i18n, replace 7 strings |
| 5 | settings.vue | Replace 17+ strings |
| 6 | guests.vue | Replace 20+ strings |
| 7 | new.vue | Replace 7 error messages |
| 8 | events/[id]/index.vue | Replace 4 strings, fix locale |
| 9 | i/[slug].vue | Replace 5 strings, fix locale |
| 10 | 5 auth pages | Replace SEO titles + errors |
| 11 | Navbar.vue | Replace aria-label |
| 12 | - | Verify and commit |
