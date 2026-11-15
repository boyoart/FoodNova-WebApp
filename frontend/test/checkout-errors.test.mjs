import assert from 'node:assert/strict'
import test from 'node:test'
import { isComboPackInventoryError } from '../src/utils/checkoutErrors.js'

test('pack inventory and configuration failures use a neutral customer message path', () => {
  assert.equal(isComboPackInventoryError({ response: { data: { detail: 'Requested quantity is currently unavailable. Please reduce the quantity.' } } }, [{ item_type: 'pack' }]), true)
  assert.equal(isComboPackInventoryError({ response: { data: { detail: 'A Combo Pack component is currently unavailable.' } } }, [{ type: 'pack' }]), true)
  assert.equal(isComboPackInventoryError({ response: { data: { detail: 'This Combo Pack is not available until its contents are configured.' } } }, [{ item_type: 'pack' }]), true)
})

test('ordinary product errors retain the existing checkout error details', () => {
  assert.equal(isComboPackInventoryError({ response: { data: { detail: 'Requested quantity is currently unavailable.' } } }, [{ item_type: 'product' }]), false)
  assert.equal(isComboPackInventoryError({ response: { data: { detail: 'Payment could not be processed.' } } }, [{ item_type: 'pack' }]), false)
})