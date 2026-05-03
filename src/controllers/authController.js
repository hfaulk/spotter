import supabase from '../config/supabase.js'

// ===== SERVE VIEWS =====
export const serveLogin = (req, res) => {
  res.render('auth/login')
}

export const serveRegister = (req, res) => {
  res.render('auth/register')
}

// ===== EMAIL AUTH =====
export const registerUser = async (req, res) => {
  const { first_name, last_name, username, email, password } = req.body

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { first_name, last_name, username }
    }
  })

  if (error) return res.render('auth/register', { error: error.message })

  const token = data.session?.access_token
  if (token) res.cookie('access_token', token, { httpOnly: true })

  res.redirect('/dashboard')
}

export const loginUser = async (req, res) => {
  const { email, password } = req.body

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  })

  if (error) return res.render('auth/login', { error: error.message })

  res.cookie('access_token', data.session.access_token, { httpOnly: true })
  res.redirect('/dashboard')
}

// ===== GOOGLE AUTH =====
export const googleAuth = async (req, res) => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${process.env.BASE_URL}/auth/callback`
    }
  })

  if (error) return res.redirect('/login')
  res.redirect(data.url)
}

export const authCallback = async (req, res) => {
  const { code } = req.query

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) return res.redirect('/login')

  res.cookie('access_token', data.session.access_token, { httpOnly: true })
  res.redirect('/dashboard')
}

// ===== SIGN OUT =====
export const signOut = async (req, res) => {
  res.clearCookie('access_token')
  res.redirect('/login')
}
