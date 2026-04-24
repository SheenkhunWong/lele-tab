import { getSolarTermsForYear } from './solarTerms';

const STEMS  = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
const BRANCH = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
const ZODIAC = ['鼠','牛','虎','兔','龙','蛇','马','羊','猴','鸡','狗','猪'];
const ELEMENTS = ['木','木','火','火','土','土','金','金','水','水'];
const BRANCH_NAMES_ZH = ['子时','丑时','寅时','卯时','辰时','巳时','午时','未时','申时','酉时','戌时','亥时'];
const BRANCH_NAMES_EN = ['11pm–1am','1–3am','3–5am','5–7am','7–9am','9–11am',
                         '11am–1pm','1–3pm','3–5pm','5–7pm','7–9pm','9–11pm'];

// Reference: Jan 1, 2024 = 庚子日 (cycle pos 36)
const REF_DATE = new Date(2024, 0, 1);
const REF_DAY_POS = 36;

function daysBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return Math.round(ms / 86400000);
}

function getDayCyclePos(date: Date): number {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const delta = daysBetween(REF_DATE, d);
  return ((REF_DAY_POS + delta) % 60 + 60) % 60;
}

// Get the solar year (changes at 立春 each year)
function getSolarYear(date: Date): number {
  const y = date.getFullYear();
  const terms = getSolarTermsForYear(y);
  // 立春 is term index 2 (Feb), find its date in this year
  let lichunDate: Date | null = null;
  terms.forEach((term, key) => {
    if (term.name === '立春') {
      lichunDate = new Date(key);
    }
  });
  if (!lichunDate) return y;
  // If current date is before 立春, we're still in the previous solar year
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const lc = new Date((lichunDate as Date).getFullYear(), (lichunDate as Date).getMonth(), (lichunDate as Date).getDate());
  return d < lc ? y - 1 : y;
}

// Solar month index (0 = 寅月, based on 12 节):
// The 12 月节 (節) solar terms that start a month:
// 立春(T2)→寅月(0), 惊蛰(T4)→卯月(1), 清明(T6)→辰月(2), 立夏(T8)→巳月(3),
// 芒种(T10)→午月(4), 小暑(T12)→未月(5), 立秋(T14)→申月(6), 白露(T16)→酉月(7),
// 寒露(T18)→戌月(8), 立冬(T20)→亥月(9), 大雪(T22)→子月(10), 小寒(T0)→丑月(11)
const MONTH_START_TERMS = ['立春','惊蛰','清明','立夏','芒种','小暑','立秋','白露','寒露','立冬','大雪','小寒'];

function getSolarMonthIndex(date: Date): number {
  // Returns 0–11 (0=寅月, 11=丑月)
  const y = date.getFullYear();
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  // Collect the 12 month-start dates for this year (and prev/next year for edge cases)
  const boundaries: { date: Date; idx: number }[] = [];
  for (const yr of [y - 1, y, y + 1]) {
    const terms = getSolarTermsForYear(yr);
    terms.forEach((term, key) => {
      const idx = MONTH_START_TERMS.indexOf(term.name);
      if (idx >= 0) boundaries.push({ date: new Date(key), idx });
    });
  }
  boundaries.sort((a, b) => a.date.getTime() - b.date.getTime());

  let monthIdx = 11;
  for (const b of boundaries) {
    if (d >= b.date) monthIdx = b.idx;
    else break;
  }
  return monthIdx;
}

export type BaZi = {
  yearPillar: string;  // e.g. 甲辰
  monthPillar: string;
  dayPillar: string;
  hourPillar: string;
  yearZodiac: string;  // e.g. 龙
  yearElement: string; // e.g. 木
  shichen: string;     // e.g. 午时
  shichenEn: string;
};

export function computeBaZi(date: Date): BaZi {
  // ── Year pillar ──
  const solarYear = getSolarYear(date);
  const yearCycle = ((solarYear - 4) % 60 + 60) % 60;
  const yearStemIdx = yearCycle % 10;
  const yearBranchIdx = yearCycle % 12;
  const yearPillar = STEMS[yearStemIdx] + BRANCH[yearBranchIdx];
  const yearZodiac = ZODIAC[yearBranchIdx];
  const yearElement = ELEMENTS[yearStemIdx];

  // ── Month pillar ──
  // Month index: 0=寅, 1=卯, ..., 11=丑
  // Month stems: based on year stem group (甲己→丙寅起, 乙庚→戊寅起, 丙辛→庚寅起, 丁壬→壬寅起, 戊癸→甲寅起)
  const monthIdx = getSolarMonthIndex(date);
  // 寅月 stem = yearStemGroup * 2 + 2 (寅月 is always month 0 in the cycle)
  const yearStemGroup = yearStemIdx % 5;
  const yinMonthStemIdx = (yearStemGroup * 2 + 2) % 10;
  const monthStemIdx = (yinMonthStemIdx + monthIdx) % 10;
  const monthBranchIdx = (monthIdx + 2) % 12; // 寅=2, 卯=3, ...
  const monthPillar = STEMS[monthStemIdx] + BRANCH[monthBranchIdx];

  // ── Day pillar ──
  const dayCyclePos = getDayCyclePos(date);
  const dayStemIdx = dayCyclePos % 10;
  const dayBranchIdx = dayCyclePos % 12;
  const dayPillar = STEMS[dayStemIdx] + BRANCH[dayBranchIdx];

  // ── Hour pillar ──
  const hour = date.getHours();
  const hourBranchIdx = Math.floor((hour + 1) / 2) % 12;
  const hourStemIdx = (dayStemIdx * 2 + hourBranchIdx) % 10;
  const hourPillar = STEMS[hourStemIdx] + BRANCH[hourBranchIdx];

  return {
    yearPillar,
    monthPillar,
    dayPillar,
    hourPillar,
    yearZodiac,
    yearElement,
    shichen: BRANCH_NAMES_ZH[hourBranchIdx],
    shichenEn: BRANCH_NAMES_EN[hourBranchIdx],
  };
}
