import { Capacitor } from '@capacitor/core'
import { NativeBiometric } from '@capgo/capacitor-native-biometric'

export const BIOMETRIC_KEYS = {
  enabled: 'foodnova_biometric_enabled',
  token: 'foodnova_biometric_token',
  user: 'foodnova_biometric_user',
}

const BIOMETRIC_SERVER = 'foodnova'

export const isNativeApp = () => {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

const setSecureValue = async (key, value) => {
  localStorage.setItem(key, value)
}

const getSecureValue = async (key) => {
  return localStorage.getItem(key)
}

const removeSecureValue = async (key) => {
  localStorage.removeItem(key)
}

export const isBiometricEnabled = () => localStorage.getItem(BIOMETRIC_KEYS.enabled) === 'true'

export const setBiometricEnabled = (enabled) => {
  localStorage.setItem(BIOMETRIC_KEYS.enabled, enabled ? 'true' : 'false')
}

export const hasBiometricSession = async () => {
  if (!isBiometricEnabled()) return false
  if (isNativeApp()) {
    try {
      const result = await NativeBiometric.isCredentialsSaved({ server: BIOMETRIC_SERVER })
      return Boolean(result?.isSaved)
    } catch {
      return false
    }
  }
  const token = await getSecureValue(BIOMETRIC_KEYS.token)
  return Boolean(token)
}

export const getBiometricUser = async () => {
  if (isNativeApp()) {
    try {
      const credentials = await NativeBiometric.getCredentials({ server: BIOMETRIC_SERVER })
      return parseBiometricUser(credentials?.username)
    } catch {
      return null
    }
  }

  const value = await getSecureValue(BIOMETRIC_KEYS.user)
  return parseBiometricUser(value)
}

const parseBiometricUser = (value) => {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export const checkBiometricSupport = async () => {
  const nativePlatform = isNativeApp()
  console.log('Native platform:', nativePlatform)

  if (!nativePlatform) {
    return { supported: false, reason: 'Biometric login is available only in the mobile app.' }
  }

  try {
    const result = await NativeBiometric.isAvailable({ useFallback: true })
    console.log('Biometric available:', result)
    const supported = Boolean(result?.isAvailable || result?.available)
    return {
      supported,
      reason: supported ? '' : 'Biometric login is not available on this device.',
    }
  } catch (error) {
    console.log('Biometric available:', { isAvailable: false, error })
    return {
      supported: false,
      reason: 'Biometric login is not available on this device.',
    }
  }
}

export const verifyBiometric = async (options = {}) => {
  const support = await checkBiometricSupport()
  if (!support.supported) return support

  try {
    await NativeBiometric.verifyIdentity({
      title: 'FoodNova Biometric Login',
      subtitle: 'Verify your identity',
      description: 'Use fingerprint or face unlock',
      reason: 'Enable biometric login for FoodNova',
      useFallback: true,
      ...options,
    })
    return { supported: true, success: true }
  } catch {
    return { supported: true, success: false }
  }
}

export const saveBiometricSession = async ({ token, user }) => {
  if (!token || !user) throw new Error('Missing customer session')
  const biometricUser = {
    id: user.id,
    full_name: user.full_name || user.fullName || user.name || '',
    name: user.name || user.full_name || user.fullName || '',
    email: user.email || '',
    phone: user.phone || '',
    avatar_url: user.avatar_url || '',
  }

  if (isNativeApp()) {
    await NativeBiometric.setCredentials({
      username: JSON.stringify(biometricUser),
      password: token,
      server: BIOMETRIC_SERVER,
    })
  } else {
    await setSecureValue(BIOMETRIC_KEYS.token, token)
    await setSecureValue(BIOMETRIC_KEYS.user, JSON.stringify(biometricUser))
  }

  setBiometricEnabled(true)
}

export const restoreBiometricSession = async () => {
  if (isNativeApp()) {
    const credentials = await NativeBiometric.getCredentials({ server: BIOMETRIC_SERVER })
    const token = credentials?.password
    const user = parseBiometricUser(credentials?.username)
    if (!token || !user) return null
    return { token, user }
  }

  const token = await getSecureValue(BIOMETRIC_KEYS.token)
  const user = await getBiometricUser()
  if (!token || !user) return null
  return { token, user }
}

export const clearBiometricSession = async () => {
  if (isNativeApp()) {
    await NativeBiometric.deleteCredentials({ server: BIOMETRIC_SERVER }).catch(() => null)
  } else {
    await removeSecureValue(BIOMETRIC_KEYS.token)
    await removeSecureValue(BIOMETRIC_KEYS.user)
  }
  setBiometricEnabled(false)
}
