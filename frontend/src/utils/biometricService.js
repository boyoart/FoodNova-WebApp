import { Capacitor } from '@capacitor/core';
import { NativeBiometric } from '@capgo/capacitor-native-biometric';

const BIOMETRIC_SERVER = 'foodnova';
const BIOMETRIC_ENABLED_KEY = 'foodnova_biometric_enabled';
const BIOMETRIC_USER_KEY = 'foodnova_biometric_user';

export function isNativeMobileApp() {
  try {
    return Capacitor.isNativePlatform();
  } catch (error) {
    console.warn('[FoodNova Biometrics] Native platform check failed:', error);
    return false;
  }
}

export async function checkBiometricAvailability() {
  const native = isNativeMobileApp();

  console.log('[FoodNova Biometrics] Native platform:', native);

  if (!native) {
    return {
      native: false,
      available: false,
      status: 'web',
      message: 'Biometric login is available only in the FoodNova mobile app.',
      raw: null,
    };
  }

  try {
    const result = await NativeBiometric.isAvailable();

    console.log(
      '[FoodNova Biometrics] NativeBiometric.isAvailable result:',
      JSON.stringify(result),
      result
    );

    if (result && result.isAvailable) {
      return {
        native: true,
        available: true,
        status: 'available',
        message: 'Biometric login is available on this device.',
        raw: result,
      };
    }

    return {
      native: true,
      available: false,
      status: 'unavailable',
      message:
        'Please enable fingerprint, face unlock, or screen lock on this phone first.',
      raw: result,
    };
  } catch (error) {
    const errorDetails = {
      message: error?.message,
      code: error?.code,
      name: error?.name,
      stack: error?.stack,
      raw: String(error),
    };

    console.error('[FoodNova Biometrics] FULL ERROR:', errorDetails, error);

    return {
      native: true,
      available: false,
      status: 'error',
      message: 'Unable to check biometric availability on this device.',
      errorDetails,
      raw: error,
    };
  }
}

export function isBiometricEnabledLocally() {
  return localStorage.getItem(BIOMETRIC_ENABLED_KEY) === 'true';
}

export function getBiometricUser() {
  try {
    const raw = localStorage.getItem(BIOMETRIC_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function hasSavedBiometricCredentials() {
  if (!isNativeMobileApp()) return false;
  if (!isBiometricEnabledLocally()) return false;

  try {
    const credentials = await NativeBiometric.getCredentials({
      server: BIOMETRIC_SERVER,
    });

    return !!credentials?.password;
  } catch (error) {
    console.warn('[FoodNova Biometrics] No saved biometric credentials:', error);
    return false;
  }
}

export async function enableBiometricLogin({ token, user }) {
  if (!isNativeMobileApp()) {
    throw new Error('Biometric login is available only in the FoodNova mobile app.');
  }

  if (!token) {
    throw new Error('No customer session token found. Please log in again.');
  }

  if (!user) {
    throw new Error('No customer profile found. Please log in again.');
  }

  const availability = await checkBiometricAvailability();

  if (!availability.available) {
    throw new Error(availability.message);
  }

  await NativeBiometric.verifyIdentity({
    reason: 'Enable biometric login for FoodNova',
    title: 'FoodNova Biometric Login',
    subtitle: 'Verify your identity',
    description: 'Use fingerprint or face unlock to enable biometric login',
    negativeButtonText: 'Cancel',
    useFallback: true,
  });

  const username = String(
    user.email ||
    user.phone ||
    user.id ||
    user.name ||
    'foodnova_customer'
  );

  await NativeBiometric.setCredentials({
    username,
    password: String(token),
    server: BIOMETRIC_SERVER,
  });

  localStorage.setItem(BIOMETRIC_ENABLED_KEY, 'true');
  localStorage.setItem(BIOMETRIC_USER_KEY, JSON.stringify(user));

  return true;
}

export async function restoreBiometricLogin() {
  if (!isNativeMobileApp()) {
    throw new Error('Biometric login is available only in the FoodNova mobile app.');
  }

  if (!isBiometricEnabledLocally()) {
    throw new Error('Biometric login is not enabled.');
  }

  const availability = await checkBiometricAvailability();

  if (!availability.available) {
    throw new Error(availability.message);
  }

  await NativeBiometric.verifyIdentity({
    reason: 'Login to FoodNova',
    title: 'FoodNova Biometric Login',
    subtitle: 'Verify your identity',
    description: 'Use fingerprint or face unlock to continue',
    negativeButtonText: 'Use Password',
    useFallback: true,
  });

  const credentials = await NativeBiometric.getCredentials({
    server: BIOMETRIC_SERVER,
  });

  if (!credentials?.password) {
    throw new Error('No biometric session found. Please log in normally.');
  }

  return {
    token: credentials.password,
    user: getBiometricUser(),
  };
}

export async function disableBiometricLogin() {
  try {
    if (isNativeMobileApp()) {
      await NativeBiometric.deleteCredentials({
        server: BIOMETRIC_SERVER,
      });
    }
  } catch (error) {
    console.warn('[FoodNova Biometrics] Failed to delete biometric credentials:', error);
  }

  localStorage.removeItem(BIOMETRIC_ENABLED_KEY);
  localStorage.removeItem(BIOMETRIC_USER_KEY);

  return true;
}
