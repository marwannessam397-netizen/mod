// Single source of truth for the form (main.js) and the review page (admin.js).
export const STEPS = [
  {
    title: 'بياناتك',
    hint: 'الأساسيات اللي هنتواصل بيها معاك.',
    fields: [
      { key: 'full_name', label: 'الاسم بالكامل', type: 'text', autocomplete: 'name' },
      { key: 'age', label: 'العمر', type: 'number', min: 13, max: 120, inputmode: 'numeric' },
      { key: 'kick_username', label: 'يوزر Kick', type: 'text', placeholder: 'من غير @' },
      { key: 'availability', label: 'كام ساعة تقدر تكون متواجد يوميًا؟', type: 'text' },
    ],
  },
  {
    title: 'خبرتك',
    hint: 'احكي بصراحة، الإجابات الحقيقية أهم من المثالية.',
    fields: [
      { key: 'experience', label: 'احكيلنا عن خبراتك في المودريتور', type: 'textarea' },
      { key: 'previous_mod', label: 'هل كنت مود عند حد قبل كده؟', type: 'select' },
      { key: 'left_reason', label: 'لو سبت المكان السابق، إيه السبب؟', type: 'textarea', optional: true },
      { key: 'moderator_duration', label: 'بقالك قد إيه في مجال المودريتور؟', type: 'text' },
      { key: 'bot_commands', label: 'اكتب أوامر بوت ريكس اللي تعرفها', type: 'textarea' },
    ],
  },
  {
    title: 'مواقف الشات',
    hint: 'اشرح هتتصرف إزاي في الواقع.',
    fields: [
      { key: 'ban_reason', label: 'إيه اللي ممكن يخليك تعمل بان لحد من الشات؟', type: 'textarea' },
      { key: 'timeout_reason', label: 'إيه المواقف اللي تستحق تايم 5 دقايق؟ ولو اتكرر الموقف هتتصرف إزاي؟', type: 'textarea' },
      { key: 'provocation', label: 'لو حد استفزك في الشات، هتعمل إيه؟', type: 'textarea' },
    ],
  },
  {
    title: 'التيم',
    hint: 'آخر خطوة قبل الإرسال.',
    fields: [
      { key: 'manager_plan', label: 'لو اترقيت لمود مانجر، هتنظم التيم إزاي وتحسّن أداءه؟', type: 'textarea' },
      { key: 'team_value', label: 'شايف نفسك ممكن تضيف إيه للتيم؟', type: 'textarea' },
    ],
  },
];

export const LABELS = Object.fromEntries(STEPS.flatMap(s => s.fields.map(f => [f.key, f.label])));
export const STATUS_LABELS = {
  pending: 'جديد',
  reviewing: 'تحت المراجعة',
  accepted: 'مقبول',
  rejected: 'مرفوض',
};
