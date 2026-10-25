import assert from 'node:assert/strict'
import test from 'node:test'
import { ageGroup, dateLabel, formatPlace, formatWhatsApp } from '../format.mjs'
import {
  diffFixtures,
  displayTeam,
  inferIsoDate,
  isPast,
  parseCourt,
  parseSeason,
  readFixtures,
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
  assert.equal(formatPlace('Reddish Vale High School', '3'), 'Reddish Vale High School, Court 3')
  assert.equal(formatPlace('Hollinwood', ''), 'Hollinwood')
  assert.equal(formatPlace('Oldham', '2'), 'Oldham, Court 2')
  assert.equal(dateLabel('2027-01-09', '2026-10-19T20:00'), 'Sat 9 Jan 2027')
})
