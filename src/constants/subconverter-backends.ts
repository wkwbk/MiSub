import { DEFAULT_SUBCONVERTER_BACKEND } from '@misub/core/domain/default-settings.js';

export const SUBCONVERTER_BACKENDS = [
  {
    value: DEFAULT_SUBCONVERTER_BACKEND,
    labelKey: 'settings.subconverterBackendCmliussss',
    description: DEFAULT_SUBCONVERTER_BACKEND,
  },
  {
    value: 'api.v1.mk',
    labelKey: 'settings.subconverterBackendFeiyang',
    description: 'api.v1.mk',
  },
];

export { DEFAULT_SUBCONVERTER_BACKEND };
