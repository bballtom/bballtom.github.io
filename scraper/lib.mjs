import { load } from 'cheerio'

export function clean(text) {
  return String(text ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
}

export function norm(name) {
  return clean(name).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function displayTeam(raw) {
  const cleaned = clean(raw)
  const match = cleaned.match(/tameside\s*vikings\s*[-–—]?\s*(.+)$/i)
  if (!match) return cleaned
  const squad = match[1].replace(/^[-–—]\s*/, '').trim()
  return squad ? `Tameside Vikings ${squad}` : cleaned
}

export function teamSlug(display) {
  return display
    .replace(/^tameside vikings\s+/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

const MONTHS = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
}

export function parseSeason(label) {
  const match = clean(label).match(/(Winter|Summer)\s+Season\s+(\d{2})/i)
  if (!match) return { kind: null, year: null, label: '' }
  const word = match[1].toLowerCase()
  const labelText = `${word[0].toUpperCase()}${word.slice(1)} Season ${match[2]}`
  return { kind: word, year: 2000 + Number(match[2]), label: labelText }
}

export function leagueName(label, seasonLabel) {
  const text = clean(label)
  if (!seasonLabel) return text
  return clean(text.replace(new RegExp(`\\s*-\\s*${seasonLabel}$`, 'i'), '')) || text
}

export function inferIsoDate(dateText, season) {
  const match = clean(dateText).match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)/i)
  if (!match || !season?.year) return null
  const day = Number(match[1])
  const month = MONTHS[match[2].toLowerCase()]
  if (month == null || day < 1 || day > 31) return null
  const year = season.kind === 'winter' && month < 8 ? season.year + 1 : season.year
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function parseCourt(raw, defaultHall) {
  const text = clean(raw).replace(/\|\s*$/, '').trim()
  if (!text) return { court: '', hall: defaultHall }

  const numbered = text.match(/^Court\s+(\d+)\s*(.*)$/i)
  if (numbered) {
    const hall = clean(numbered[2])
    return { court: numbered[1], hall: hall || defaultHall }
  }

  const namedHall = text.match(/^(.*?)[\s,]*court\s+(\d+)$/i)
  if (namedHall) {
    const hall = clean(namedHall[1])
    return { court: namedHall[2], hall: hall || defaultHall }
  }

  return { court: '', hall: text }
}

export function londonStamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type) => parts.find((part) => part.type === type).value
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}

export function isPast(date, time, nowStamp) {
  if (!time) return date < nowStamp.slice(0, 10)
  return `${date}T${time}` < nowStamp
}

function identity(fixture) {
  return fixture.bye ? 'bye' : norm(fixture.opponent)
}

export function fullKey(fixture) {
  return [fixture.season, String(fixture.leagueId), norm(fixture.team), identity(fixture), fixture.date].join('|')
}

function pairKey(fixture) {
  return [fixture.season, String(fixture.leagueId), norm(fixture.team), identity(fixture)].join('|')
}

function opponentKey(fixture) {
  return [fixture.season, String(fixture.leagueId), norm(fixture.team), fixture.date].join('|')
}

export function readLeagues(html) {
  const $ = load(html)
  const leagues = []
  $('select#leagueDropdown option').each((_, option) => {
    const id = clean($(option).attr('value'))
    const label = clean($(option).text())
    if (!id || !label || label.toLowerCase() === 'select a league') return
    leagues.push({ id, label })
  })
  return leagues
}

