/**
 * Seed reference data.
 *
 * Kept as data rather than inline code so a route or airline can be added without
 * touching the seeding algorithm, and so the shape is reviewable in one place.
 */

export const AIRPORTS = [
  ['ULN', 'ZMUB', 'Chinggis Khaan International', 'Ulaanbaatar', 'MN', 'Asia/Ulaanbaatar'],
  ['SEL', 'RKSI', 'Incheon International', 'Seoul', 'KR', 'Asia/Seoul'],
  ['GMP', 'RKSS', 'Gimpo International', 'Seoul', 'KR', 'Asia/Seoul'],
  ['PEK', 'ZBAA', 'Beijing Capital International', 'Beijing', 'CN', 'Asia/Shanghai'],
  ['PVG', 'ZSPD', 'Shanghai Pudong International', 'Shanghai', 'CN', 'Asia/Shanghai'],
  ['HKG', 'VHHH', 'Hong Kong International', 'Hong Kong', 'HK', 'Asia/Hong_Kong'],
  ['NRT', 'RJAA', 'Narita International', 'Tokyo', 'JP', 'Asia/Tokyo'],
  ['HND', 'RJTT', 'Haneda', 'Tokyo', 'JP', 'Asia/Tokyo'],
  ['KIX', 'RJBB', 'Kansai International', 'Osaka', 'JP', 'Asia/Tokyo'],
  ['SIN', 'WSSS', 'Changi', 'Singapore', 'SG', 'Asia/Singapore'],
  ['BKK', 'VTBS', 'Suvarnabhumi', 'Bangkok', 'TH', 'Asia/Bangkok'],
  ['KUL', 'WMKK', 'Kuala Lumpur International', 'Kuala Lumpur', 'MY', 'Asia/Kuala_Lumpur'],
  ['DEL', 'VIDP', 'Indira Gandhi International', 'Delhi', 'IN', 'Asia/Kolkata'],
  ['DXB', 'OMDB', 'Dubai International', 'Dubai', 'AE', 'Asia/Dubai'],
  ['IST', 'LTFM', 'Istanbul Airport', 'Istanbul', 'TR', 'Europe/Istanbul'],
  ['FRA', 'EDDF', 'Frankfurt Airport', 'Frankfurt', 'DE', 'Europe/Berlin'],
  ['LHR', 'EGLL', 'Heathrow', 'London', 'GB', 'Europe/London'],
  ['CDG', 'LFPG', 'Charles de Gaulle', 'Paris', 'FR', 'Europe/Paris'],
  ['JFK', 'KJFK', 'John F. Kennedy International', 'New York', 'US', 'America/New_York'],
  ['LAX', 'KLAX', 'Los Angeles International', 'Los Angeles', 'US', 'America/Los_Angeles'],
];

export const AIRLINES = [
  ['OM', 'MGL', '289', 'MIAT Mongolian Airlines'],
  ['KE', 'KAL', '180', 'Korean Air'],
  ['OZ', 'AAR', '988', 'Asiana Airlines'],
  ['JL', 'JAL', '131', 'Japan Airlines'],
  ['NH', 'ANA', '205', 'All Nippon Airways'],
  ['SQ', 'SIA', '618', 'Singapore Airlines'],
  ['TG', 'THA', '217', 'Thai Airways'],
  ['CA', 'CCA', '999', 'Air China'],
  ['CX', 'CPA', '160', 'Cathay Pacific'],
  ['EK', 'UAE', '176', 'Emirates'],
  ['TK', 'THY', '235', 'Turkish Airlines'],
  ['LH', 'DLH', '220', 'Lufthansa'],
];

/**
 * Narrow-body: 30 economy rows, A-F, aisle after the third column.
 * Wide-body: 8 business rows in a 2-2-2 deck and 33 economy rows in 3-3-3.
 * The middle rows carry a surcharge, which is what makes the exit row worth
 * paying for.
 */
