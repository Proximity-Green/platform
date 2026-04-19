import { fail } from '@sveltejs/kit'
import { supabase } from '$lib/server/permissions'

export const load = async ({ locals }) => {
  const session = await locals.getSession()
  let person = null
  if (session?.user?.email) {
    const { data } = await supabase.from('persons').select('*').eq('email', session.user.email).single()
    person = data
  }
  return { person }
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

    // Get user email
    const { data: { user } } = await supabase.auth.admin.getUserById(userId)
    const email = user?.email ?? ''

    // Update or create person record
    const { data: existing } = await supabase
      .from('persons')
      .select('id')
      .eq('email', email)
      .single()

    if (existing) {
      const { error } = await supabase
        .from('persons')
        .update({ first_name: firstName, last_name: lastName, phone, user_id: userId })
        .eq('id', existing.id)
      if (error) return fail(400, { error: error.message })
    } else {
      const { error } = await supabase
        .from('persons')
        .insert({
          user_id: userId,
          first_name: firstName,
          last_name: lastName,
          email,
          phone
        })
      if (error) return fail(400, { error: error.message })
    }

    return { success: true, message: 'Profile updated' }
  }
}
