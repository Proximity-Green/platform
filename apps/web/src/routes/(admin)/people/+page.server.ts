import { createClient } from '@supabase/supabase-js'
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public'
import { env } from '$env/dynamic/private'
import { fail } from '@sveltejs/kit'

function getClient() {
  const key = env.SUPABASE_SERVICE_ROLE_KEY || PUBLIC_SUPABASE_ANON_KEY
  return createClient(PUBLIC_SUPABASE_URL, key)
}

export const load = async () => {
  const supabase = getClient()
  const { data: persons, error } = await supabase
    .from('persons')
    .select('*')
    .order('last_name')
  return { persons: persons ?? [] }
}

export const actions = {
  create: async ({ request }) => {
    const supabase = getClient()
    const data = await request.formData()
    const { error } = await supabase
      .from('persons')
      .insert({
        first_name: data.get('first_name'),
        last_name: data.get('last_name'),
        email: data.get('email'),
        phone: data.get('phone'),
        job_title: data.get('job_title')
      })
    if (error) return fail(400, { error: error.message })
    return { success: true }
  },

  update: async ({ request }) => {
    const supabase = getClient()
    const data = await request.formData()
    const { error } = await supabase
      .from('persons')
      .update({
        first_name: data.get('first_name'),
        last_name: data.get('last_name'),
        phone: data.get('phone'),
        job_title: data.get('job_title')
      })
      .eq('id', data.get('id'))
    if (error) return fail(400, { error: error.message })
    return { success: true }
  },

  delete: async ({ request }) => {
    const supabase = getClient()
    const data = await request.formData()
    const { error } = await supabase
      .from('persons')
      .delete()
      .eq('id', data.get('id'))
    if (error) return fail(400, { error: error.message })
    return { success: true }
  }
}