export const SEAT_LAYOUTS = [
  {
    code: 'narrow-3-3-180',
    aircraftModel: 'Boeing 737-800',
    configuration: '3-3',
    cabins: [
      {
        cabin: 'ECONOMY',
        label: 'Economy',
        firstRow: 1,
        lastRow: 30,
        columns: ['A', 'B', 'C', 'D', 'E', 'F'],
        aisleAfter: [3],
        rows: [
          { row: 1, isExitRow: false, isBulkhead: true, hasBassinet: true, missingColumns: [], blockedColumns: ['A', 'F'], surchargeColumns: [], surcharge: 0 },
          { row: 12, isExitRow: true, isBulkhead: false, hasBassinet: false, missingColumns: [], blockedColumns: [], surchargeColumns: ['A', 'F'], surcharge: 2_500 },
          { row: 13, isExitRow: true, isBulkhead: false, hasBassinet: false, missingColumns: [], blockedColumns: [], surchargeColumns: ['A', 'F'], surcharge: 2_500 },
        ],
      },
    ],
  },
  {
    code: 'wide-2-2-2-3-3-3-300',
    aircraftModel: 'Boeing 787-9',
    configuration: '2-2-2 / 3-3-3',
    cabins: [
      {
        cabin: 'BUSINESS',
        label: 'Business',
        firstRow: 1,
        lastRow: 8,
        columns: ['A', 'C', 'D', 'F', 'G', 'K'],
        aisleAfter: [2, 4],
        rows: [
          { row: 1, isExitRow: false, isBulkhead: true, hasBassinet: true, missingColumns: [], blockedColumns: [], surchargeColumns: [], surcharge: 0 },
        ],
      },
      {
        cabin: 'ECONOMY',
        label: 'Economy',
        firstRow: 10,
        lastRow: 42,
        columns: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'K'],
        aisleAfter: [3, 6],
        rows: [
          { row: 10, isExitRow: false, isBulkhead: true, hasBassinet: true, missingColumns: [], blockedColumns: ['A', 'K'], surchargeColumns: [], surcharge: 0 },
          { row: 22, isExitRow: true, isBulkhead: false, hasBassinet: false, missingColumns: [], blockedColumns: [], surchargeColumns: ['A', 'K'], surcharge: 3_500 },
          { row: 23, isExitRow: true, isBulkhead: false, hasBassinet: false, missingColumns: [], blockedColumns: [], surchargeColumns: ['A', 'K'], surcharge: 3_500 },
        ],
      },
    ],
  },
];

/** Fare product matrix, applied to every airline. */
export const FARE_CLASSES = [
  { code: 'Y', cabin: 'ECONOMY', name: 'Full Flex', tier: 3, baggage: '2PC', cabinBag: '1PC', changeable: true, refundable: true, changeFee: 0, cancelFee: 0, cancelPenaltyPct: 0, multiplier: 1.9 },
  { code: 'M', cabin: 'ECONOMY', name: 'Standard', tier: 3, baggage: '1PC', cabinBag: '1PC', changeable: true, refundable: false, changeFee: 8_000, cancelFee: 0, cancelPenaltyPct: 100, multiplier: 1.35 },
  { code: 'V', cabin: 'ECONOMY', name: 'Saver', tier: 3, baggage: '1PC', cabinBag: '1PC', changeable: false, refundable: false, changeFee: 0, cancelFee: 0, cancelPenaltyPct: 100, multiplier: 1.0 },
  { code: 'C', cabin: 'BUSINESS', name: 'Business', tier: 1, baggage: '3PC', cabinBag: '2PC', changeable: true, refundable: true, changeFee: 0, cancelFee: 0, cancelPenaltyPct: 0, multiplier: 4.2 },
];

/** `[origin, destination, airlineIata, durationMinutes, basePrice, wideBody]` */
export const ROUTES = [
  ['ULN', 'SEL', 'OM', 195, 42_000, false],
  ['SEL', 'ULN', 'OM', 210, 44_000, false],
  ['ULN', 'PEK', 'CA', 130, 31_000, false],
  ['ULN', 'HKG', 'OM', 260, 58_000, false],
  ['ULN', 'NRT', 'OM', 250, 61_000, false],
  ['ULN', 'SIN', 'SQ', 390, 88_000, true],
  ['ULN', 'IST', 'TK', 480, 96_000, true],
  ['ULN', 'FRA', 'LH', 540, 124_000, true],
  ['SEL', 'NRT', 'KE', 140, 27_000, false],
  ['SEL', 'BKK', 'TG', 345, 52_000, true],
  ['SEL', 'SIN', 'SQ', 380, 66_000, true],
  ['SEL', 'JFK', 'KE', 830, 168_000, true],
  ['NRT', 'LAX', 'NH', 610, 132_000, true],
  ['NRT', 'CDG', 'JL', 740, 148_000, true],
  ['SIN', 'LHR', 'SQ', 830, 172_000, true],
  ['DXB', 'LHR', 'EK', 445, 108_000, true],
  ['DXB', 'JFK', 'EK', 830, 186_000, true],
  ['IST', 'CDG', 'TK', 205, 44_000, false],
  ['FRA', 'LHR', 'LH', 105, 26_000, false],
  ['FRA', 'JFK', 'LH', 520, 118_000, true],
  ['CDG', 'JFK', 'LH', 495, 112_000, true],
  ['BKK', 'DEL', 'TG', 250, 38_000, false],
  ['KUL', 'SIN', 'SQ', 65, 14_000, false],
  ['HND', 'KIX', 'JL', 75, 16_000, false],
  ['ULN', 'HND', 'OM', 255, 64_000, false],
];

