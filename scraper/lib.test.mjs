import assert from 'node:assert/strict'
import test from 'node:test'
import { ageGroup, dateLabel, formatPlace, formatTableWhatsApp, formatWhatsApp, meetingsAgainst } from '../format.mjs'
import {
  diffFixtures,
  displayTeam,
  inferIsoDate,
  isPast,
  mergeResults,
  parseCourt,
  parseSeason,
  presentSeason,
  rowsForActiveSeasons,
  readFixtures,
  readResultLeagues,
  readResults,
  readStandings,
  readTableDivisions,
  teamSlug,
} from './lib.mjs'

const winter = parseSeason('Saturday school years 3&4 basketball - Winter Season 26')
const summer = parseSeason('Saturday school years 3&4 basketball - Summer Season 26')

test('winter dates roll into the next calendar year after December', () => {
  assert.equal(inferIsoDate('Saturday 24th Oct', winter), '2026-10-24')
  assert.equal(inferIsoDate('Saturday 9th Jan', winter), '2027-01-09')
  assert.equal(inferIsoDate('Saturday 6th Jun', summer), '2026-06-06')
})

test('a blank hall means Reddish Vale High School', () => {
  assert.deepEqual(parseCourt('Court 3 |', 'Reddish Vale High School'), {
    court: '3',
    hall: 'Reddish Vale High School',
  })
  assert.deepEqual(parseCourt('Court 3 Philips |', 'Reddish Vale High School'), {
    court: '3',
    hall: 'Philips',
  })
  assert.deepEqual(parseCourt('Hollinwood |', 'Reddish Vale High School'), {
    court: '',
    hall: 'Hollinwood',
  })
  assert.deepEqual(parseCourt('Oldham court 2 |', 'Reddish Vale High School'), {
    court: '2',
    hall: 'Oldham',
  })
})

test('squad names ignore extra hyphens', () => {
  assert.equal(displayTeam('Tameside Vikings-Invaders'), 'Tameside Vikings Invaders')
  assert.equal(displayTeam('Tameside Vikings - Dreki'), 'Tameside Vikings Dreki')
  assert.equal(teamSlug('Tameside Vikings Storm Maidens'), 'storm-maidens')
  assert.equal(displayTeam('Thunder Strikers'), 'Thunder Strikers')
})

const sampleHtml = `
  <table>
    <thead><tr><th>Time</th><th>Teams</th><th>Division</th><th>Court</th></tr></thead>
    <tbody>
      <tr><td class="sticky-col-date"><strong>Saturday 24th Oct</strong></td></tr>
      <tr>
        <td>11:00</td>
        <td>Tameside Vikings Slayers <strong>( vs )</strong> Thunder Strikers </strong></td>
        <td>Division 1</td>
        <td>Court 3 | </td>
      </tr>
      <tr>
        <td>12:40</td>
        <td>Cheadle Tigers <strong>( vs )</strong> Reddish Dragons Yr4</td>
        <td>Premier Division</td>
        <td>Court 1 | </td>
      </tr>
    </tbody>
  </table>`

function slayers(html = sampleHtml, court = null) {
  const rows = readFixtures(html, {
    leagueId: '57',
    leagueLabel: 'Saturday school years 3&4 basketball - Winter Season 26',
    sourceUrl: 'https://example.test/?id=57',
    defaultHall: 'Reddish Vale High School',
    teamPattern: 'tameside\\s*vikings',
  })
  return court ? rows : rows
}

