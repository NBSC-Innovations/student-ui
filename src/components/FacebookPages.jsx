import { useState, useMemo } from 'react'
import facebookPages from '../data/facebookPages'
import '../styles/FacebookPages.css'

function SearchIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function ClearIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function groupByCategory(pages) {
  return pages.reduce((groups, page) => {
    const key = page.category || 'top'
    if (!groups[key]) groups[key] = []
    groups[key].push(page)
    return groups
  }, {})
}

function PageGrid({ pages }) {
  return (
    <div className="fb-pages__grid">
      {pages.map((page) => {
        const { id, name, url, logo } = page
        return (
          <a key={id} href={url} target="_blank" rel="noopener noreferrer" className="fb-page-card">
            <img src={logo} alt={name + ' logo'} className="fb-page-card__logo" />
            <span className="fb-page-card__name">{name}</span>
          </a>
        )
      })}
    </div>
  )
}

function FacebookPages() {
  const [query, setQuery] = useState('')

  const filteredPages = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return facebookPages
    return facebookPages.filter((page) => page.name.toLowerCase().includes(q))
  }, [query])

  const grouped = groupByCategory(filteredPages)
  const sectionOrder = ['Departments', 'Other Offices', 'Clubs & Organizations']
  const hasResults = filteredPages.length > 0

  return (
    <section className="fb-pages">
      <h2 className="fb-pages__heading">Official NBSC Facebook Pages</h2>
      <p className="fb-pages__subtext">
        Follow these pages to stay updated on announcements, events, and activities.
      </p>

      <div className="fb-pages__category-row">
        <h3 className="fb-pages__category-title">Offices</h3>
        <div className="fb-pages__search">
          <SearchIcon className="fb-pages__search-icon" />
          <input
            type="text"
            placeholder="Search pages..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="fb-pages__search-input"
          />
          {query && (
            <button
              type="button"
              className="fb-pages__search-clear"
              onClick={() => setQuery('')}
              aria-label="Clear search"
            >
              <ClearIcon />
            </button>
          )}
        </div>
      </div>

      {!hasResults ? (
        <p className="fb-pages__empty">No pages found matching "{query}".</p>
      ) : (
        <>
          {grouped.top && <PageGrid pages={grouped.top} />}

          {sectionOrder.map((category) =>
            grouped[category] ? (
              <div key={category} className="fb-pages__category">
                <h3 className="fb-pages__category-title">{category}</h3>
                <PageGrid pages={grouped[category]} />
              </div>
            ) : null
          )}
        </>
      )}
    </section>
  )
}

export default FacebookPages