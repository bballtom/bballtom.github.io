import { ageGroup, changeSummary, dateLabel, formatPlace, formatTableWhatsApp, formatWhatsApp, meetingsAgainst, recentResults } from './format.mjs'

const app = document.querySelector('#app')
const checked = document.querySelector('#checked')
const adminSwitch = document.querySelector('#admin')
const ADMIN_KEY = 'vikings-team-admin'

function teamAdmin() {
  try {
    return localStorage.getItem(ADMIN_KEY) === '1'
  } catch {
    return false
  }
}

function setTeamAdmin(on) {
  try {
    localStorage.setItem(ADMIN_KEY, on ? '1' : '0')
  } catch {
    // A private browser can refuse storage. The switch still works for this visit.
  }
  adminSwitch.setAttribute('aria-checked', on ? 'true' : 'false')
}

function stampLabel(stamp) {
  if (!stamp) return ''
  const [date, time] = stamp.split('T')
  return `${dateLabel(date, stamp)}, ${time}`
}

function pill(fixture) {
  if (fixture.status === 'removed') return '<span class="pill removed">Cancelled</span>'
  if (!fixture.change) return ''
  const labels = { new: 'New', updated: 'Changed', moved: 'Moved', removed: 'Cancelled' }
  return `<span class="pill ${fixture.change.type}">${labels[fixture.change.type] ?? 'Changed'}</span>`
}

function nextFixture(team) {
  return team.fixtures[0]
}

function groupsFor(teams) {
  const groups = new Map()
  for (const team of teams) {
    const leagues = [...new Set(team.fixtures.map((fixture) => fixture.league).filter(Boolean))]
    const seen = new Set()
    for (const league of leagues.length ? leagues : ['']) {
      const group = ageGroup(league)
      if (seen.has(group.label)) continue
      seen.add(group.label)
      if (!groups.has(group.label)) groups.set(group.label, { ...group, teams: [] })
      const inGroup = team.fixtures.filter((fixture) => ageGroup(fixture.league || '').label === group.label)
      groups.get(group.label).teams.push({ ...team, fixtures: inGroup.length ? inGroup : team.fixtures })
    }
  }
  return [...groups.values()]
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
    .map((group) => ({
      ...group,
      teams: group.teams.sort((a, b) => a.name.localeCompare(b.name)),
    }))
}

function whenText(fixture, checkedAt) {
  const day = dateLabel(fixture.date, checkedAt)
  return fixture.bye || !fixture.time ? day : `${day}, ${fixture.time}`
}

function fixtureDetail(fixture, record = '') {
  if (fixture.bye) return '<p class="bye-mark">❌ Bye</p>'
  return `<p class="opponent">vs ${escapeHtml(fixture.opponent)}</p>
    ${record}
    <p class="place">${escapeHtml(formatPlace(fixture.hall, fixture.court))}</p>`
}

function teamCard(team, checkedAt) {
  const fixture = nextFixture(team)
  const removed = fixture.status === 'removed' ? ' removed' : ''
  const record = fixture.bye ? '' : recordHtml(team.id, fixture.opponent)
  return `<li><a class="team-card${fixture.bye ? ' bye' : ''}${removed}" href="#/${team.id}">
    <div class="squad"><h3>${squadName(team.name)}</h3>${pill(fixture)}</div>
    <p class="when">${whenText(fixture, checkedAt)}</p>
    ${fixtureDetail(fixture, record)}
  </a></li>`
}

function renderHome(data) {
  const teams = data.teams ?? []
  const upcoming = teams.flatMap((team) => team.fixtures.filter((fixture) => fixture.status !== 'removed'))
  const byes = upcoming.filter((fixture) => fixture.bye).length
  const games = upcoming.length - byes
  if (teams.length === 0) {
    app.innerHTML = `<section class="empty"><h2>No fixtures posted yet</h2><p>Nothing for Tameside Vikings is on the league page right now.</p></section>`
    return
  }
  const groups = groupsFor(teams)
  app.innerHTML = `
    <p class="summary">${teams.length} teams, ${games} upcoming games${byes ? `, ${byes} ${byes === 1 ? 'bye' : 'byes'}` : ''}</p>
    ${groups.map((group) => `
      <section class="age-group">
        <h2>${escapeHtml(group.label)}</h2>
        <ul class="team-list">
          ${group.teams.map((team) => teamCard(team, data.checkedAt)).join('')}
        </ul>
      </section>
    `).join('')}
    <p class="source">Games that have already started are left off. <a href="https://www.sportforallcentres.co.uk/basketball/stockport-basketball-fixtures/">League source</a></p>`
}

