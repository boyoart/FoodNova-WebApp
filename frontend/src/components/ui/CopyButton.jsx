import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import toast from 'react-hot-toast'
import './CopyButton.css'

async function writeClipboard(value) {
  const text = String(value ?? '').trim()
  if (!text) return false

  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(text)
    return true
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  textarea.setSelectionRange(0, text.length)
  const copied = document.execCommand('copy')
  document.body.removeChild(textarea)
  return copied
}

export default function CopyButton({ value, label = 'Copy', className = '' }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      const ok = await writeClipboard(value)
      if (!ok) throw new Error('Copy failed')
      setCopied(true)
      toast.success('Copied successfully')
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Unable to copy')
    }
  }

  return (
    <button
      type="button"
      className={`copy-button ${copied ? 'copied' : ''} ${className}`.trim()}
      onClick={handleCopy}
      disabled={!String(value ?? '').trim()}
      aria-label={`${label} to clipboard`}
      title={copied ? 'Copied' : label}
    >
      {copied ? <Check size={15} /> : <Copy size={15} />}
      <span>{copied ? 'Copied' : label}</span>
    </button>
  )
}
