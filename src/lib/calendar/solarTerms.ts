export type SolarTerm = { name: string; nameEn: string };

// 24 solar terms, ordered: index 0 = 小寒(Jan), 1 = 大寒(Jan), 2 = 立春(Feb) ...
const TERMS: SolarTerm[] = [
  { name: '小寒', nameEn: 'Minor Cold' },
  { name: '大寒', nameEn: 'Major Cold' },
  { name: '立春', nameEn: 'Start of Spring' },
  { name: '雨水', nameEn: 'Rain Water' },
  { name: '惊蛰', nameEn: 'Awakening of Insects' },
  { name: '春分', nameEn: 'Spring Equinox' },
  { name: '清明', nameEn: 'Clear and Bright' },
  { name: '谷雨', nameEn: 'Grain Rain' },
  { name: '立夏', nameEn: 'Start of Summer' },
  { name: '小满', nameEn: 'Grain Buds' },
  { name: '芒种', nameEn: 'Grain in Ear' },
  { name: '夏至', nameEn: 'Summer Solstice' },
  { name: '小暑', nameEn: 'Minor Heat' },
  { name: '大暑', nameEn: 'Major Heat' },
  { name: '立秋', nameEn: 'Start of Autumn' },
  { name: '处暑', nameEn: 'End of Heat' },
  { name: '白露', nameEn: 'White Dew' },
  { name: '秋分', nameEn: 'Autumnal Equinox' },
  { name: '寒露', nameEn: 'Cold Dew' },
  { name: '霜降', nameEn: "Frost's Descent" },
  { name: '立冬', nameEn: 'Start of Winter' },
  { name: '小雪', nameEn: 'Minor Snow' },
  { name: '大雪', nameEn: 'Major Snow' },
  { name: '冬至', nameEn: 'Winter Solstice' },
];

// Month (1-indexed) for each term
const MONTHS = [1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12];

// Formula constants for 21st century (2000–2099):
// day = floor(Y * 0.2422 + C) - floor(Y / 4), where Y = year - 2000
const C = [
  5.4055, 20.1223, 3.8708, 18.7314,
  5.6275, 20.3945, 4.81,   20.1120,
  5.52,   21.0394, 5.678,  21.37,
  7.108,  22.83,   7.5,    23.13,
  7.646,  23.042,  8.318,  23.438,
  7.438,  22.36,   7.18,   21.94,
];

// Year-specific corrections: [year, termIndex, delta]
const FIXES: [number, number, number][] = [
  [2008, 0, 1], [2008, 1, 1], [2008, 6, -1],
  [2009, 2, -1], [2009, 3, -1], [2009, 5, -1],
  [2013, 4, 1],  [2008, 9, 1],
];

const _cache = new Map<number, Map<string, SolarTerm>>();

export function getSolarTermsForYear(year: number): Map<string, SolarTerm> {
  if (_cache.has(year)) return _cache.get(year)!;
  if (year < 2000 || year > 2099) return new Map();
  const Y = year - 2000;
  const result = new Map<string, SolarTerm>();
  for (let i = 0; i < 24; i++) {
    let day = Math.floor(Y * 0.2422 + C[i]) - Math.floor(Y / 4);
    for (const [ey, et, adj] of FIXES) {
      if (year === ey && i === et) day += adj;
    }
    const key = `${year}-${String(MONTHS[i]).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    result.set(key, TERMS[i]);
  }
  _cache.set(year, result);
  return result;
}

export function getSolarTermForDate(date: Date): SolarTerm | undefined {
  const y = date.getFullYear();
  const terms = getSolarTermsForYear(y);
  const key = `${y}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  return terms.get(key);
}
