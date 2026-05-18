export default defineNuxtRouteMiddleware(async () => {
  const { user, fetchUser, loading } = useAuth()
  if (loading.value) await fetchUser()

  const localePath = useLocalePath()
  if (!user.value) return navigateTo(localePath('/auth/login'))
  if (!user.value.isAdmin) return navigateTo(localePath('/dashboard'))
})
