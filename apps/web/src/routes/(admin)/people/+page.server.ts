import { fail } from '@sveltejs/kit'
import { supabase, requirePermission, getUserIdFromRequest } from '$lib/server/permissions'

export const load = async ({ cookies }) => {
  const userId = await getUserIdFromRequest(cookies)
  if (userId) await requirePermission(userId, 'persons', 'read')

  const { data: persons } = await supabase
    .from('persons')
    .select('*')
    .order('created_at', { ascending: false })
  return { persons: persons ?? [] }
}

export const actions = {
  create: async ({ request, cookies }) => {
    const userId = await getUserIdFromRequest(cookies)
    if (userId) await requirePermission(userId, 'persons', 'create')

    const data = await request.formData()
    const { error } = await supabase.from('persons').insert({
      first_name: data.get('first_name'),
      last_name: data.get('last_name'),
      email: data.get('email'),
      phone: data.get('phone'),
      job_title: data.get('job_title'),
      created_by: userId
    })
    if (error) return fail(400, { error: error.message })
    return { success: true }
  },

  generateRandom: async ({ cookies }) => {
    const userId = await getUserIdFromRequest(cookies)
    if (userId) await requirePermission(userId, 'persons', 'create')

    const firstNames = ['Sarah', 'James', 'Thandi', 'Mohammed', 'Chen', 'Priya', 'David', 'Emma', 'Sipho', 'Maria', 'Liam', 'Aisha', 'Ravi', 'Nina', 'Oscar', 'Fatima', 'Johan', 'Leila', 'Tom', 'Zanele']
    const lastNames = ['Moyo', 'Van der Berg', 'Naidoo', 'Smith', 'Okonkwo', 'Patel', 'Khumalo', 'Johnson', 'Mbeki', 'Santos', 'Williams', 'Dlamini', 'Cohen', 'Ndlovu', 'Murphy', 'Govender', 'De Villiers', 'Abrahams', 'Botha', 'Singh']
    const titles = ['Community Manager', 'Software Developer', 'Graphic Designer', 'Marketing Manager', 'CEO', 'Freelance Writer', 'Data Analyst', 'HR Manager', 'Sales Director', 'Product Manager', 'UX Designer', 'Accountant', 'Operations Lead', 'Business Development', 'Project Manager']

    const people = Array.from({ length: 10 }, () => {
      const first = firstNames[Math.floor(Math.random() * firstNames.length)]
      const last = lastNames[Math.floor(Math.random() * lastNames.length)]
      return {
        first_name: first,
        last_name: last,
        email: `${first.toLowerCase()}.${last.toLowerCase().replace(/\s/g, '')}.${Math.floor(Math.random() * 9999)}@example.com`,
        phone: `+27${Math.floor(Math.random() * 900000000 + 100000000)}`,
        job_title: titles[Math.floor(Math.random() * titles.length)],
        created_by: userId
      }
    })

    const { error } = await supabase.from('persons').insert(people)
    if (error) return fail(400, { error: error.message })
    return { success: true }
  },

  update: async ({ request, cookies }) => {
    const userId = await getUserIdFromRequest(cookies)
    if (userId) await requirePermission(userId, 'persons', 'update')

    const data = await request.formData()
    const { error } = await supabase.from('persons').update({
      first_name: data.get('first_name'),
      last_name: data.get('last_name'),
      phone: data.get('phone'),
      job_title: data.get('job_title')
    }).eq('id', data.get('id'))
    if (error) return fail(400, { error: error.message })
    return { success: true }
  },

  delete: async ({ request, cookies }) => {
    const userId = await getUserIdFromRequest(cookies)
    if (userId) await requirePermission(userId, 'persons', 'delete')

    const data = await request.formData()
    const { error } = await supabase.from('persons').delete().eq('id', data.get('id'))
    if (error) return fail(400, { error: error.message })
    return { success: true }
  }
}