function sameName(left, right) {
  const norm = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  return norm(left) === norm(right)
}

function shortTeam(name) {
  return String(name ?? '').replace(/^Tameside Vikings\s+/i, '')
}

function standingsFor(team) {
  const tables = window.__tables?.tables ?? []
  return tables.find((table) => table.rows.some((row) => sameName(row.team, team.name)))
}

function countCell(value) {
  return value == null || value === '' ? '–' : value
}

function standingsHtml(team) {
  const table = standingsFor(team)
  if (!table) return ''
  const when = stampLabel(window.__tables?.checkedAt)
  return `<section class="standings">
    <h2>${escapeHtml(table.division || 'League table')}</h2>
    <p class="league">${escapeHtml(table.league)}</p>
    <div class="standings-wrap">
      <table>
        <thead>
          <tr>
            <th class="pos" aria-label="Position"></th><th>Team</th><th>P</th><th>W</th>
            <th title="Drawn">D</th><th>L</th>
            <th title="Byes">Bye</th><th title="Walkovers">W/O</th><th>Pts</th>
          </tr>
        </thead>
        <tbody>
          ${table.rows.map((row) => `<tr class="${sameName(row.team, team.name) ? 'us' : ''}">
            <td>${row.position}</td>
            <td>${escapeHtml(shortTeam(row.team))}</td>
            <td>${countCell(row.played)}</td>
            <td>${countCell(row.won)}</td>
            <td>${countCell(row.drawn)}</td>
            <td>${countCell(row.lost)}</td>
            <td>${countCell(row.byes)}</td>
            <td>${countCell(row.walkovers)}</td>
            <td>${countCell(row.points)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <p class="source">Last checked ${escapeHtml(when)}. <a href="${escapeHtml(table.sourceUrl)}">League table</a></p>
  </section>`
}

function route() {
  const [id = '', section = ''] = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  const tab = section === 'league' || section === 'results' ? section : 'fixtures'
  return { id, tab }
}

function tabBar(team, tab) {
  const tabs = [
    ['fixtures', 'Fixtures', `#/${team.id}`],
    ['league', 'League', `#/${team.id}/league`],
    ['results', 'Results', `#/${team.id}/results`],
  ]
  return `<nav class="tabs" aria-label="Squad">
    ${tabs.map(([key, label, href]) => `<a href="${href}"${key === tab ? ' class="on" aria-current="page"' : ''}>${label}</a>`).join('')}
  </nav>`
}

function pillsHtml(rows) {
  const words = { win: 'Won', loss: 'Lost', draw: 'Drew' }
  const letters = { win: 'W', loss: 'L', draw: 'D' }
  return rows.map((row) => {
    const word = words[row.outcome] ?? 'Played'
    const letter = letters[row.outcome] ?? '?'
    return `<span class="blob ${escapeHtml(row.outcome)}" title="${word} ${row.teamScore}–${row.opponentScore}">${letter}</span>`
  }).join('')
}

function recordRow(label, rows) {
  if (!rows.length) return ''
  const words = { win: 'Won', loss: 'Lost', draw: 'Drew' }
  const spoken = rows.map((row) => words[row.outcome] ?? 'Played').join(', ')
  return `<p class="record" aria-label="${escapeHtml(label)}: ${spoken}">
    <span class="record-label">${escapeHtml(label)}</span>
    ${pillsHtml(rows)}
  </p>`
}

function recordHtml(teamId, opponent) {
  const recent = recordRow('Last 5 games', recentResults(window.__results?.results, teamId))
  const against = recordRow('Next opponent', meetingsAgainst(window.__results?.results, teamId, opponent))
  if (!recent && !against) return ''
  return `<div class="records">${recent}${against}</div>`
}