/** Six departure banks a day, which keeps a route's schedule believable. */
export const DEPARTURE_HOURS = [1, 4, 8, 12, 16, 20];
export const SEED_DAYS = 30;

export const PROMO_CODES = [
  { code: 'WELCOME10', description: '10% off your first booking', discountType: 'PERCENTAGE', discountValue: 10, maxDiscountAmount: 50_000 },
  { code: 'MONGOOSE50', description: '50 USD off', discountType: 'FIXED_AMOUNT', discountValue: 5_000, maxDiscountAmount: null },
  { code: 'SUMMER2026', description: '15% off summer travel', discountType: 'PERCENTAGE', discountValue: 15, maxDiscountAmount: 80_000 },
];

export const TAXONOMY = [
  {
    slug: 'seats',
    name: 'Seats',
    description: 'Extra legroom and seat selection',
    sortOrder: 1,
    products: [
      { sku: 'SEAT-XL', name: 'Extra legroom seat', price: 4_800, kind: 'SEAT' },
      { sku: 'SEAT-STD', name: 'Standard seat selection', price: 1_500, kind: 'SEAT' },
    ],
  },
  {
    slug: 'baggage',
    name: 'Baggage',
    description: 'Checked baggage allowances',
    sortOrder: 2,
    products: [
      { sku: 'BAG-23', name: '23 kg checked bag', price: 3_500, kind: 'BAGGAGE' },
      { sku: 'BAG-32', name: '32 kg checked bag', price: 5_500, kind: 'BAGGAGE' },
    ],
  },
  {
    slug: 'meals',
    name: 'Meals',
    description: 'Inflight meal upgrades',
    sortOrder: 3,
    products: [
      { sku: 'MEAL-VGML', name: 'Vegetarian meal', price: 1_200, kind: 'MEAL' },
      { sku: 'MEAL-HLML', name: 'Halal meal', price: 1_200, kind: 'MEAL' },
    ],
  },
  {
    slug: 'insurance',
    name: 'Insurance',
    description: 'Travel protection',
    sortOrder: 4,
    products: [
      { sku: 'INS-TRAVEL', name: 'Travel insurance', price: 2_900, kind: 'INSURANCE' },
    ],
  },
  {
    slug: 'lounge',
    name: 'Lounge',
    description: 'Airport lounge access',
    sortOrder: 5,
    products: [
      { sku: 'LOUNGE-PASS', name: 'Lounge day pass', price: 3_900, kind: 'LOUNGE' },
    ],
  },
];

