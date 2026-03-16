/**
 * QuoteWidget — displays a random motivational quote with a refresh button.
 *
 * This component manages its OWN state (independent of the parent).
 * It fetches a quote on mount and when the refresh button is clicked.
 */

import { useState, useEffect } from 'react'
import { getQuote } from '../api'

export default function QuoteWidget() {
  const [quote, setQuote] = useState(null)

  const fetchQuote = async () => {
    try {
      const q = await getQuote()
      setQuote(q)
    } catch (e) {
      console.error('Failed to fetch quote:', e)
    }
  }

  useEffect(() => { fetchQuote() }, [])

  if (!quote) return null

  return (
    <div className="quote-card">
      <div className="quote-text">
        "{quote.text}"
        <div className="quote-author">— {quote.author}</div>
      </div>
      <button className="quote-refresh" onClick={fetchQuote} title="New quote">
        ↻
      </button>
    </div>
  )
}
