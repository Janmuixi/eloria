import { requireAuth } from '../../utils/auth'
import { isAdmin } from '../../utils/admin'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      isAdmin: isAdmin(user),
    },
  }
})