function resultTally(rows) {
  const counts = { win: 0, draw: 0, loss: 0 }
  for (const row of rows) if (counts[row.outcome] != null) counts[row.outcome] += 1
  const parts = []
  if (counts.win) parts.push(`${counts.win} ${counts.win === 1 ? 'win' : 'wins'}`)
  if (counts.draw) parts.push(`${counts.draw} ${counts.draw === 1 ? 'draw' : 'draws'}`)
  if (counts.loss) parts.push(`${counts.loss} ${counts.loss === 1 ? 'loss' : 'losses'}`)
  return parts.join(' · ')
}

function currentSeasonLabel() {
  const labels = new Set()
  for (const team of window.__fixtures?.teams ?? []) {
    for (const fixture of team.fixtures ?? []) {
      if (fixture.season) labels.add(fixture.season)
    }
  }
  return [...labels].find((label) => /summer/i.test(label))
    || [...labels].find((label) => /winter/i.test(label))
    || ''
}

function resultGroups(rows) {
  const present = currentSeasonLabel()
  const groups = new Map()
  for (const row of rows) {
    const season = row.season || 'Results'
    if (!groups.has(season)) groups.set(season, [])
    groups.get(season).push(row)
  }
  return [...groups.entries()]
    .map(([season, list]) => ({
      season,
      rows: list.sort((a, b) => b.date.localeCompare(a.date) || String(b.time).localeCompare(String(a.time))),
    }))
    .sort((a, b) => {
      if (a.season === present) return -1
      if (b.season === present) return 1
      return (b.rows[0]?.date ?? '').localeCompare(a.rows[0]?.date ?? '')
    })
}

function resultWhen(row) {
  const day = dateLabel(row.date, window.__results?.checkedAt || window.__fixtures?.checkedAt)
  return row.time ? `${day}, ${row.time}` : day
}

function fixturesPanel(data, team) {
  return `<ul class="fixture-list">
    ${team.fixtures.map((fixture, index) => {
      const note = fixture.status === 'removed' ? 'CANCELLED' : changeSummary(fixture)
      const classes = ['fixture-card', fixture.status === 'removed' ? 'removed' : '', fixture.bye ? 'bye' : ''].filter(Boolean).join(' ')
      const extra = fixture.bye
        ? ''
        : `<p class="league">${escapeHtml(fixture.division)}${fixture.division ? ' · ' : ''}${escapeHtml(fixture.league)}</p>`
      const record = index === 0 && !fixture.bye ? recordHtml(team.id, fixture.opponent) : ''
      return `<li class="${classes}">
        ${note ? `<p class="note ${fixture.change?.type ?? 'removed'}">${escapeHtml(note)}</p>` : ''}
        <p class="when">${whenText(fixture, data.checkedAt)}</p>
        ${fixtureDetail(fixture, record)}
        ${extra}
        <p class="meta"><a href="${escapeHtml(fixture.sourceUrl)}">League page</a></p>
      </li>`
    }).join('')}
  </ul>`
}

function resultsPanel(team) {
  const rows = (window.__results?.results ?? []).filter((row) => row.teamId === team.id)
  if (!rows.length) {
    return `<section class="empty"><h2>No results yet</h2><p>Played games will show here once they are published.</p></section>`
  }
  const when = stampLabel(window.__results?.checkedAt)
  return `${resultGroups(rows).map((group) => `
    <section class="result-season">
      <h2>${escapeHtml(group.season)}</h2>
      <p class="result-tally">${escapeHtml(resultTally(group.rows))}</p>
      <ul class="result-list">
        ${group.rows.map((row) => `<li class="result ${escapeHtml(row.outcome)}">
          <span class="blob ${escapeHtml(row.outcome)}" aria-label="${row.outcome === 'win' ? 'Won' : row.outcome === 'loss' ? 'Lost' : 'Drew'}">${row.outcome === 'win' ? 'W' : row.outcome === 'loss' ? 'L' : 'D'}</span>
          <div>
            <p class="when">${escapeHtml(resultWhen(row))}</p>
            <p class="opponent">vs ${escapeHtml(row.opponent)}</p>
            ${row.division ? `<p class="league">${escapeHtml(row.division)}</p>` : ''}
          </div>
          <p class="score">${row.teamScore}–${row.opponentScore}</p>
        </li>`).join('')}
      </ul>
    </section>`).join('')}
    ${when ? `<p class="source">Last checked ${escapeHtml(when)}.</p>` : ''}`
}