export function readFixtures(html, { leagueId, leagueLabel, sourceUrl, defaultHall, teamPattern }) {
  const $ = load(html)
  const season = parseSeason(leagueLabel)
  const league = leagueName(leagueLabel, season.label)
  const teamRe = new RegExp(teamPattern, 'i')
  const table = $('table').filter((_, element) => {
    const headers = $(element).find('th').map((__, th) => clean($(th).text())).get()
    return headers.includes('Time') && headers.includes('Teams')
  }).first()
  if (!season.label) return []

  const fixtures = []
  if (!table.length) return readByes($, { season, league, leagueId, sourceUrl, teamRe })
  const seen = new Set()
  let currentDateText = ''

  table.find('tr').each((_, row) => {
    const dateCell = $(row).find('td.sticky-col-date')
    if (dateCell.length) {
      currentDateText = clean(dateCell.text())
      return
    }
    const cells = $(row).find('td')
    if (cells.length < 4) return
    const time = clean($(cells[0]).text())
    if (!/^\d{1,2}:\d{2}$/.test(time)) return
    const sides = clean($(cells[1]).text()).split(/\(\s*vs\s*\)/i).map(clean).filter(Boolean)
    if (sides.length < 2 || !currentDateText) return
    const date = inferIsoDate(currentDateText, season)
    if (!date) return
    const division = clean($(cells[2]).text())
    const place = parseCourt($(cells[3]).text(), defaultHall)
    const [hours, minutes] = time.split(':')
    const kickoff = `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`

    for (const [teamRaw, opponentRaw] of [[sides[0], sides[1]], [sides[1], sides[0]]]) {
      if (!teamRe.test(teamRaw)) continue
      const team = displayTeam(teamRaw)
      const fixture = {
        season: season.label,
        leagueId: String(leagueId),
        league,
        sourceUrl,
        date,
        time: kickoff,
        team,
        teamId: teamSlug(team),
        opponent: displayTeam(opponentRaw),
        hall: place.hall,
        court: place.court,
        division,
        status: 'scheduled',
        change: null,
      }
      const key = fullKey(fixture)
      if (seen.has(key)) continue
      seen.add(key)
      fixtures.push(fixture)
    }
  })

  return fixtures.concat(readByes($, { season, league, leagueId, sourceUrl, teamRe }))
}

function readByes($, { season, league, leagueId, sourceUrl, teamRe }) {
  const fixtures = []
  const seen = new Set()

  $('table').each((_, table) => {
    if (!$(table).find('td.first-col-bye').length) return
    let currentDateText = ''
    $(table).find('tr').each((__, row) => {
      const dateCell = $(row).find('td.first-col-bye')
      if (dateCell.length) {
        currentDateText = clean(dateCell.text())
        return
      }
      const name = clean($(row).find('td').first().text())
      if (!name || !currentDateText || !teamRe.test(name)) return
      const date = inferIsoDate(currentDateText, season)
      if (!date) return
      const team = displayTeam(name)
      const fixture = {
        season: season.label,
        leagueId: String(leagueId),
        league,
        sourceUrl,
        date,
        time: '',
        team,
        teamId: teamSlug(team),
        opponent: '',
        hall: '',
        court: '',
        division: '',
        bye: true,
        status: 'bye',
        change: null,
      }
      const key = fullKey(fixture)
      if (seen.has(key)) return
      seen.add(key)
      fixtures.push(fixture)
    })
  })

  return fixtures
}

const TRACKED = ['time', 'hall', 'court', 'division', 'opponent']

function baseline(fixture) {
  if (!fixture.change?.previous) return fixture
  return { ...fixture, ...fixture.change.previous }
}

function previousValues(origin, fresh) {
  const previous = {}
  for (const field of TRACKED) {
    if (fresh[field] !== origin[field]) previous[field] = origin[field]
  }
  return previous
}

function samePrevious(left = {}, right = {}) {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)])
  for (const key of keys) {
    if (left[key] !== right[key]) return false
  }
  return true
}

function scheduledFrom(fresh, change) {
  return { ...fresh, status: fresh.bye ? 'bye' : 'scheduled', change }
}

function applyMatched(old, fresh, nowStamp) {
  const unchanged = TRACKED.every((field) => fresh[field] === old[field])
  if (unchanged) {
    if (old.status === 'removed') {
      return scheduledFrom(fresh, { type: 'new', detectedAt: nowStamp, previous: null })
    }
    return scheduledFrom(fresh, old.change ?? null)
  }
  const previous = previousValues(baseline(old), fresh)
  if (Object.keys(previous).length === 0) return scheduledFrom(fresh, null)
  const detectedAt = old.change && samePrevious(old.change.previous, previous)
    ? old.change.detectedAt
    : nowStamp
  return scheduledFrom(fresh, { type: 'updated', detectedAt, previous })
}

