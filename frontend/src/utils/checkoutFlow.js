export const authReturnPath = (from, fallback = '/') => ['/checkout', '/track-order', '/orders'].includes(from) ? from : fallback
// Delivery drafts stay in tab memory, never browser storage.
let draft = null
let requestKey = ''
export const saveCheckoutDraft = (value) => { draft = value }
export const readCheckoutDraft = () => draft
export const checkoutRequestKey = () => requestKey ||= globalThis.crypto.randomUUID()
export const clearCheckoutDraft = () => { draft = null; requestKey = '' }
