import { buildOptimizedIniTemplateModel } from './template-pipeline-core.js';
import { renderClashFromTemplateModel } from './renderers/render-clash.js';
import { renderSingboxFromTemplateModel } from './renderers/render-singbox.js';
import { renderSurgeFromTemplateModel } from './renderers/render-surge.js';
import { renderLoonFromTemplateModel } from './renderers/render-loon.js';
import { renderQuanxFromTemplateModel } from './renderers/render-quanx.js';
import { renderEgernFromTemplateModel } from './renderers/render-egern.js';
import { renderShadowrocketFromTemplateModel } from './renderers/render-shadowrocket.js';

export function renderClashFromIniTemplate(templateText, options = {}) {
  const model = buildOptimizedIniTemplateModel(templateText, options);
  return renderClashFromTemplateModel(model, { isChinaClient: options.isChinaClient });
}

export function renderSingboxFromIniTemplate(templateText, options = {}) {
  const model = buildOptimizedIniTemplateModel(templateText, options);
  return renderSingboxFromTemplateModel(model, options);
}

export function renderSurgeFromIniTemplate(templateText, options = {}) {
  const model = buildOptimizedIniTemplateModel(templateText, options);
  return renderSurgeFromTemplateModel(model, options);
}

export function renderLoonFromIniTemplate(templateText, options = {}) {
  const model = buildOptimizedIniTemplateModel(templateText, options);
  return renderLoonFromTemplateModel(model, options);
}

export function renderQuanxFromIniTemplate(templateText, options = {}) {
  const model = buildOptimizedIniTemplateModel(templateText, options);
  return renderQuanxFromTemplateModel(model, options);
}

export function renderEgernFromIniTemplate(templateText, options = {}) {
  const model = buildOptimizedIniTemplateModel(templateText, options);
  return renderEgernFromTemplateModel(model, { isChinaClient: options.isChinaClient });
}

export function renderShadowrocketFromIniTemplate(templateText, options = {}) {
  const model = buildOptimizedIniTemplateModel(templateText, options);
  return renderShadowrocketFromTemplateModel(model, options);
}
