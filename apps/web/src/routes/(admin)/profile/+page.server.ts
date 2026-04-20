import { fail } from '@sveltejs/kit'
import { supabase } from '$lib/services/permissions.service'

export const load = async () => {
  return {}
}

export const actions = {
  updateProfile: async ({ request }) => {
    const data = await request.formData()
    const userId = data.get('user_id') as string
    const firstName = data.get('first_name') as string
    const lastName = data.get('last_name') as string
    const phone = data.get('phone') as string
    const email = data.get('email') as string

    // Update Supabase auth metadata
    await supabase.auth.admin.updateUserById(userId, {
      user_metadata: {
        full_name: `${firstName} ${lastName}`,
        phone
      }
    })

    // Get user email from auth if not provided
    let userEmail = email
    if (!userEmail) {
      const { data: { user } } = await supabase.auth.admin.getUserById(userId)
      userEmail = user?.email ?? ''
    }

    // Update or create person record — try by user_id first, then email
    const { data: byUserId } = await supabase.from('persons').select('id').eq('user_id', userId).single()
    const { data: byEmail } = !byUserId ? await supabase.from('persons').select('id').eq('email', userEmail).single() : { data: null }
    const existingId = byUserId?.id ?? byEmail?.id

    if (existingId) {
      const { error } = await supabase
        .from('persons')
        .update({ first_name: firstName, last_name: lastName, phone, user_id: userId })
        .eq('id', existingId)
      if (error) return fail(400, { error: error.message })
    } else {
      const { error } = await supabase
        .from('persons')
        .insert({ user_id: userId, first_name: firstName, last_name: lastName, email: userEmail, phone })
      if (error) return fail(400, { error: error.message })
    }

    return { success: true, message: 'Profile updated', person: { first_name: firstName, last_name: lastName, phone } }
  }
}
