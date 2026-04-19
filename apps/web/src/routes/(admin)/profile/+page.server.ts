import { fail } from '@sveltejs/kit'
import { supabase } from '$lib/server/permissions'

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

    // Update Supabase auth metadata
    await supabase.auth.admin.updateUserById(userId, {
      user_metadata: {
        full_name: `${firstName} ${lastName}`,
        phone
      }
    })

    // Update or create person record linked to this user
    const { data: existing } = await supabase
      .from('persons')
      .select('id')
      .eq('user_id', userId)
      .single()

    if (existing) {
      const { error } = await supabase
        .from('persons')
        .update({ first_name: firstName, last_name: lastName, phone })
        .eq('user_id', userId)
      if (error) return fail(400, { error: error.message })
    } else {
      // Check if person exists by email and link them
      const { data: { user } } = await supabase.auth.admin.getUserById(userId)
      const { data: personByEmail } = await supabase
        .from('persons')
        .select('id')
        .eq('email', user?.email ?? '')
        .single()

      if (personByEmail) {
        const { error } = await supabase
          .from('persons')
          .update({ user_id: userId, first_name: firstName, last_name: lastName, phone })
          .eq('id', personByEmail.id)
        if (error) return fail(400, { error: error.message })
      } else {
        const { error } = await supabase
          .from('persons')
          .insert({
            user_id: userId,
            first_name: firstName,
            last_name: lastName,
            email: user?.email ?? '',
            phone
          })
        if (error) return fail(400, { error: error.message })
      }
    }

    return { success: true, message: 'Profile updated' }
  }
}
