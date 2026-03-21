interface User {
  id: number
  email: string
  name: string
}

export const useAuth = () => {
  const user = useState<User | null>('auth_user', () => null)
  const loading = useState<boolean>('auth_loading', () => true)

  const fetchUser = async () => {
    try {
      const headers = import.meta.server ? useRequestHeaders(['cookie']) : {}
      const data = await $fetch<{ user: User }>('/api/auth/me', { headers })
      user.value = data.user
    } catch {
      user.value = null
    } finally {
      loading.value = false
    }
  }

  const login = async (email: string, password: string) => {
    const data = await $fetch<{ user: User }>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    })
    user.value = data.user
    return data
  }

  const register = async (email: string, password: string, name: string) => {
    const data = await $fetch<{ user: User }>('/api/auth/register', {
      method: 'POST',
      body: { email, password, name },
    })
    user.value = data.user
    return data
  }

  const logout = async () => {
    await $fetch('/api/auth/logout', { method: 'POST' })
    user.value = null
    navigateTo('/auth/login')
  }

  return { user, loading, fetchUser, login, register, logout }
}
