export const REGIONS = [
  'Акмолинская область',
  'Актюбинская область',
  'Алматинская область',
  'Атырауская область',
  'Восточно-Казахстанская область',
  'Жамбылская область',
  'Западно-Казахстанская область',
  'Карагандинская область',
  'Костанайская область',
  'Кызылординская область',
  'Мангистауская область',
  'Павлодарская область',
  'Северо-Казахстанская область',
  'Туркестанская область',
  'Улытауская область',
  'Абай область',
  'Жетісу область',
];

export const DIRECTIONS = [
  'Развитие племенного животноводства',
  'Повышение продуктивности и качества продукции животноводства',
  'Развитие аквакультуры (рыбного хозяйства)',
  'Развитие пчеловодства',
];

export const SUBSIDIES: Record<string, { name: string; normative: number }[]> = {
  'Развитие племенного животноводства': [
    { name: 'Содержание племенного маточного поголовья КРС', normative: 242000 },
    { name: 'Содержание племенного маточного поголовья МРС', normative: 31000 },
    { name: 'Содержание племенного маточного поголовья лошадей', normative: 140000 },
    { name: 'Содержание племенного маточного поголовья верблюдов', normative: 140000 },
    { name: 'Приобретение племенного КРС', normative: 300000 },
    { name: 'Приобретение семени быков-производителей', normative: 5000 },
  ],
  'Повышение продуктивности и качества продукции животноводства': [
    { name: 'Сдача бычков на откормплощадку', normative: 45000 },
    { name: 'Производство мяса КРС', normative: 125000 },
    { name: 'Производство молока', normative: 45 },
    { name: 'Производство тонкой и полутонкой шерсти', normative: 1200 },
  ],
  'Развитие аквакультуры (рыбного хозяйства)': [
    { name: 'Выращивание товарной рыбы (прудовое)', normative: 200 },
    { name: 'Выращивание товарной рыбы (садковое)', normative: 300 },
    { name: 'Выращивание рыбопосадочного материала', normative: 500 },
  ],
  'Развитие пчеловодства': [
    { name: 'Содержание пчелосемей', normative: 6135 },
  ],
};

export const FARM_TYPES = ['товарное', 'племенное', 'кооператив'];

export type AppStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'waitlist' | 'executed';

export const STATUS_LABELS: Record<AppStatus, string> = {
  draft: 'Черновик',
  submitted: 'Отправлена',
  under_review: 'На рассмотрении',
  approved: 'Одобрена',
  rejected: 'Отклонена',
  waitlist: 'Лист ожидания',
  executed: 'Исполнена',
};

export const STATUS_COLORS: Record<AppStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  submitted: 'bg-warning/15 text-warning',
  under_review: 'bg-warning/15 text-warning',
  approved: 'bg-success/15 text-success',
  rejected: 'bg-destructive/15 text-destructive',
  waitlist: 'bg-warning/15 text-warning',
  executed: 'bg-success/15 text-success',
};

export function formatCurrency(value: number): string {
  return value.toLocaleString('ru-RU') + ' ₸';
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('ru-RU');
}

export function calcComplianceScore(app: {
  has_land: boolean;
  has_iszh: boolean;
  has_no_debt: boolean;
  met_obligations: boolean;
  has_prev_subsidy: boolean;
  prev_subsidy_used: boolean;
}): number {
  const checks = [
    app.has_land,
    app.has_iszh,
    app.has_no_debt,
    app.met_obligations,
    app.has_prev_subsidy ? app.prev_subsidy_used : true,
  ];
  const passed = checks.filter(Boolean).length;
  return Math.round((passed / checks.length) * 100);
}