export const NEWS_ARTICLES = [
  {
    slug: 'ulaanbaatar-singapore-direct',
    date: '2026-09-28',
    category: 'Шинэ чиглэл',
    title: 'Улаанбаатар — Сингапур шууд нислэг нээгдлээ',
    excerpt: 'Долоо хоногт 4 удаа нислэг үйлдэх бөгөөд эхний сард 15% хямдралтай.',
    body: [
      'Бид Улаанбаатар — Сингапур чиглэлд шууд нислэг үйлдэж эхэллээ. Нислэг мягмар, пүрэв, бямба, ням гарагт үйлдэгдэж, нислэгийн хугацаа 6 цаг 40 минут байна.',
      'Нээлтийн сард бүх ангилалд 15% хямдрал үйлчилнэ. Хямдрал нь захиалга баталгаажсан өдрөөс эхлэн 30 хоногийн дотор хүчинтэй.',
      'Сингапур нь Зүүн Өмнөд Азийн гол холбоос болж, Куала Лумпур, Жакарта, Бангкок чиглэлд цааш нисэх боломжтой.',
    ],
  },
  {
    slug: 'refund-time-reduced',
    date: '2026-09-15',
    category: 'Үйлчилгээ',
    title: 'Буцаалтын хугацаа 3 хоног болж буурлаа',
    excerpt: 'Автоматжуулсан буцаалтын урсгалаар мөнгө 3 ажлын өдөрт багтаж буцна.',
    body: [
      'Өмнө нь буцаалт 7-14 ажлын өдөр шаарддаг байсан. Одоо автоматжуулсан урсгалын ачаар 3 ажлын өдөрт багтаж шийдэгдэнэ.',
      'Хэрэглэгч "Миний захиалгууд" хуудаснаасаа цуцалмагц буцаалтын хүсэлт шууд бүртгэгдэж, төлбөрийн систем рүү автоматаар илгээгдэнэ.',
      'Банкны карт руу буцаах хугацаа нь банкнаас хамаарч 1-3 ажлын өдөр нэмэгдэж болно.',
    ],
  },
  {
    slug: 'realtime-seat-map',
    date: '2026-08-30',
    category: 'Технологи',
    title: 'Суудлын зураглал бодит цагт шинэчлэгддэг боллоо',
    excerpt: 'Одоо суудлын төлөв өөрчлөгдөх бүрд шууд харагдана. Хуучирсан мэдээлэл байхгүй.',
    body: [
      'Суудлын зураглал нь өөр хэрэглэгч суудал сонгох бүрд бодит цагт шинэчлэгдэнэ. Хуудсаа дахин ачаалах шаардлагагүй.',
      'Суудал сонгох үед мөр түгжигдэж, гүйлгээ түвшинд хамгаалагдана. Иймд хоёр хүн нэг суудлыг зэрэг авах боломжгүй.',
      'Хэрэв сонгосон суудал тань өөр хэрэглэгчид шилжсэн бол систем шууд мэдэгдэж, өөр суудал санал болгоно.',
    ],
  },
  {
    slug: 'winter-schedule',
    date: '2026-08-12',
    category: 'Хуваарь',
    title: 'Өвлийн улирлын нислэгийн хуваарь хүчин төгөлдөр боллоо',
    excerpt: 'Токио, Сөүл, Истанбул чиглэлд нэмэлт нислэг нэмэгдлээ.',
    body: [
      'Аравдугаар сарын 26-наас эхлэн өвлийн улирлын хуваарь хүчин төгөлдөр болно.',
      'Токио чиглэлд долоо хоногт 5 нислэг, Сөүл чиглэлд 14 нислэг, Истанбул чиглэлд 4 нислэг нэмэгдэж байна.',
      'Хуучин хуваариар авсан захиалгууд хүчинтэй хэвээр байх бөгөөд өөрчлөлт гарвал имэйлээр мэдэгдэнэ.',
    ],
  },
  {
    slug: 'mobile-boarding-pass',
    date: '2026-07-20',
    category: 'Үйлчилгээ',
    title: 'Цахим boarding pass утсандаа хадгалагдана',
    excerpt: 'Тасалбар олгогдмагц утасны түрийвчинд автоматаар нэмэгдэнэ.',
    body: [
      'Тасалбар олгогдсоны дараа boarding pass утасны Apple Wallet эсвэл Google Wallet руу автоматаар нэмэгдэнэ.',
      'Ингэснээр нисэх буудал дээр цаасан тасалбар хэвлэх, дараалалд зогсох шаардлагагүй.',
      'Хэвлэсэн хувилбар хэрэгтэй бол захиалгын хуудаснаасаа PDF татаж авч болно.',
    ],
  },
  {
    slug: 'travel-tips-mongolia',
    date: '2026-06-05',
    category: 'Аяллын зөвлөгөө',
    title: 'Гадаадад аялахдаа анхаарах 7 зүйл',
    excerpt: 'Паспорт, виз, даатгал, мөнгө — аялал эхлэхээс өмнө бэлдэх зүйлс.',
    body: [
      'Паспортын хүчинтэй хугацаа нь буцаж ирэх өдрөөс хойш дор хаяж 6 сар байх ёстой.',
      'Очих улсын визийн шаардлагыг урьдчилан шалгаж, шаардлагатай бичиг баримтаа бэлдэнэ.',
      'Аяллын даатгал нь эмнэлгийн зардал, ачаа алдагдах, нислэг хойшлох зэргийг хамарсан эсэхийг шалгана.',
      'Гадаадад ашиглах картаа урьдчилан мэдэгдэж, хязгаараа нэмэгдүүлэх нь зүйтэй.',
      'Чухал бичиг баримтын хуулбарыг имэйл эсвэл үүлэн хадгалалтад хадгална.',
      'Очих улсын яаралтай тусламжийн дугаар, элчин сайдын хаягийг урьдчилан хадгална.',
      'Нислэгээс 3 цагийн өмнө нисэх буудалд хүрэлцэн очиж, бүртгэлийн дараалалд зогсохгүй байхыг зөвлөж байна.',
    ],
  },
];

export const DEMO_USERS = [
  { email: 'admin@airline.local', role: 'ADMIN', firstName: 'Ada', lastName: 'Admin' },
  { email: 'agent@airline.local', role: 'AGENT', firstName: 'Grace', lastName: 'Agent' },
  { email: 'customer@airline.local', role: 'CUSTOMER', firstName: 'Chris', lastName: 'Customer' },
];
