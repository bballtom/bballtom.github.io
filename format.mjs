const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const SEX_ORDER = { boys: 0, girls: 1, mixed: 2, men: 3, women: 4 }

export function ageGroup(league) {
  const text = String(league ?? '').toLowerCase()
  const sex = /\bboys\b/.test(text) ? 'boys'
    : /\bgirls\b/.test(text) ? 'girls'
      : /\bwomen\b/.test(text) ? 'women'
        : /\bmen\b/.test(text) ? 'men'
          : /\bmixed\b/.test(text) ? 'mixed'
            : ''

  const years = text.match(/years\s+(\d+)\s*&\s*(\d+)/)
  const under = text.match(/under\s+(\d+)/)
  let ageLabel = ''
  let ageOrder = 100
  if (years) {
    ageLabel = `Years ${years[1]} & ${years[2]}`
    ageOrder = Number(years[1])
  } else if (under) {
    ageLabel = `Under ${under[1]}s`
    ageOrder = 30 + Number(under[1])
  }

  if (!ageLabel) {
    const adult = { men: ['Men', 80], women: ['Women', 81], mixed: ['Mixed', 82] }
    if (adult[sex]) return { label: adult[sex][0], order: adult[sex][1] }
    return { label: 'Other', order: 90 }
  }

  return {
    label: sex ? `${ageLabel} ${sex}` : ageLabel,
    order: ageOrder * 10 + (sex ? (SEX_ORDER[sex] ?? 4) + 1 : 0),
  }
}

export function dateLabel(iso, nowStamp = '') {
  const [year, month, day] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(year, month - 1, day, 12))
  const weekday = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    timeZone: 'UTC',
  }).format(dt)
  const label = `${weekday} ${day} ${MONTHS[month - 1]}`
  const nowYear = nowStamp.slice(0, 4)
  return nowYear && year !== Number(nowYear) ? `${label} ${year}` : label
}

export function formatPlace(hall, court) {
  if (!court) return hall
  const courtLabel = /^\d+$/.test(String(court)) ? `Court ${court}` : court
  return `${hall}, ${courtLabel}`
}

export function changeSummary(fixture) {
  const change = fixture.change
  if (!change) return ''
  if (change.type === 'new') return 'NEW'
  if (change.type === 'removed') return 'CANCELLED'
  if (change.type === 'moved') {
    const when = dateLabel(change.previous.date, fixture.date)
    return `MOVED: was ${when}, ${change.previous.time}`
  }
  const previous = change.previous ?? {}
  const bits = []
  if (previous.time) bits.push(`time was ${previous.time}`)
  if (previous.hall) bits.push(`hall was ${previous.hall}`)
  if (previous.court) bits.push(`court was ${/^\d+$/.test(String(previous.court)) ? `Court ${previous.court}` : previous.court}`)
  if (previous.opponent) bits.push(`opponent was ${previous.opponent}`)
  if (previous.division) bits.push(`division was ${previous.division}`)
  return bits.length ? `CHANGED: ${bits.join(', ')}` : ''
}

export function formatClock(time) {
  const [hours, minutes] = String(time).split(':').map(Number)
  const suffix = hours >= 12 ? 'pm' : 'am'
  const hour = hours % 12 || 12
  return `${hour}:${String(minutes).padStart(2, '0')}${suffix}`
}

function copyHall(hall) {
  if (hall === 'Reddish Vale High School') return 'Reddish'
  return hall
}

export function formatWhatsApp(_teamName, fixtures, nowStamp = '') {
  return fixtures.map((fixture) => {
    const lines = []
    const note = changeSummary(fixture)
    if (note && note !== 'NEW') lines.push(note)
    lines.push(`📅 ${dateLabel(fixture.date, nowStamp)}`)
    lines.push(`⏰ ${formatClock(fixture.time)}`)
    lines.push(`📍 ${formatPlace(copyHall(fixture.hall), fixture.court)}`)
    lines.push(`🆚 ${fixture.opponent}`)
    return lines.join('\n')
  }).join('\n\n')
}
