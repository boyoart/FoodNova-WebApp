import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('receipt display uses authenticated blobs for latest and historical evidence', () => {
  const page = readFileSync(new URL('../src/pages/AdminOrders.jsx', import.meta.url), 'utf8')
  const api = readFileSync(new URL('../src/services/api.js', import.meta.url), 'utf8')
  assert.match(api, /receipt-evidence/)
  assert.match(api, /responseType: 'blob'/)
  assert.match(api, /audit_log_id: auditLogId/)
  assert.match(page, /adminAPI.getReceiptEvidence\(selectedOrder.id, auditLogId\)/)
  assert.match(page, /openReceiptUrl\(\{\}, log.id\)/)
  assert.match(page, /URL.revokeObjectURL/)
  assert.doesNotMatch(page, /window.open\(resolveMediaUrl\(log.receipt_url\)/)
  assert.doesNotMatch(page, /src=\{getReceiptUrl\(selectedOrder.receipt\)\}/)
})
