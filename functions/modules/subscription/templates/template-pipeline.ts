import { buildOptimizedIniTemplateModel, type BuildOptimizedIniTemplateOptions } from './template-pipeline-core.js';
import { renderClashFromTemplateModel } from './renderers/render-clash.js';
import { renderSingboxFromTemplateModel } from './renderers/render-singbox.js';
import { renderSurgeFromTemplateModel } from './renderers/render-surge.js';
import { renderLoonFromTemplateModel } from './renderers/render-loon.js';
import { renderQuanxFromTemplateModel } from './renderers/render-quanx.js';

export function renderClashFromIniTemplate(templateText: string, options: BuildOptimizedIniTemplateOptions = {}): string {
  const model = buildOptimizedIniTemplateModel(templateText, options);
  return renderClashFromTemplateModel(model, { isChinaClient: options.isChinaClient });
}

export function renderSingboxFromIniTemplate(templateText: string, options: BuildOptimizedIniTemplateOptions = {}): string {
  const model = buildOptimizedIniTemplateModel(templateText, options);
  return renderSingboxFromTemplateModel(model, options);
}

export function renderSurgeFromIniTemplate(templateText: string, options: BuildOptimizedIniTemplateOptions = {}): string {
  const model = buildOptimizedIniTemplateModel(templateText, options);
  return renderSurgeFromTemplateModel(model, options);
}

export function renderLoonFromIniTemplate(templateText: string, options: BuildOptimizedIniTemplateOptions = {}): string {
  const model = buildOptimizedIniTemplateModel(templateText, options);
  return renderLoonFromTemplateModel(model, options);
}

export function renderQuanxFromIniTemplate(templateText: string, options: BuildOptimizedIniTemplateOptions = {}): string {
  const model = buildOptimizedIniTemplateModel(templateText, options);
  return renderQuanxFromTemplateModel(model, options);
}
