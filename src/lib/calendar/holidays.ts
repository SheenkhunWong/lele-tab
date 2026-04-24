export type Holiday = { name: string; nameEn: string; country: string };

export type CountryInfo = {
  code: string;
  name: string;   // Chinese label
  nameEn: string; // English label
};

export const HOLIDAY_COUNTRIES: CountryInfo[] = [
  { code: 'CN', name: '中国', nameEn: 'China' },
  { code: 'US', name: '美国', nameEn: 'USA' },
  { code: 'GB', name: '英国', nameEn: 'UK' },
  { code: 'FR', name: '法国', nameEn: 'France' },
  { code: 'DE', name: '德国', nameEn: 'Germany' },
  { code: 'JP', name: '日本', nameEn: 'Japan' },
  { code: 'KR', name: '韩国', nameEn: 'Korea' },
  { code: 'RU', name: '俄罗斯', nameEn: 'Russia' },
  { code: 'IN', name: '印度', nameEn: 'India' },
  { code: 'BR', name: '巴西', nameEn: 'Brazil' },
  { code: 'AU', name: '澳大利亚', nameEn: 'Australia' },
  { code: 'CA', name: '加拿大', nameEn: 'Canada' },
  { code: 'IT', name: '意大利', nameEn: 'Italy' },
  { code: 'ES', name: '西班牙', nameEn: 'Spain' },
  { code: 'MX', name: '墨西哥', nameEn: 'Mexico' },
  { code: 'AR', name: '阿根廷', nameEn: 'Argentina' },
  { code: 'SG', name: '新加坡', nameEn: 'Singapore' },
  { code: 'TH', name: '泰国', nameEn: 'Thailand' },
  { code: 'VN', name: '越南', nameEn: 'Vietnam' },
  { code: 'MY', name: '马来西亚', nameEn: 'Malaysia' },
  { code: 'ID', name: '印度尼西亚', nameEn: 'Indonesia' },
  { code: 'NL', name: '荷兰', nameEn: 'Netherlands' },
  { code: 'SE', name: '瑞典', nameEn: 'Sweden' },
  { code: 'PL', name: '波兰', nameEn: 'Poland' },
  { code: 'TR', name: '土耳其', nameEn: 'Türkiye' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function easter(year: number): Date {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}

// nth weekday of a month; n<0 counts from end (-1=last)
function nthWday(year: number, month: number, wd: number, n: number): Date {
  if (n > 0) {
    const first = new Date(year, month - 1, 1);
    const diff = (wd - first.getDay() + 7) % 7;
    return new Date(year, month - 1, 1 + diff + (n - 1) * 7);
  }
  const last = new Date(year, month, 0);
  const diff = (last.getDay() - wd + 7) % 7;
  return new Date(year, month - 1, last.getDate() - diff);
}

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function fixed(year: number, m: number, d: number): string {
  return `${year}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

// ── Precomputed lunar-based holiday dates (2023–2031) ─────────────────────────
// Key: YYYY-MM-DD, value: [zh, en, country]

type PreEntry = [string, string, string];

// Chinese New Year (春节) = Lunar Jan 1
const SPRING_FESTIVAL: Record<number,string> = {
  2023:'01-22', 2024:'02-10', 2025:'01-29', 2026:'02-17',
  2027:'02-06', 2028:'01-26', 2029:'02-13', 2030:'02-03',
};
// Chinese Duanwu (端午) = Lunar May 5
const DUANWU: Record<number,string> = {
  2023:'06-22', 2024:'06-10', 2025:'05-31', 2026:'06-19',
  2027:'06-09', 2028:'05-28', 2029:'06-15', 2030:'06-05',
};
// Chinese Mid-Autumn (中秋) = Lunar Aug 15
const MID_AUTUMN: Record<number,string> = {
  2023:'09-29', 2024:'09-17', 2025:'10-06', 2026:'09-25',
  2027:'09-15', 2028:'10-03', 2029:'09-22', 2030:'09-12',
};
// Islamic Eid al-Fitr (approximate Gregorian, may vary ±1 day)
const EID_FITR: Record<number,string> = {
  2023:'04-21', 2024:'04-10', 2025:'03-30', 2026:'03-20',
  2027:'03-09', 2028:'02-26', 2029:'02-14', 2030:'02-04',
};
// Islamic Eid al-Adha
const EID_ADHA: Record<number,string> = {
  2023:'06-28', 2024:'06-16', 2025:'06-06', 2026:'05-27',
  2027:'05-17', 2028:'05-05', 2029:'04-24', 2030:'04-13',
};

function precomputed(
  table: Record<number,string>,
  year: number,
  zh: string,
  en: string,
  country: string
): PreEntry | null {
  const md = table[year];
  if (!md) return null;
  return [`${year}-${md}`, zh, en, country] as unknown as PreEntry;
}

// ── Build holiday map for a year ──────────────────────────────────────────────

const _hCache = new Map<string, Map<string, Holiday[]>>();

function addH(map: Map<string, Holiday[]>, date: string, h: Holiday) {
  const arr = map.get(date) ?? [];
  arr.push(h);
  map.set(date, arr);
}

function addFixed(map: Map<string, Holiday[]>, year: number, m: number, d: number, zh: string, en: string, country: string) {
  addH(map, fixed(year, m, d), { name: zh, nameEn: en, country });
}

function addEaster(map: Map<string, Holiday[]>, year: number, offset: number, zh: string, en: string, country: string) {
  addH(map, fmt(addDays(easter(year), offset)), { name: zh, nameEn: en, country });
}

function addNth(map: Map<string, Holiday[]>, year: number, month: number, wd: number, n: number, zh: string, en: string, country: string) {
  addH(map, fmt(nthWday(year, month, wd, n)), { name: zh, nameEn: en, country });
}

function buildYear(year: number, countryCodes: Set<string>): Map<string, Holiday[]> {
  const map = new Map<string, Holiday[]>();

  if (countryCodes.has('CN')) {
    addFixed(map, year, 1, 1, '元旦', "New Year's Day", 'CN');
    const sf = SPRING_FESTIVAL[year];
    if (sf) addH(map, `${year}-${sf}`, { name: '春节', nameEn: 'Spring Festival', country: 'CN' });
    addFixed(map, year, 5, 1, '劳动节', 'Labour Day', 'CN');
    const dw = DUANWU[year];
    if (dw) addH(map, `${year}-${dw}`, { name: '端午节', nameEn: 'Dragon Boat', country: 'CN' });
    const ma = MID_AUTUMN[year];
    if (ma) addH(map, `${year}-${ma}`, { name: '中秋节', nameEn: 'Mid-Autumn', country: 'CN' });
    addFixed(map, year, 10, 1, '国庆节', 'National Day', 'CN');
  }

  if (countryCodes.has('US')) {
    addFixed(map, year, 1, 1, '元旦', "New Year's", 'US');
    addNth(map, year, 1, 1, 3, 'MLK日', 'MLK Day', 'US');
    addNth(map, year, 2, 1, 3, '总统日', "Presidents' Day", 'US');
    addNth(map, year, 5, 1, -1, '阵亡将士纪念日', 'Memorial Day', 'US');
    addFixed(map, year, 6, 19, '六月十九日', 'Juneteenth', 'US');
    addFixed(map, year, 7, 4, '独立日', 'Independence Day', 'US');
    addNth(map, year, 9, 1, 1, '劳动节', 'Labor Day', 'US');
    addNth(map, year, 11, 4, 4, '感恩节', 'Thanksgiving', 'US');
    addFixed(map, year, 12, 25, '圣诞节', 'Christmas', 'US');
  }

  if (countryCodes.has('GB')) {
    addFixed(map, year, 1, 1, '元旦', "New Year's", 'GB');
    addEaster(map, year, -2, '耶稣受难日', 'Good Friday', 'GB');
    addEaster(map, year, 1, '复活节', 'Easter Monday', 'GB');
    addNth(map, year, 5, 1, 1, '早春假', 'Early May BH', 'GB');
    addNth(map, year, 5, 1, -1, '晚春假', 'Spring BH', 'GB');
    addNth(map, year, 8, 1, -1, '夏季假', 'Summer BH', 'GB');
    addFixed(map, year, 12, 25, '圣诞节', 'Christmas', 'GB');
    addFixed(map, year, 12, 26, '节礼日', 'Boxing Day', 'GB');
  }

  if (countryCodes.has('FR')) {
    addFixed(map, year, 1, 1, '元旦', "New Year's", 'FR');
    addEaster(map, year, 1, '复活节周一', 'Easter Monday', 'FR');
    addFixed(map, year, 5, 1, '劳动节', 'Labour Day', 'FR');
    addFixed(map, year, 5, 8, '二战胜利日', 'Victory Day', 'FR');
    addEaster(map, year, 39, '耶稣升天节', 'Ascension Day', 'FR');
    addEaster(map, year, 50, '圣灵降临节', 'Whit Monday', 'FR');
    addFixed(map, year, 7, 14, '法国国庆', 'Bastille Day', 'FR');
    addFixed(map, year, 8, 15, '圣母升天', 'Assumption', 'FR');
    addFixed(map, year, 11, 1, '万圣节', "All Saints'", 'FR');
    addFixed(map, year, 11, 11, '停战纪念日', 'Armistice Day', 'FR');
    addFixed(map, year, 12, 25, '圣诞节', 'Christmas', 'FR');
  }

  if (countryCodes.has('DE')) {
    addFixed(map, year, 1, 1, '元旦', "New Year's", 'DE');
    addEaster(map, year, -2, '耶稣受难日', 'Good Friday', 'DE');
    addEaster(map, year, 1, '复活节周一', 'Easter Monday', 'DE');
    addFixed(map, year, 5, 1, '劳动节', 'Labour Day', 'DE');
    addEaster(map, year, 39, '耶稣升天节', 'Ascension', 'DE');
    addEaster(map, year, 50, '圣灵降临节', 'Whit Monday', 'DE');
    addFixed(map, year, 10, 3, '德国统一日', 'German Unity', 'DE');
    addFixed(map, year, 12, 25, '圣诞节', 'Christmas', 'DE');
    addFixed(map, year, 12, 26, '圣诞第二日', 'Boxing Day', 'DE');
  }

  if (countryCodes.has('JP')) {
    addFixed(map, year, 1, 1, '元旦', "New Year's", 'JP');
    addNth(map, year, 1, 1, 2, '成人节', 'Coming-of-Age', 'JP');
    addFixed(map, year, 2, 11, '建国纪念日', 'Foundation Day', 'JP');
    addFixed(map, year, 2, 23, '天皇诞生日', "Emperor's Birthday", 'JP');
    addFixed(map, year, 4, 29, '昭和节', 'Showa Day', 'JP');
    addFixed(map, year, 5, 3, '宪法纪念日', 'Constitution Day', 'JP');
    addFixed(map, year, 5, 4, '绿之日', 'Greenery Day', 'JP');
    addFixed(map, year, 5, 5, '儿童节', "Children's Day", 'JP');
    addNth(map, year, 7, 1, 3, '海洋节', 'Marine Day', 'JP');
    addFixed(map, year, 8, 11, '山之日', 'Mountain Day', 'JP');
    addNth(map, year, 9, 1, 3, '敬老节', 'Respect for Aged', 'JP');
    addNth(map, year, 10, 1, 2, '体育节', 'Sports Day', 'JP');
    addFixed(map, year, 11, 3, '文化节', 'Culture Day', 'JP');
    addFixed(map, year, 11, 23, '勤劳感谢日', 'Labour Thanks', 'JP');
  }

  if (countryCodes.has('KR')) {
    addFixed(map, year, 1, 1, '元旦', "New Year's", 'KR');
    const sf2 = SPRING_FESTIVAL[year];
    if (sf2) {
      const sfDate = new Date(`${year}-${sf2}`);
      addH(map, fmt(addDays(sfDate, -1)), { name: '大年三十', nameEn: 'Seollal Eve', country: 'KR' });
      addH(map, `${year}-${sf2}`, { name: '春节', nameEn: 'Seollal', country: 'KR' });
      addH(map, fmt(addDays(sfDate, 1)), { name: '春节假', nameEn: 'Seollal+1', country: 'KR' });
    }
    addFixed(map, year, 3, 1, '三一运动纪念日', 'Independence Movement', 'KR');
    addFixed(map, year, 5, 5, '儿童节', "Children's Day", 'KR');
    addFixed(map, year, 8, 15, '光复节', 'Liberation Day', 'KR');
    const ma2 = MID_AUTUMN[year];
    if (ma2) {
      const maDate = new Date(`${year}-${ma2}`);
      addH(map, fmt(addDays(maDate, -1)), { name: '中秋前夕', nameEn: 'Chuseok Eve', country: 'KR' });
      addH(map, `${year}-${ma2}`, { name: '中秋节', nameEn: 'Chuseok', country: 'KR' });
      addH(map, fmt(addDays(maDate, 1)), { name: '中秋假', nameEn: 'Chuseok+1', country: 'KR' });
    }
    addFixed(map, year, 10, 3, '开天节', 'National Foundation', 'KR');
    addFixed(map, year, 10, 9, '韩文节', 'Hangul Day', 'KR');
    addFixed(map, year, 12, 25, '圣诞节', 'Christmas', 'KR');
  }

  if (countryCodes.has('RU')) {
    addFixed(map, year, 1, 1, '元旦', "New Year's", 'RU');
    addFixed(map, year, 2, 23, '保卫者日', "Defender's Day", 'RU');
    addFixed(map, year, 3, 8, '妇女节', "Women's Day", 'RU');
    addFixed(map, year, 5, 1, '劳动节', 'Spring & Labour', 'RU');
    addFixed(map, year, 5, 9, '胜利日', 'Victory Day', 'RU');
    addFixed(map, year, 6, 12, '俄罗斯日', 'Russia Day', 'RU');
    addFixed(map, year, 11, 4, '民族团结日', 'National Unity', 'RU');
  }

  if (countryCodes.has('IN')) {
    addFixed(map, year, 1, 26, '共和国日', 'Republic Day', 'IN');
    addFixed(map, year, 8, 15, '独立日', 'Independence Day', 'IN');
    addFixed(map, year, 10, 2, '甘地诞辰', "Gandhi Jayanti", 'IN');
  }

  if (countryCodes.has('BR')) {
    addFixed(map, year, 1, 1, '元旦', "New Year's", 'BR');
    addEaster(map, year, -48, '嘉年华', 'Carnival Mon', 'BR');
    addEaster(map, year, -47, '嘉年华', 'Carnival Tue', 'BR');
    addEaster(map, year, -2, '耶稣受难日', 'Good Friday', 'BR');
    addFixed(map, year, 4, 21, '纪念日', "Tiradentes'", 'BR');
    addFixed(map, year, 5, 1, '劳动节', 'Labour Day', 'BR');
    addFixed(map, year, 9, 7, '独立日', 'Independence', 'BR');
    addFixed(map, year, 10, 12, '圣母日', 'Our Lady', 'BR');
    addFixed(map, year, 11, 2, '亡灵节', 'All Souls', 'BR');
    addFixed(map, year, 11, 15, '共和国日', 'Republic Day', 'BR');
    addFixed(map, year, 12, 25, '圣诞节', 'Christmas', 'BR');
  }

  if (countryCodes.has('AU')) {
    addFixed(map, year, 1, 1, '元旦', "New Year's", 'AU');
    addFixed(map, year, 1, 26, '澳大利亚日', 'Australia Day', 'AU');
    addEaster(map, year, -2, '耶稣受难日', 'Good Friday', 'AU');
    addEaster(map, year, 1, '复活节周一', 'Easter Monday', 'AU');
    addNth(map, year, 6, 1, 2, '国王生日', "King's Birthday", 'AU');
    addFixed(map, year, 12, 25, '圣诞节', 'Christmas', 'AU');
    addFixed(map, year, 12, 26, '节礼日', 'Boxing Day', 'AU');
  }

  if (countryCodes.has('CA')) {
    addFixed(map, year, 1, 1, '元旦', "New Year's", 'CA');
    addEaster(map, year, -2, '耶稣受难日', 'Good Friday', 'CA');
    addEaster(map, year, 1, '复活节周一', 'Easter Monday', 'CA');
    addNth(map, year, 5, 1, -1, '维多利亚日', 'Victoria Day', 'CA');
    addFixed(map, year, 7, 1, '加拿大日', 'Canada Day', 'CA');
    addNth(map, year, 9, 1, 1, '劳动节', 'Labour Day', 'CA');
    addNth(map, year, 10, 1, 2, '感恩节', 'Thanksgiving', 'CA');
    addFixed(map, year, 11, 11, '国殇纪念日', 'Remembrance', 'CA');
    addFixed(map, year, 12, 25, '圣诞节', 'Christmas', 'CA');
    addFixed(map, year, 12, 26, '节礼日', 'Boxing Day', 'CA');
  }

  if (countryCodes.has('IT')) {
    addFixed(map, year, 1, 1, '元旦', "New Year's", 'IT');
    addFixed(map, year, 1, 6, '主显节', 'Epiphany', 'IT');
    addEaster(map, year, 1, '复活节周一', 'Easter Monday', 'IT');
    addFixed(map, year, 4, 25, '解放日', 'Liberation Day', 'IT');
    addFixed(map, year, 5, 1, '劳动节', 'Labour Day', 'IT');
    addFixed(map, year, 6, 2, '共和国日', 'Republic Day', 'IT');
    addFixed(map, year, 8, 15, '圣母升天', 'Assumption', 'IT');
    addFixed(map, year, 11, 1, '万圣节', "All Saints'", 'IT');
    addFixed(map, year, 12, 8, '圣母无染原罪', 'Immaculate', 'IT');
    addFixed(map, year, 12, 25, '圣诞节', 'Christmas', 'IT');
    addFixed(map, year, 12, 26, '圣斯蒂芬节', "St Stephen's", 'IT');
  }

  if (countryCodes.has('ES')) {
    addFixed(map, year, 1, 1, '元旦', "New Year's", 'ES');
    addFixed(map, year, 1, 6, '三王节', 'Epiphany', 'ES');
    addEaster(map, year, -2, '耶稣受难日', 'Good Friday', 'ES');
    addFixed(map, year, 5, 1, '劳动节', 'Labour Day', 'ES');
    addFixed(map, year, 8, 15, '圣母升天', 'Assumption', 'ES');
    addFixed(map, year, 10, 12, '西班牙国庆', 'National Day', 'ES');
    addFixed(map, year, 11, 1, '万圣节', "All Saints'", 'ES');
    addFixed(map, year, 12, 6, '宪法日', 'Constitution Day', 'ES');
    addFixed(map, year, 12, 8, '圣母无染', 'Immaculate', 'ES');
    addFixed(map, year, 12, 25, '圣诞节', 'Christmas', 'ES');
  }

  if (countryCodes.has('MX')) {
    addFixed(map, year, 1, 1, '元旦', "New Year's", 'MX');
    addNth(map, year, 2, 1, 1, '宪法日', 'Constitution Day', 'MX');
    addNth(map, year, 3, 1, 3, '贝尼托日', "Benito Juárez", 'MX');
    addFixed(map, year, 5, 1, '劳动节', 'Labour Day', 'MX');
    addFixed(map, year, 9, 16, '独立日', 'Independence', 'MX');
    addNth(map, year, 11, 1, 3, '革命纪念日', 'Revolution Day', 'MX');
    addFixed(map, year, 12, 25, '圣诞节', 'Christmas', 'MX');
  }

  if (countryCodes.has('AR')) {
    addFixed(map, year, 1, 1, '元旦', "New Year's", 'AR');
    addEaster(map, year, -2, '耶稣受难日', 'Good Friday', 'AR');
    addFixed(map, year, 4, 2, '马岛战争', 'Malvinas Day', 'AR');
    addFixed(map, year, 5, 1, '劳动节', 'Labour Day', 'AR');
    addFixed(map, year, 5, 25, '五月革命', 'May Revolution', 'AR');
    addFixed(map, year, 7, 9, '独立日', 'Independence', 'AR');
    addFixed(map, year, 12, 25, '圣诞节', 'Christmas', 'AR');
  }

  if (countryCodes.has('SG')) {
    addFixed(map, year, 1, 1, '元旦', "New Year's", 'SG');
    const sgSf = SPRING_FESTIVAL[year];
    if (sgSf) {
      addH(map, `${year}-${sgSf}`, { name: '华人新年', nameEn: 'Chinese New Year', country: 'SG' });
      addH(map, fmt(addDays(new Date(`${year}-${sgSf}`), 1)), { name: '华人新年翌日', nameEn: 'CNY Day 2', country: 'SG' });
    }
    addEaster(map, year, -2, '耶稣受难日', 'Good Friday', 'SG');
    addFixed(map, year, 5, 1, '劳动节', 'Labour Day', 'SG');
    addFixed(map, year, 8, 9, '国庆日', 'National Day', 'SG');
    addFixed(map, year, 12, 25, '圣诞节', 'Christmas', 'SG');
    const eid = EID_FITR[year];
    if (eid) addH(map, `${year}-${eid}`, { name: '开斋节', nameEn: 'Eid al-Fitr', country: 'SG' });
    const adha = EID_ADHA[year];
    if (adha) addH(map, `${year}-${adha}`, { name: '哈芝节', nameEn: 'Eid al-Adha', country: 'SG' });
  }

  if (countryCodes.has('TH')) {
    addFixed(map, year, 1, 1, '元旦', "New Year's", 'TH');
    addFixed(map, year, 4, 6, '节基王朝纪念日', 'Chakri Day', 'TH');
    addFixed(map, year, 4, 13, '宋干节', 'Songkran', 'TH');
    addFixed(map, year, 4, 14, '宋干节', 'Songkran', 'TH');
    addFixed(map, year, 4, 15, '宋干节', 'Songkran', 'TH');
    addFixed(map, year, 5, 1, '劳动节', 'Labour Day', 'TH');
    addFixed(map, year, 5, 4, '国王加冕日', 'Coronation Day', 'TH');
    addFixed(map, year, 7, 28, '国王诞生日', "King's Birthday", 'TH');
    addFixed(map, year, 8, 12, '国母诞生日', "Queen Mother's B.", 'TH');
    addFixed(map, year, 10, 13, '先王纪念日', 'Memorial Day', 'TH');
    addFixed(map, year, 10, 23, '五世王纪念日', 'Chulalongkorn', 'TH');
    addFixed(map, year, 12, 5, '父亲节', "Father's Day", 'TH');
    addFixed(map, year, 12, 10, '宪法日', 'Constitution Day', 'TH');
  }

  if (countryCodes.has('VN')) {
    addFixed(map, year, 1, 1, '元旦', "New Year's", 'VN');
    const vnSf = SPRING_FESTIVAL[year];
    if (vnSf) {
      const d1 = new Date(`${year}-${vnSf}`);
      for (let i = -1; i <= 3; i++) addH(map, fmt(addDays(d1, i)), { name: '越南春节', nameEn: 'Tết', country: 'VN' });
    }
    addFixed(map, year, 4, 30, '南方解放日', 'Reunification', 'VN');
    addFixed(map, year, 5, 1, '劳动节', 'Labour Day', 'VN');
    addFixed(map, year, 9, 2, '国庆节', 'National Day', 'VN');
  }

  if (countryCodes.has('MY')) {
    addFixed(map, year, 1, 1, '元旦', "New Year's", 'MY');
    const mySf = SPRING_FESTIVAL[year];
    if (mySf) {
      addH(map, `${year}-${mySf}`, { name: '华人新年', nameEn: 'Chinese New Year', country: 'MY' });
      addH(map, fmt(addDays(new Date(`${year}-${mySf}`), 1)), { name: '华人新年翌日', nameEn: 'CNY Day 2', country: 'MY' });
    }
    addFixed(map, year, 5, 1, '劳动节', 'Labour Day', 'MY');
    addFixed(map, year, 8, 31, '国庆日', 'National Day', 'MY');
    addFixed(map, year, 9, 16, '马来西亚日', 'Malaysia Day', 'MY');
    addFixed(map, year, 12, 25, '圣诞节', 'Christmas', 'MY');
    const eid = EID_FITR[year];
    if (eid) {
      addH(map, `${year}-${eid}`, { name: '开斋节', nameEn: 'Eid al-Fitr', country: 'MY' });
      addH(map, fmt(addDays(new Date(`${year}-${eid}`), 1)), { name: '开斋节翌日', nameEn: 'Eid Day 2', country: 'MY' });
    }
  }

  if (countryCodes.has('ID')) {
    addFixed(map, year, 1, 1, '元旦', "New Year's", 'ID');
    addEaster(map, year, -2, '耶稣受难日', 'Good Friday', 'ID');
    addFixed(map, year, 5, 1, '劳动节', 'Labour Day', 'ID');
    addFixed(map, year, 8, 17, '独立日', 'Independence', 'ID');
    addFixed(map, year, 12, 25, '圣诞节', 'Christmas', 'ID');
    const eid = EID_FITR[year];
    if (eid) {
      addH(map, `${year}-${eid}`, { name: '开斋节', nameEn: 'Eid al-Fitr', country: 'ID' });
      addH(map, fmt(addDays(new Date(`${year}-${eid}`), 1)), { name: '开斋节翌日', nameEn: 'Eid Day 2', country: 'ID' });
    }
    const adha = EID_ADHA[year];
    if (adha) addH(map, `${year}-${adha}`, { name: '宰牲节', nameEn: 'Eid al-Adha', country: 'ID' });
  }

  if (countryCodes.has('NL')) {
    addFixed(map, year, 1, 1, '元旦', "New Year's", 'NL');
    addEaster(map, year, -2, '耶稣受难日', 'Good Friday', 'NL');
    addEaster(map, year, 1, '复活节周一', 'Easter Monday', 'NL');
    addFixed(map, year, 4, 27, '国王节', "King's Day", 'NL');
    addEaster(map, year, 39, '耶稣升天节', 'Ascension', 'NL');
    addEaster(map, year, 50, '圣灵降临节', 'Whit Monday', 'NL');
    addFixed(map, year, 12, 25, '圣诞节', 'Christmas', 'NL');
    addFixed(map, year, 12, 26, '圣诞第二日', 'Boxing Day', 'NL');
  }

  if (countryCodes.has('SE')) {
    addFixed(map, year, 1, 1, '元旦', "New Year's", 'SE');
    addFixed(map, year, 1, 6, '主显节', 'Epiphany', 'SE');
    addEaster(map, year, -2, '耶稣受难日', 'Good Friday', 'SE');
    addEaster(map, year, 1, '复活节周一', 'Easter Monday', 'SE');
    addFixed(map, year, 5, 1, '五一节', 'Labour Day', 'SE');
    addEaster(map, year, 39, '耶稣升天节', 'Ascension', 'SE');
    addFixed(map, year, 6, 6, '国庆日', 'National Day', 'SE');
    addFixed(map, year, 12, 25, '圣诞节', 'Christmas', 'SE');
    addFixed(map, year, 12, 26, '圣诞第二日', 'Boxing Day', 'SE');
  }

  if (countryCodes.has('PL')) {
    addFixed(map, year, 1, 1, '元旦', "New Year's", 'PL');
    addFixed(map, year, 1, 6, '三王节', 'Epiphany', 'PL');
    addEaster(map, year, 1, '复活节周一', 'Easter Monday', 'PL');
    addFixed(map, year, 5, 1, '劳动节', 'Labour Day', 'PL');
    addFixed(map, year, 5, 3, '宪法纪念日', 'Constitution Day', 'PL');
    addEaster(map, year, 50, '圣灵降临节', 'Whit Sunday', 'PL');
    addFixed(map, year, 8, 15, '圣母升天', 'Assumption', 'PL');
    addFixed(map, year, 11, 1, '万圣节', "All Saints'", 'PL');
    addFixed(map, year, 11, 11, '独立日', 'Independence', 'PL');
    addFixed(map, year, 12, 25, '圣诞节', 'Christmas', 'PL');
    addFixed(map, year, 12, 26, '圣诞第二日', 'Christmas 2nd', 'PL');
  }

  if (countryCodes.has('TR')) {
    addFixed(map, year, 1, 1, '元旦', "New Year's", 'TR');
    addFixed(map, year, 4, 23, '国家主权日', 'National Sov.', 'TR');
    addFixed(map, year, 5, 1, '劳动节', 'Labour Day', 'TR');
    addFixed(map, year, 5, 19, '阿塔土克纪念日', 'Atatürk Day', 'TR');
    addFixed(map, year, 7, 15, '民主日', 'Democracy Day', 'TR');
    addFixed(map, year, 8, 30, '胜利日', 'Victory Day', 'TR');
    addFixed(map, year, 10, 29, '共和国日', 'Republic Day', 'TR');
    const eid = EID_FITR[year];
    if (eid) {
      addH(map, `${year}-${eid}`, { name: '开斋节', nameEn: 'Eid al-Fitr', country: 'TR' });
      addH(map, fmt(addDays(new Date(`${year}-${eid}`), 1)), { name: '开斋节次日', nameEn: 'Eid Day 2', country: 'TR' });
      addH(map, fmt(addDays(new Date(`${year}-${eid}`), 2)), { name: '开斋节三日', nameEn: 'Eid Day 3', country: 'TR' });
    }
    const adha = EID_ADHA[year];
    if (adha) {
      addH(map, `${year}-${adha}`, { name: '宰牲节', nameEn: 'Eid al-Adha', country: 'TR' });
      for (let i = 1; i <= 3; i++) addH(map, fmt(addDays(new Date(`${year}-${adha}`), i)), { name: '宰牲节', nameEn: 'Eid al-Adha', country: 'TR' });
    }
  }

  return map;
}

export function getHolidaysForYear(year: number, countryCodes: string[]): Map<string, Holiday[]> {
  const key = `${year}:${[...countryCodes].sort().join(',')}`;
  if (_hCache.has(key)) return _hCache.get(key)!;
  const result = buildYear(year, new Set(countryCodes));
  _hCache.set(key, result);
  return result;
}

export function getHolidaysForDate(date: Date, countryCodes: string[]): Holiday[] {
  if (!countryCodes.length) return [];
  const y = date.getFullYear();
  const map = getHolidaysForYear(y, countryCodes);
  const key = `${y}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  return map.get(key) ?? [];
}
