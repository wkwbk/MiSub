import { getBuiltinTemplate } from '../../templates/builtin-template-registry.js';
import { buildOptimizedIniTemplateModel } from '../../templates/template-pipeline-core.js';
import { renderEgernFromTemplateModel } from '../../templates/renderers/render-egern.js';

export function generateBuiltinEgernConfig(nodeList, options = {}) {
  const templateEntry = getBuiltinTemplate('clash_misub_minimal') || getBuiltinTemplate('clash_acl4ssr_lite');
  if (!templateEntry?.content) {
    throw new Error('No builtin template available for Egern');
  }

  const renderOptions = {
    nodeList,
    fileName: options.fileName || 'MiSub',
    targetFormat: 'egern',
    ruleLevel: options.ruleLevel || 'std',
    interval: options.interval || 86400,
    managedConfigUrl: options.managedConfigUrl || '',
    skipCertVerify: options.skipCertVerify,
    enableUdp: options.enableUdp,
    enableTfo: options.enableTfo,
    addFlagEmoji: options.addFlagEmoji,
    isChinaClient: options.isChinaClient,
  };
  const model = buildOptimizedIniTemplateModel(templateEntry.content, renderOptions);
  return renderEgernFromTemplateModel(model, { isChinaClient: renderOptions.isChinaClient });
}