test('a bye week is kept for Vikings and ignored for other clubs', () => {
  const html = `${sampleHtml}
    <table>
      <tr><td class="sticky-col-date first-col-bye"><strong>Saturday 14th Nov</strong></td></tr>
      <tr><td><strong>Tameside Vikings Slayers</strong></td></tr>
      <tr><td><strong>Thunder Strikers</strong></td></tr>
      <tr><td class="sticky-col-date first-col-bye"><strong>Saturday 21st Nov</strong></td></tr>
      <tr><td><strong>Tameside Vikings Storm Maidens</strong></td></tr>
    </table>`
  const rows = readFixtures(html, {
    leagueId: '57',
    leagueLabel: 'Saturday school years 3&4 basketball - Winter Season 26',
    sourceUrl: 'https://example.test/?id=57',
    defaultHall: 'Reddish Vale High School',
    teamPattern: 'tameside\\s*vikings',
  })
  const byes = rows.filter((row) => row.bye)
  assert.equal(rows.length, 3)
  assert.deepEqual(byes.map((row) => [row.team, row.date, row.status, row.time, row.opponent]), [
    ['Tameside Vikings Slayers', '2026-11-14', 'bye', '', ''],
    ['Tameside Vikings Storm Maidens', '2026-11-21', 'bye', '', ''],
  ])
  assert.equal(isPast('2026-11-14', '', '2026-11-14T18:00'), false)
  assert.equal(isPast('2026-11-14', '', '2026-11-15T00:01'), true)

  const game = rows.find((row) => !row.bye)
  const added = diffFixtures([game], rows, '2026-10-19T20:00')
  assert.equal(added.find((row) => !row.bye).change, null)
  assert.equal(added.find((row) => row.teamId === 'slayers' && row.bye).change.type, 'new')

  const slayersBye = byes[0]
  assert.equal(diffFixtures([slayersBye], [slayersBye], '2026-11-14T18:00').length, 1)
  assert.equal(diffFixtures([slayersBye], [slayersBye], '2026-11-15T09:00').length, 0)
})

test('a closed season is dropped instead of marked cancelled', () => {
  const rows = [
    { season: 'Winter Season 26', team: 'Slayers' },
    { season: 'Summer Season 27', team: 'Slayers' },
    { season: '', team: 'Slayers' },
  ]
  assert.deepEqual(rowsForActiveSeasons(rows, ['summer']).map((row) => row.season), [
    'Summer Season 27',
    '',
  ])
  assert.equal(rowsForActiveSeasons(rows, ['winter', 'summer']).length, 3)
})

test('the current table is summer once summer fixtures exist, otherwise winter', () => {
  assert.deepEqual(presentSeason({
    teams: [{ fixtures: [{ season: 'Winter Season 26' }] }],
  }), { kind: 'winter', label: 'Winter Season 26' })
  assert.deepEqual(presentSeason({
    teams: [{ fixtures: [{ season: 'Winter Season 26' }, { season: 'Summer Season 27' }] }],
  }), { kind: 'summer', label: 'Summer Season 27' })
  assert.equal(presentSeason({ teams: [] }), null)
})

test('a division table keeps position, results, and points', () => {
  const divisions = readTableDivisions(`
    <select id="leagueDropdown">
      <option value="">Select a League and Division</option>
      <option value="57|828">Saturday school years 3&amp;4 basketball - Division 1</option>
    </select>`)
  assert.deepEqual(divisions, [{
    id: '57|828',
    leagueId: '57',
    divisionId: '828',
    league: 'Saturday school years 3&4 basketball',
    division: 'Division 1',
    label: 'Saturday school years 3&4 basketball - Division 1',
  }])

  const rows = readStandings(`
    <table class="league-table">
      <thead><tr><th>Team Name</th><th>Played</th><th>Won</th><th>Drawn</th><th>Lost</th><th>Byes</th><th>W/O</th><th>Pts For</th><th>Pts Against</th><th>Pt Diff</th><th>League Pts</th></tr></thead>
      <tbody>
        <tr><td><button>Thunder Strikers</button></td><td>2</td><td>2</td><td>0</td><td>0</td><td>0</td><td>0</td><td>27</td><td>13</td><td>14</td><td>6</td></tr>
        <tr><td><button>Tameside Vikings Slayers</button></td><td>2</td><td>1</td><td>0</td><td>1</td><td>0</td><td>0</td><td>20</td><td>18</td><td>2</td><td>3</td></tr>
      </tbody>
    </table>`)
  assert.deepEqual(rows, [
    { position: 1, team: 'Thunder Strikers', played: 2, won: 2, lost: 0, points: 6 },
    { position: 2, team: 'Tameside Vikings Slayers', played: 2, won: 1, lost: 1, points: 3 },
  ])
})

