export default defineNuxtRouteMiddleware(async () => {
  const { user, fetchUser, loading } = useAuth()

  if (loading.value) {
    await fetchUser()
  }

  if (!user.value) {
    return navigateTo('/auth/login')
  }
})
