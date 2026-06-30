export const FOODNOVA_WHATSAPP_NUMBER = "2348025801125"
export const FOODNOVA_DOMAIN = "foodnova.com.ng"
export const FOODNOVA_WEBSITE = "https://foodnova.com.ng"

export const FOODNOVA_CONTACT = {
  tagline: "Quality Food, Delivered Fresh",
  email: "support@foodnova.com.ng",
  phone: "+2348025801125",
  address: "33 Ariyo Akinloye Street, Isheri-Bucknor, Lagos, Nigeria",
  instagram: "@foodnovalimited",
  tiktok: "@foodnovalimited",
  website: FOODNOVA_WEBSITE,
}

export const FOODNOVA_SOCIAL_LINKS = {
  instagram: "https://instagram.com/foodnovalimited",
  tiktok: "https://www.tiktok.com/@foodnovalimited",
}

export const buildWhatsAppLink = (message = "") => {
  const encodedMessage = encodeURIComponent(message)
  return `https://wa.me/${FOODNOVA_WHATSAPP_NUMBER}${encodedMessage ? `?text=${encodedMessage}` : ""}`
}

export const normalizePhoneForWhatsApp = (phone = "") => {
  const digits = String(phone).replace(/\D/g, "")
  if (!digits) return FOODNOVA_WHATSAPP_NUMBER
  if (digits.startsWith("234")) return digits
  if (digits.startsWith("0")) return `234${digits.slice(1)}`
  return digits
}