test('the table keeps Vikings games and names the usual hall', () => {
  const rows = slayers()
  assert.equal(rows.length, 1)
  assert.equal(rows[0].team, 'Tameside Vikings Slayers')
  assert.equal(rows[0].opponent, 'Thunder Strikers')
  assert.equal(rows[0].hall, 'Reddish Vale High School')
  assert.equal(rows[0].court, '3')
  assert.equal(rows[0].date, '2026-10-24')
  assert.equal(rows[0].league, 'Saturday school years 3&4 basketball')
})

test('the first save does not mark every game as new', () => {
  const rows = slayers()
  const saved = diffFixtures([], rows, '2026-10-19T20:00')
  assert.equal(saved[0].change, null)
})

test('a later time change stays visible, and a played game is dropped', () => {
  const original = slayers()[0]
  const movedHtml = sampleHtml.replace('11:00', '12:10').replace('Court 3 |', 'Court 1 Philips |')
  const moved = readFixtures(movedHtml, {
    leagueId: '57',
    leagueLabel: 'Saturday school years 3&4 basketball - Winter Season 26',
    sourceUrl: 'https://example.test/?id=57',
    defaultHall: 'Reddish Vale High School',
    teamPattern: 'tameside\\s*vikings',
  })
  const once = diffFixtures(original ? [original] : [], moved, '2026-10-19T20:00')
  assert.equal(once[0].time, '12:10')
  assert.equal(once[0].hall, 'Philips')
  assert.equal(once[0].change.previous.time, '11:00')
  assert.equal(once[0].change.previous.hall, 'Reddish Vale High School')

  const twice = diffFixtures(once, moved, '2026-10-19T22:00')
  assert.equal(twice[0].change.previous.time, '11:00')
  assert.equal(twice[0].change.detectedAt, '2026-10-19T20:00')

  const afterTip = diffFixtures(twice, moved, '2026-10-24T12:11')
  assert.equal(afterTip.length, 0)
})

test('a future game that disappears is kept as cancelled until tip-off', () => {
  const original = slayers()
  const removed = diffFixtures(original, [], '2026-10-19T20:00')
  assert.equal(removed[0].status, 'removed')
  assert.equal(removed[0].change.type, 'removed')
  const stillThere = diffFixtures(removed, [], '2026-10-20T09:00')
  assert.equal(stillThere.length, 1)
  const gone = diffFixtures(stillThere, [], '2026-10-24T11:01')
  assert.equal(gone.length, 0)
})

test('leagues group by age, and by sex only when the league says so', () => {
  assert.deepEqual(ageGroup('Saturday school years 3&4 basketball'), { label: 'Years 3 & 4', order: 30 })
  assert.deepEqual(ageGroup('Saturday school years 7&8 basketball (boys)'), { label: 'Years 7 & 8 boys', order: 71 })
  assert.deepEqual(ageGroup('Saturday school years 7&8 basketball (girls)'), { label: 'Years 7 & 8 girls', order: 72 })
  assert.equal(ageGroup('Saturday school years 9&10 basketball (girls)').label, 'Years 9 & 10 girls')
  assert.equal(ageGroup('Thursday & Friday school years 9&10 basketball').label, 'Years 9 & 10')
  assert.equal(ageGroup('Thursday & Friday under 18s basketball basketball').label, 'Under 18s')
  assert.ok(ageGroup('Saturday school years 5&6 basketball').order < ageGroup('Saturday school years 7&8 basketball (boys)').order)
  assert.ok(ageGroup('Saturday school years 9&10 basketball (girls)').order < ageGroup('Thursday & Friday under 18s basketball basketball').order)
})

