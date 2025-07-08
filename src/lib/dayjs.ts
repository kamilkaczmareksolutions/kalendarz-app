import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import relativeTime from 'dayjs/plugin/relativeTime'
import isBetween from 'dayjs/plugin/isBetween'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(relativeTime)
dayjs.extend(isBetween)

dayjs.tz.setDefault('Europe/Warsaw')

export { dayjs } 