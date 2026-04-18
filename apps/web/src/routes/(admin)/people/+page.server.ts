import { supabase } from '$lib/supabase'
import { fail } from '@sveltejs/kit'

export const load = async () => {
  const { data: persons, error } = await supabase
    .from('persons')
    .select('*')
    .order('last_name')
  return { persons: persons ?? [] }
}

export const actions = {
  create: async ({ request }) => {
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
    const data = await request.formData()
    const { error } = await supabase
      .from('persons')
      .delete()
      .eq('id', data.get('id'))
    if (error) return fail(400, { error: error.message })
    return { success: true }
  }
}
