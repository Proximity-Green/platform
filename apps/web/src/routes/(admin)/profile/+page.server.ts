import { fail } from '@sveltejs/kit'
import * as profileService from '$lib/services/profile.service'

export const load = async () => {
  return {}
}

export const actions = {
  updateProfile: async ({ request }) => {
    const data = await request.formData()
    const result = await profileService.updateProfile({
      userId: data.get('user_id') as string,
      firstName: data.get('first_name') as string,
      lastName: data.get('last_name') as string,
      phone: data.get('phone') as string,
      email: data.get('email') as string
    })
    if (!result.ok) return fail(400, { error: result.error })
    return { success: true, message: result.message, person: result.person }
  }
}