test('WhatsApp text uses icons, a short hall, and leaves out new badges', () => {
  const text = formatWhatsApp('Tameside Vikings Valkyries', [
    {
      date: '2026-10-31',
      time: '10:10',
      opponent: 'Southside Panthers',
      hall: 'Reddish Vale High School',
      court: '2',
      division: 'Premier Division',
      status: 'scheduled',
      change: { type: 'new', previous: null },
    },
    {
      date: '2026-11-07',
      time: '14:20',
      opponent: 'Lion Mountain',
      hall: 'Hollinwood',
      court: '',
      division: 'Division 3',
      status: 'scheduled',
      change: null,
    },
  ], '2026-10-25T08:00')
  assert.equal(text, [
    '📅 Sat 31 Oct',
    '⏰ 10:10am',
    '📍 Reddish, Court 2',
    '🆚 Southside Panthers',
    '',
    '📅 Sat 7 Nov',
    '⏰ 2:20pm',
    '📍 Hollinwood',
    '🆚 Lion Mountain',
  ].join('\n'))
  assert.equal(formatWhatsApp('', [{
    date: '2026-11-14',
    time: '',
    bye: true,
    status: 'bye',
    change: { type: 'new', previous: null },
  }], '2026-10-25T08:00'), [
    '📅 Sat 14 Nov',
    '❌ Bye',
  ].join('\n'))
  assert.equal(formatWhatsApp('', [{
    date: '2026-10-31',
    time: '14:20',
    opponent: 'Southside',
    hall: 'Reddish Vale High School',
    court: '3',
    status: 'removed',
    change: { type: 'removed', previous: null },
  }], '2026-10-25T08:00'), [
    'CANCELLED',
    '~📅 Sat 31 Oct~',
    '~⏰ 2:20pm~',
    '~📍 Reddish, Court 3~',
    '~🆚 Southside~',
  ].join('\n'))
  assert.equal(formatTableWhatsApp('Tameside Vikings Slayers', {
    division: 'Division 1',
    league: 'Saturday school years 3&4 basketball',
    rows: [
      { position: 1, team: 'Thunder Strikers', points: 6 },
      { position: 7, team: 'Tameside Vikings Slayers', points: 2 },
    ],
  }), [
    '🏆 Division 1',
    'Saturday school years 3&4 basketball',
    '',
    '1. Thunder Strikers — 6pts',
    '*👉 7. Slayers — 2pts*',
  ].join('\n'))
  assert.equal(formatPlace('Reddish Vale High School', '3'), 'Reddish Vale High School, Court 3')
  assert.equal(formatPlace('Hollinwood', ''), 'Hollinwood')
  assert.equal(formatPlace('Oldham', '2'), 'Oldham, Court 2')
  assert.equal(dateLabel('2027-01-09', '2026-10-19T20:00'), 'Sat 9 Jan 2027')
})

const resultsHtml = `
  <select id="leagueDropdown">
    <option value="">Select a league</option>
    <option value="57" data-season="9">Stockport - Saturday school years 3&amp;4 basketball - Winter Season 26</option>
  </select>
  <table>
    <tr><th>Time</th><th>Teams</th><th>Divison</th><th>Court</th></tr>
    <tr><td>Saturday 17th Oct</td><td></td><td></td><td></td></tr>
    <tr><td>13:30</td><td>Reddish Monkeys (10) vs (5) Tameside Vikings Slayers</td><td>Division 1</td><td>Court 3</td></tr>
    <tr><td>Bye</td><td>Tameside Vikings Slayers</td><td></td><td></td></tr>
    <tr><td>Saturday 24th Oct</td><td></td><td></td><td></td></tr>
    <tr><td>11:00</td><td>Tameside Vikings Slayers (14) vs (8) Tameside Vikings Storm Maidens</td><td>Division 1</td><td>Court 3</td></tr>
    <tr><td>12:40</td><td>Other Club (9) vs (9) Somebody Else</td><td>Division 1</td><td>Court 3</td></tr>
  </table>`

