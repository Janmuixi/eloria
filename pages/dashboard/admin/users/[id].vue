<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'] })

type DetailResponse = {
  user: {
    id: number; email: string; name: string; avatarUrl: string | null;
    emailVerified: boolean | null; googleId: string | null; stripeCustomerId: string | null;
    createdAt: string | null;
    passwordHash: null; hasPassword: boolean;
    resetToken: null; hasResetToken: boolean; resetTokenExpiresAt: string | null;
  };
  events: Array<{ id: number; title: string; date: string; slug: string; paymentStatus: string; tier: { slug: string; name: string } | null; createdAt: string | null }>;
  subscriptions: Array<{ id: number; stripeSubscriptionId: string; status: string; price: number; currentPeriodStart: string | null; currentPeriodEnd: string | null; canceledAt: string | null; createdAt: string | null }>;
}

const route = useRoute()
const { data, status } = await useFetch<DetailResponse>(`/api/admin/users/${route.params.id}`)

const fields = computed(() => {
  if (!data.value) return [] as Array<[string, string]>
  const u = data.value.user
  return [
    ['ID', String(u.id)],
    ['Email', u.email],
    ['Name', u.name],
    ['Email verified', u.emailVerified ? 'yes' : 'no'],
    ['Has password', u.hasPassword ? 'yes' : 'no'],
    ['Has reset token', u.hasResetToken ? 'yes' : 'no'],
    ['Google ID', u.googleId ?? '—'],
    ['Stripe customer ID', u.stripeCustomerId ?? '—'],
    ['Avatar URL', u.avatarUrl ?? '—'],
    ['Created at', u.createdAt ?? '—'],
  ] as Array<[string, string]>
})
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h1 class="font-display font-bold text-2xl text-charcoal-900">User detail</h1>
      <NuxtLinkLocale to="/dashboard/admin/users" class="text-sm text-charcoal-500 hover:text-charcoal-900">← Back to users</NuxtLinkLocale>
    </div>

    <UiLoadingSpinner v-if="status === 'pending'" />

    <template v-else-if="data">
      <section class="bg-ivory-100 border border-charcoal-200 rounded-2xl p-6 mb-6">
        <h2 class="font-display font-semibold text-lg text-charcoal-900 mb-4">User</h2>
        <dl class="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <div v-for="[label, value] in fields" :key="label">
            <dt class="text-charcoal-500">{{ label }}</dt>
            <dd class="text-charcoal-900 font-medium break-all">{{ value }}</dd>
          </div>
        </dl>
      </section>

      <section class="bg-ivory-100 border border-charcoal-200 rounded-2xl p-6 mb-6">
        <h2 class="font-display font-semibold text-lg text-charcoal-900 mb-4">Subscriptions</h2>
        <p v-if="!data.subscriptions.length" class="text-charcoal-500 text-sm">None.</p>
        <table v-else class="w-full text-sm">
          <thead class="text-charcoal-700 text-xs uppercase">
            <tr>
              <th class="text-left py-2">ID</th>
              <th class="text-left py-2">Stripe ID</th>
              <th class="text-left py-2">Status</th>
              <th class="text-left py-2">Price</th>
              <th class="text-left py-2">Period end</th>
              <th class="text-left py-2">Canceled at</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in data.subscriptions" :key="s.id" class="border-t border-charcoal-100">
              <td class="py-2 text-charcoal-500">{{ s.id }}</td>
              <td class="py-2 text-charcoal-700 text-xs break-all">{{ s.stripeSubscriptionId }}</td>
              <td class="py-2">{{ s.status }}</td>
              <td class="py-2">{{ s.price }}</td>
              <td class="py-2 text-charcoal-500 text-xs">{{ s.currentPeriodEnd ?? '—' }}</td>
              <td class="py-2 text-charcoal-500 text-xs">{{ s.canceledAt ?? '—' }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="bg-ivory-100 border border-charcoal-200 rounded-2xl p-6">
        <h2 class="font-display font-semibold text-lg text-charcoal-900 mb-4">Events</h2>
        <p v-if="!data.events.length" class="text-charcoal-500 text-sm">None.</p>
        <table v-else class="w-full text-sm">
          <thead class="text-charcoal-700 text-xs uppercase">
            <tr>
              <th class="text-left py-2">ID</th>
              <th class="text-left py-2">Title</th>
              <th class="text-left py-2">Date</th>
              <th class="text-left py-2">Payment</th>
              <th class="text-left py-2">Tier</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in data.events" :key="e.id" class="border-t border-charcoal-100 hover:bg-ivory-50">
              <td class="py-2 text-charcoal-500">{{ e.id }}</td>
              <td class="py-2">
                <NuxtLinkLocale :to="`/dashboard/admin/events/${e.id}`" class="text-charcoal-900 hover:underline">
                  {{ e.title }}
                </NuxtLinkLocale>
              </td>
              <td class="py-2 text-charcoal-700">{{ e.date }}</td>
              <td class="py-2">{{ e.paymentStatus }}</td>
              <td class="py-2 text-charcoal-700">{{ e.tier?.slug ?? '—' }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </template>
  </div>
</template>
