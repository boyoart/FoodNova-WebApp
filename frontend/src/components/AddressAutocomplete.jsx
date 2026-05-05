import { useEffect, useRef, useState } from 'react'

let googleMapsScriptPromise = null

const getAddressPart = (components = [], type) => {
  const match = components.find((component) => component.types?.includes(type))
  return match?.long_name || ''
}

const buildAddressPayload = (place) => {
  const components = place?.address_components || []
  const streetNumber = getAddressPart(components, 'street_number')
  const route = getAddressPart(components, 'route')
  const locality =
    getAddressPart(components, 'locality') ||
    getAddressPart(components, 'postal_town') ||
    getAddressPart(components, 'administrative_area_level_2')
  const state = getAddressPart(components, 'administrative_area_level_1')
  const country = getAddressPart(components, 'country') || 'Nigeria'
  const postalCode = getAddressPart(components, 'postal_code')
  const sublocality =
    getAddressPart(components, 'sublocality') ||
    getAddressPart(components, 'sublocality_level_1') ||
    getAddressPart(components, 'neighborhood')
  const lga = getAddressPart(components, 'administrative_area_level_2')

  const street = [streetNumber, route].filter(Boolean).join(' ')
  const formatted = place?.formatted_address || [street, locality, state, country].filter(Boolean).join(', ')
  const location = place?.geometry?.location

  return {
    address_line: formatted,
    street: street || route || sublocality || '',
    area: sublocality || '',
    city: locality || sublocality || '',
    lga: lga || '',
    state: state || '',
    country,
    postal_code: postalCode || '',
    google_place_id: place?.place_id || '',
    latitude: location?.lat ? location.lat() : null,
    longitude: location?.lng ? location.lng() : null,
  }
}

const loadGoogleMapsScript = (apiKey) => {
  if (window.google?.maps?.places) return Promise.resolve(window.google)
  if (googleMapsScriptPromise) return googleMapsScriptPromise

  googleMapsScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-foodnova-google-places="true"]')
    if (existing) {
      existing.addEventListener('load', () => resolve(window.google))
      existing.addEventListener('error', reject)
      return
    }

    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`
    script.async = true
    script.defer = true
    script.dataset.foodnovaGooglePlaces = 'true'
    script.onload = () => resolve(window.google)
    script.onerror = reject
    document.head.appendChild(script)
  })

  return googleMapsScriptPromise
}

export default function AddressAutocomplete({ onSelect, label = 'Search Address with Google', placeholder = 'Start typing your delivery address...' }) {
  const inputRef = useRef(null)
  const autocompleteRef = useRef(null)
  const [status, setStatus] = useState('idle')
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

  useEffect(() => {
    if (!apiKey || !inputRef.current) return undefined

    let active = true
    setStatus('loading')

    loadGoogleMapsScript(apiKey)
      .then((google) => {
        if (!active || !inputRef.current) return
        autocompleteRef.current = new google.maps.places.Autocomplete(inputRef.current, {
          componentRestrictions: { country: ['ng'] },
          fields: ['address_components', 'formatted_address', 'geometry', 'place_id', 'name'],
          types: ['geocode'],
        })

        autocompleteRef.current.addListener('place_changed', () => {
          const place = autocompleteRef.current.getPlace()
          if (!place?.formatted_address && !place?.address_components) return
          onSelect(buildAddressPayload(place), place)
        })
        setStatus('ready')
      })
      .catch((error) => {
        console.error('Google Places failed to load', error)
        setStatus('error')
      })

    return () => {
      active = false
    }
  }, [apiKey, onSelect])

  if (!apiKey) {
    return null
  }

  return (
    <div className="address-autocomplete-field">
      <label>{label}</label>
      <input ref={inputRef} type="text" placeholder={placeholder} autoComplete="off" />
      {status === 'loading' && <small>Loading Google address search...</small>}
      {status === 'ready' && <small>Select an address, then review/edit the fields below.</small>}
      {status === 'error' && <small>Google address search could not load. Please enter the address manually.</small>}
    </div>
  )
}