test('a played game is kept for each Vikings side, and a bye is ignored', () => {
  const leagues = readResultLeagues(resultsHtml)
  assert.deepEqual(leagues, [{
    id: '57',
    label: 'Stockport - Saturday school years 3&4 basketball - Winter Season 26',
    seasonId: '9',
  }])
  const rows = readResults(resultsHtml, {
    leagueId: '57',
    leagueLabel: leagues[0].label,
    sourceUrl: 'https://example.test/results?id=57',
    teamPattern: 'tameside\\s*vikings',
  })
  assert.deepEqual(rows.map((row) => [row.date, row.teamId, row.opponent, row.teamScore, row.opponentScore, row.outcome, row.league]), [
    ['2026-10-17', 'slayers', 'Reddish Monkeys', 5, 10, 'loss', 'Saturday school years 3&4 basketball'],
    ['2026-10-24', 'slayers', 'Tameside Vikings Storm Maidens', 14, 8, 'win', 'Saturday school years 3&4 basketball'],
    ['2026-10-24', 'storm-maidens', 'Tameside Vikings Slayers', 8, 14, 'loss', 'Saturday school years 3&4 basketball'],
  ])
})

test('results we already know are kept when they leave the page', () => {
  const kept = {
    season: 'Winter Season 25',
    leagueId: '57',
    date: '2025-11-01',
    time: '10:00',
    team: 'Tameside Vikings Slayers',
    opponent: 'Old Side',
    teamScore: 20,
    opponentScore: 10,
    outcome: 'win',
    division: 'Division 1',
    league: 'Saturday school years 3&4 basketball',
  }
  const oldScore = { ...kept, season: 'Winter Season 26', date: '2026-10-17', time: '13:30', opponent: 'Reddish Monkeys', teamScore: 1, opponentScore: 2, outcome: 'loss' }
  const corrected = { ...oldScore, teamScore: 5, opponentScore: 10 }
  const first = mergeResults([kept, oldScore], [corrected])
  assert.equal(first.changed, true)
  assert.equal(first.results.length, 2)
  assert.equal(first.results.find((row) => row.season === 'Winter Season 25').teamScore, 20)
  assert.equal(first.results.find((row) => row.opponent === 'Reddish Monkeys').teamScore, 5)
  const again = mergeResults(first.results, [corrected])
  assert.equal(again.changed, false)
  assert.equal(again.results.length, 2)
})

test('previous meetings against the next opponent stay in date order', () => {
  const rows = [
    { teamId: 'slayers', opponent: 'SK Nukes Storm', date: '2026-10-24', time: '11:00', outcome: 'loss' },
    { teamId: 'slayers', opponent: 'Reddish Monkeys', date: '2026-10-17', time: '13:30', outcome: 'win' },
    { teamId: 'storm-maidens', opponent: 'SK Nukes Storm', date: '2026-10-10', time: '10:00', outcome: 'win' },
    { teamId: 'slayers', opponent: 'SK Nukes Storm', date: '2026-10-10', time: '12:40', outcome: 'win' },
  ]
  assert.deepEqual(meetingsAgainst(rows, 'slayers', 'SK Nukes Storm').map((row) => row.outcome), ['win', 'loss'])
  assert.deepEqual(meetingsAgainst(rows, 'slayers', ''), [])
  const longer = [1, 2, 3, 4, 5, 6].map((month) => ({
    teamId: 'slayers',
    opponent: 'SK Nukes Storm',
    date: `2026-${String(month).padStart(2, '0')}-01`,
    time: '10:00',
    outcome: `g${month}`,
  }))
  assert.deepEqual(meetingsAgainst(longer, 'slayers', 'SK Nukes Storm').map((row) => row.outcome), ['g2', 'g3', 'g4', 'g5', 'g6'])
})
