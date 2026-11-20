import enUS from '@/i18n/locales/en-US.js';
import { registerLocaleMessages } from '@/i18n/index.js';

// 单元测试可能以同步方式调用 createI18n({ initialLocale: 'en-US' }) 或 t(key, {}, 'en-US')，
// 在测试环境中预先注册英文词典以保持同步语义。
registerLocaleMessages('en-US', enUS);
