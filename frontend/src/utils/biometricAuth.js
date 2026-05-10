import { Capacitor, registerPlugin } from '@capacitor/core'

export const BIOMETRIC_KEYS = {
  enabled: 'foodnova_biometric_enabled',
  token: 'foodnova_biometric_token',
  user: 'foodnova_biometric_user',
}

const NativeBiometric = registerPlugin('NativeBiometric')
const BiometricAuth = registerPlugin('BiometricAuth')
const SecureStoragePlugin = registerPlugin('SecureStoragePlugin')

export const isNativeApp = () => {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

const setSecureValue = async (key, value) => {
  try {
    await SecureStoragePlugin.set({ key, value })
  } catch {
    localStorage.setItem(key, value)
  }
}

const getSecureValue = async (key) => {
  try {
    const result = await SecureStoragePlugin.get({ key })
    return result?.value || null
  } catch {
    return localStorage.getItem(key)
  }
}

const removeSecureValue = async (key) => {
  try {
    await SecureStoragePlugin.remove({ key })
  } catch {
    localStorage.removeItem(key)
  }
}

export const isBiometricEnabled = () => localStorage.getItem(BIOMETRIC_KEYS.enabled) === 'true'

export const setBiometricEnabled = (enabled) => {
  localStorage.setItem(BIOMETRIC_KEYS.enabled, enabled ? 'true' : 'false')
}

export const hasBiometricSession = async () => {
  if (!isBiometricEnabled()) return false
  const token = await getSecureValue(BIOMETRIC_KEYS.token)
  return Boolean(token)
}

export const getBiometricUser = async () => {
  const value = await getSecureValue(BIOMETRIC_KEYS.user)
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export const checkBiometricSupport = async () => {
  if (!isNativeApp()) {
    return { supported: false, reason: 'Biometric login is available only in the mobile app.' }
  }

  try {
    const result = await NativeBiometric.isAvailable()
    const supported = Boolean(result?.isAvailable || result?.available)
    return {
      supported,
      reason: supported ? '' : 'Biometric login is not available on this device.',
    }
  } catch {
    try {
      const result = await BiometricAuth.checkBiometry()
      const supported = Boolean(result?.isAvailable || result?.available || result?.strongBiometryIsAvailable)
      return {
        supported,
        reason: supported ? '' : 'Biometric login is not available on this device.',
      }
    } catch {
      return {
        supported: false,
        reason: 'Biometric login is not configured for this mobile build.',
      }
    }
  }
}

export const verifyBiometric = async () => {
  const support = await checkBiometricSupport()
  if (!support.supported) return support

  try {
    await NativeBiometric.verifyIdentity({
      title: 'FoodNova Biometric Login',
      subtitle: 'Unlock FoodNova faster',
      description: 'Confirm your fingerprint or face unlock to continue.',
      reason: 'Confirm your fingerprint or face unlock to continue.',
    })
    return { supported: true, success: true }
  } catch {
    try {
      await BiometricAuth.authenticate({
        reason: 'Confirm your fingerprint or face unlock to continue.',
        cancelTitle: 'Use password',
        allowDeviceCredential: true,
      })
      return { supported: true, success: true }
    } catch {
      return { supported: true, success: false }
    }
  }
}

export const saveBiometricSession = async ({ token, user }) => {
  if (!token || !user) throw new Error('Missing customer session')
  await setSecureValue(BIOMETRIC_KEYS.token, token)
  await setSecureValue(BIOMETRIC_KEYS.user, JSON.stringify({
    id: user.id,
    full_name: user.full_name || user.fullName || user.name || '',
    name: user.name || user.full_name || user.fullName || '',
    email: user.email || '',
    phone: user.phone || '',
    avatar_url: user.avatar_url || '',
  }))
  setBiometricEnabled(true)
}

export const restoreBiometricSession = async () => {
  const token = await getSecureValue(BIOMETRIC_KEYS.token)
  const user = await getBiometricUser()
  if (!token || !user) return null
  return { token, user }
}

export const clearBiometricSession = async () => {
  await removeSecureValue(BIOMETRIC_KEYS.token)
  await removeSecureValue(BIOMETRIC_KEYS.user)
  setBiometricEnabled(false)
}
