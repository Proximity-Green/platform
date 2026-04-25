import { supabase } from '$lib/services/permissions.service'

export type ServiceResult =
  | { ok: true; message: string; person: { first_name: string; last_name: string; phone: string } }
  | { ok: false; error: string }

export type ProfileUpdate = {
  userId: string
  firstName: string
  lastName: string
  phone: string
  email: string
}

export async function updateProfile(input: ProfileUpdate): Promise<ServiceResult> {
  const { userId, firstName, lastName, phone, email } = input

  await supabase.auth.admin.updateUserById(userId, {
    user_metadata: {
      full_name: `${firstName} ${lastName}`,
      phone
    }
  })

  let userEmail = email
  if (!userEmail) {
    const { data: { user } } = await supabase.auth.admin.getUserById(userId)
    userEmail = user?.email ?? ''
  }

  // Find existing person by user_id, fall back to matching by email (first-login migration path).
  const { data: byUserId } = await supabase.from('persons').select('id').eq('user_id', userId).is('deleted_at', null).single()
  const { data: byEmail } = !byUserId ? await supabase.from('persons').select('id').eq('email', userEmail).is('deleted_at', null).single() : { data: null }
  const existingId = byUserId?.id ?? byEmail?.id

  if (existingId) {
    const { error } = await supabase
      .from('persons')
      .update({ first_name: firstName, last_name: lastName, phone, user_id: userId })
      .eq('id', existingId)
    if (error) return { ok: false, error: error.message }
  } else {
    const { error } = await supabase
      .from('persons')
      .insert({ user_id: userId, first_name: firstName, last_name: lastName, email: userEmail, phone })
    if (error) return { ok: false, error: error.message }
  }

  return {
    ok: true,
    message: 'Profile updated',
    person: { first_name: firstName, last_name: lastName, phone }
  }
}