function groupEntries(entries, keyFn) {
  const groups = new Map()
  for (const entry of entries) {
    const key = keyFn(entry[1])
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(entry)
  }
  return groups
}

export function diffFixtures(previous, scraped, nowStamp) {
  const prev = previous.filter((fixture) => !isPast(fixture.date, fixture.time, nowStamp))
  const next = scraped.filter((fixture) => !isPast(fixture.date, fixture.time, nowStamp))
  const firstRun = previous.length === 0
  const prevByKey = new Map(prev.map((fixture) => [fullKey(fixture), fixture]))
  const nextByKey = new Map(next.map((fixture) => [fullKey(fixture), fixture]))
  const consumedPrev = new Set()
  const consumedNext = new Set()
  const output = []

  for (const [key, fresh] of nextByKey) {
    const old = prevByKey.get(key)
    if (!old) continue
    consumedPrev.add(key)
    consumedNext.add(key)
    output.push(firstRun ? scheduledFrom(fresh, null) : applyMatched(old, fresh, nowStamp))
  }

  const remaining = (map, consumed) => [...map.entries()].filter(([key]) => !consumed.has(key))

  const linkSingles = (keyFn, build) => {
    const oldGroups = groupEntries(remaining(prevByKey, consumedPrev), keyFn)
    const newGroups = groupEntries(remaining(nextByKey, consumedNext), keyFn)
    for (const [key, olds] of oldGroups) {
      const news = newGroups.get(key)
      if (!news || olds.length !== 1 || news.length !== 1) continue
      const [oldKey, old] = olds[0]
      const [newKey, fresh] = news[0]
      if (old.status === 'removed') continue
      const built = build(old, fresh)
      if (!built) continue
      consumedPrev.add(oldKey)
      consumedNext.add(newKey)
      output.push(built)
    }
  }

  linkSingles(pairKey, (old, fresh) => scheduledFrom(fresh, {
    type: 'moved',
    detectedAt: nowStamp,
    previous: {
      date: old.date,
      time: old.time,
      hall: old.hall,
      court: old.court,
    },
  }))

  linkSingles(opponentKey, (old, fresh) => {
    if (old.bye || fresh.bye) return null
    const previous = previousValues(baseline(old), fresh)
    previous.opponent = old.opponent
    return scheduledFrom(fresh, { type: 'updated', detectedAt: nowStamp, previous })
  })

  for (const [key, old] of remaining(prevByKey, consumedPrev)) {
    if (old.status === 'removed') {
      output.push(old)
      continue
    }
    output.push({
      ...old,
      status: 'removed',
      change: { type: 'removed', detectedAt: nowStamp, previous: null },
    })
    consumedPrev.add(key)
  }

  for (const [, fresh] of remaining(nextByKey, consumedNext)) {
    output.push(scheduledFrom(fresh, firstRun ? null : { type: 'new', detectedAt: nowStamp, previous: null }))
  }

  return output
}

export function groupTeams(fixtures) {
  const teams = new Map()
  for (const fixture of fixtures) {
    if (!teams.has(fixture.teamId)) {
      teams.set(fixture.teamId, { id: fixture.teamId, name: fixture.team, fixtures: [] })
    }
    const { teamId, team, ...rest } = fixture
    teams.get(teamId).fixtures.push(rest)
  }
  return [...teams.values()]
    .map((team) => ({
      ...team,
      fixtures: team.fixtures.sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`)),
    }))
    .sort((a, b) => {
      const aLive = a.fixtures.find((fixture) => fixture.status !== 'removed')
      const bLive = b.fixtures.find((fixture) => fixture.status !== 'removed')
      const aKey = aLive ? `${aLive.date}T${aLive.time}` : `9${a.fixtures[0]?.date ?? ''}`
      const bKey = bLive ? `${bLive.date}T${bLive.time}` : `9${b.fixtures[0]?.date ?? ''}`
      return aKey.localeCompare(bKey) || a.name.localeCompare(b.name)
    })
}