function renderTeam(data, team, tab) {
  const allText = formatWhatsApp(team.name, team.fixtures, data.checkedAt)
  const next = nextFixture(team)
  const nextText = formatWhatsApp(team.name, next ? [next] : [], data.checkedAt)
  const table = standingsFor(team)
  const tableText = formatTableWhatsApp(team.name, table)
  const groups = [...new Set(team.fixtures.map((fixture) => ageGroup(fixture.league).label))]
  const panel = tab === 'league'
    ? (standingsHtml(team) || `<section class="empty"><h2>No league table yet</h2><p>This squad is not on a published table right now.</p></section>`)
    : tab === 'results'
      ? resultsPanel(team)
      : fixturesPanel(data, team)
  const copies = !teamAdmin()
    ? ''
    : tab === 'fixtures'
      ? `<button class="copy" type="button" data-copy="next">Next game</button>
       <button class="copy copy-all" type="button" data-copy="all">All fixtures</button>`
      : tab === 'league' && tableText
        ? '<button class="copy" type="button" data-copy="table">League table</button>'
        : ''
  app.innerHTML = `
    <a class="back" href="#/">All teams</a>
    <section class="team-heading">
      <h2>${escapeHtml(team.name)}</h2>
      <p class="league">${escapeHtml(groups.join(' · '))}</p>
    </section>
    ${tabBar(team, tab)}
    ${panel}
    ${copies ? `<div class="copy-bar"><div class="copy-actions${tab === 'league' ? ' single' : ''}">${copies}</div></div>` : ''}`
  app.querySelector('[data-copy="next"]')?.addEventListener('click', (event) => copyText(nextText, event.currentTarget))
  app.querySelector('[data-copy="all"]')?.addEventListener('click', (event) => copyText(allText, event.currentTarget))
  app.querySelector('[data-copy="table"]')?.addEventListener('click', (event) => copyText(tableText, event.currentTarget))
}

function squadName(full) {
  return escapeHtml(full.replace(/^Tameside Vikings\s+/i, ''))
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char])
}

async function copyText(text, button) {
  const label = button.textContent
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const area = document.createElement('textarea')
    area.value = text
    document.body.appendChild(area)
    area.select()
    document.execCommand('copy')
    area.remove()
  }
  button.textContent = 'Copied'
  setTimeout(() => {
    button.textContent = label
  }, 1600)
}

function show({ scroll = true } = {}) {
  const { id, tab } = route()
  const team = id ? window.__fixtures.teams.find((item) => item.id === id) : null
  if (!team) renderHome(window.__fixtures)
  else renderTeam(window.__fixtures, team, tab)
  const stamp = !team || tab === 'fixtures'
    ? window.__fixtures?.checkedAt
    : tab === 'league'
      ? window.__tables?.checkedAt
      : window.__results?.checkedAt
  const when = stampLabel(stamp)
  checked.textContent = when ? `Last checked ${when}` : 'Not checked yet'
  document.body.classList.toggle('has-copy', Boolean(app.querySelector('.copy-bar')))
  if (!scroll) return
  const goTop = () => window.scrollTo(0, 0)
  goTop()
  requestAnimationFrame(goTop)
}

setTeamAdmin(teamAdmin())
adminSwitch.addEventListener('click', () => {
  setTeamAdmin(!teamAdmin())
  if (window.__fixtures) show({ scroll: false })
})

const [response, tablesResponse, resultsResponse] = await Promise.all([
  fetch('./fixtures.json', { cache: 'no-store' }),
  fetch('./tables.json', { cache: 'no-store' }),
  fetch('./results.json', { cache: 'no-store' }),
])
window.__tables = tablesResponse.ok ? await tablesResponse.json() : { tables: [] }
window.__results = resultsResponse.ok ? await resultsResponse.json() : { results: [] }
if (!response.ok) {
  checked.textContent = 'Fixtures have not been downloaded yet.'
  app.innerHTML = `<section class="empty"><h2>Run the checker first</h2><p>From the project folder, run <strong>npm run scrape</strong>, then refresh this page.</p></section>`
} else {
  window.__fixtures = await response.json()
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
  show()
  window.addEventListener('hashchange', show)
}
