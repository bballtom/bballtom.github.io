import { ageGroup, changeSummary, dateLabel, formatPlace, formatTableWhatsApp, formatWhatsApp } from './format.mjs'

const app = document.querySelector('#app')
const checked = document.querySelector('#checked')

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

function fixtureDetail(fixture) {
  if (fixture.bye) return '<p class="bye-mark">❌ Bye</p>'
  return `<p class="opponent">vs ${escapeHtml(fixture.opponent)}</p>
    <p class="place">${escapeHtml(formatPlace(fixture.hall, fixture.court))}</p>`
}

function teamCard(team, checkedAt) {
  const fixture = nextFixture(team)
  const removed = fixture.status === 'removed' ? ' removed' : ''
  return `<li><a class="team-card${fixture.bye ? ' bye' : ''}${removed}" href="#/${team.id}">
    <div class="squad"><h3>${squadName(team.name)}</h3>${pill(fixture)}</div>
    <p class="when">${whenText(fixture, checkedAt)}</p>
    ${fixtureDetail(fixture)}
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
          <tr><th>Pos</th><th>Team</th><th>P</th><th>W</th><th>L</th><th>Pts</th></tr>
        </thead>
        <tbody>
          ${table.rows.map((row) => `<tr class="${sameName(row.team, team.name) ? 'us' : ''}">
            <td>${row.position}</td>
            <td>${escapeHtml(shortTeam(row.team))}</td>
            <td>${row.played}</td>
            <td>${row.won}</td>
            <td>${row.lost}</td>
            <td>${row.points}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <p class="source">Table checked ${escapeHtml(when)}. <a href="${escapeHtml(table.sourceUrl)}">League table</a></p>
  </section>`
}

function renderTeam(data, team) {
  const allText = formatWhatsApp(team.name, team.fixtures, data.checkedAt)
  const next = nextFixture(team)
  const nextText = formatWhatsApp(team.name, next ? [next] : [], data.checkedAt)
  const table = standingsFor(team)
  const tableText = formatTableWhatsApp(team.name, table)
  const groups = [...new Set(team.fixtures.map((fixture) => ageGroup(fixture.league).label))]
  app.innerHTML = `
    <a class="back" href="#/">All teams</a>
    <section class="team-heading">
      <h2>${escapeHtml(team.name)}</h2>
      <p class="league">${escapeHtml(groups.join(' · '))}</p>
    </section>
    <ul class="fixture-list">
      ${team.fixtures.map((fixture) => {
        const note = fixture.status === 'removed' ? 'CANCELLED' : changeSummary(fixture)
        const classes = ['fixture-card', fixture.status === 'removed' ? 'removed' : '', fixture.bye ? 'bye' : ''].filter(Boolean).join(' ')
        const extra = fixture.bye
          ? ''
          : `<p class="league">${escapeHtml(fixture.division)}${fixture.division ? ' · ' : ''}${escapeHtml(fixture.league)}</p>`
        return `<li class="${classes}">
          ${note ? `<p class="note ${fixture.change?.type ?? 'removed'}">${escapeHtml(note)}</p>` : ''}
          <p class="when">${whenText(fixture, data.checkedAt)}</p>
          ${fixtureDetail(fixture)}
          ${extra}
          <p class="meta"><a href="${escapeHtml(fixture.sourceUrl)}">League page</a></p>
        </li>`
      }).join('')}
    </ul>
    ${standingsHtml(team)}
    <div class="copy-bar">
      <div class="copy-actions">
        <button class="copy" type="button" data-copy="next">Next game</button>
        <button class="copy copy-all" type="button" data-copy="all">All fixtures</button>
        ${tableText ? '<button class="copy copy-all copy-table" type="button" data-copy="table">League table</button>' : ''}
      </div>
    </div>`
  app.querySelector('[data-copy="next"]').addEventListener('click', (event) => copyText(nextText, event.currentTarget))
  app.querySelector('[data-copy="all"]').addEventListener('click', (event) => copyText(allText, event.currentTarget))
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

function show() {
  const id = location.hash.replace(/^#\/?/, '')
  const team = id ? window.__fixtures.teams.find((item) => item.id === id) : null
  if (!team) renderHome(window.__fixtures)
  else renderTeam(window.__fixtures, team)
  document.body.classList.toggle('has-copy', Boolean(team))
  const goTop = () => window.scrollTo(0, 0)
  goTop()
  requestAnimationFrame(goTop)
}

const [response, tablesResponse] = await Promise.all([
  fetch('./fixtures.json', { cache: 'no-store' }),
  fetch('./tables.json', { cache: 'no-store' }),
])
window.__tables = tablesResponse.ok ? await tablesResponse.json() : { tables: [] }
if (!response.ok) {
  checked.textContent = 'Fixtures have not been downloaded yet.'
  app.innerHTML = `<section class="empty"><h2>Run the checker first</h2><p>From the project folder, run <strong>npm run scrape</strong>, then refresh this page.</p></section>`
} else {
  window.__fixtures = await response.json()
  const when = stampLabel(window.__fixtures.changedAt || window.__fixtures.checkedAt)
  checked.textContent = when ? `Last change ${when}` : 'Fixtures loaded'
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
  show()
  window.addEventListener('hashchange', show)
}
