export const toPackFormData = (payload = {}) => {
  const formData = new FormData()
  const fields = ['name', 'price', 'description', 'is_active']

  fields.forEach((field) => {
    if (payload[field] !== undefined && payload[field] !== null) {
      formData.append(field, payload[field])
    }
  })

  if (payload.items !== undefined) {
    formData.append('items', Array.isArray(payload.items) ? JSON.stringify(payload.items) : payload.items || '[]')
  }
  if (payload.components !== undefined) {
    formData.append('components', JSON.stringify(payload.components || []))
  }

  const image = payload.image_file || payload.image_files?.[0]?.file || payload.image_files?.[0]
  if (image) formData.append('image', image)

  return formData
}