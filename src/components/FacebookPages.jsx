import facebookPages from '../data/facebookPages'
import '../styles/FacebookPages.css'

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
  const grouped = groupByCategory(facebookPages)
  const sectionOrder = ['Departments', 'Clubs & Organizations']

  return (
    <section className="fb-pages">
      <h2 className="fb-pages__heading">Official NBSC Facebook Pages</h2>
      <p className="fb-pages__subtext">
        Follow these pages to stay updated on announcements, events, and activities.
      </p>

      {/* Top priority pages — no heading */}
      {grouped.top && <PageGrid pages={grouped.top} />}

      {/* Labeled sections below */}
      {sectionOrder.map((category) =>
        grouped[category] ? (
          <div key={category} className="fb-pages__category">
            <h3 className="fb-pages__category-title">{category}</h3>
            <PageGrid pages={grouped[category]} />
          </div>
        ) : null
      )}
    </section>
  )
}

export default FacebookPages