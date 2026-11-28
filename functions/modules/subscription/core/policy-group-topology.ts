import type { RegionGroupNode, RegionPolicyGroup } from './region-groups.js';
import { DNS_PROXY_GROUP } from '../security/safe-dns.js';

/**
 * 策略组标准名称常量（全项目拓扑单一事实来源）
 */
export const DEFAULT_SELECT_GROUP = '🚀 节点选择';
export const DEFAULT_RELAY_GROUP = '🌍 总出口';
export const RELAY_CHAIN_GROUP = '🔗 链式代理';
export const RELAY_ENTRY_GROUP = '🔗 中转节点';
export const RELAY_COMMON_GROUP = '🚀 常用节点';
export const AUTO_SELECT_GROUP = '♻️ 自动选择';
export const FALLBACK_GROUP = '🔯 故障转移';
export const MANUAL_SELECT_GROUP = '👋 手动切换';
export const FINAL_FALLBACK_GROUP = '🐟 漏网之鱼';
export const BUILTIN_POLICY_TOKENS = Object.freeze(['DIRECT', 'REJECT', 'REJECT-DROP', 'PASS', 'ANY'] as const);

export interface MasterGroupMembersOptions {
  includeAutoSelect?: boolean;
  includeFallback?: boolean;
  regionNames?: readonly string[];
  isRelay?: boolean;
  includeDirect?: boolean;
}

export interface RuleGroupCandidatesOptions {
  action?: string;
  includeAutoSelect?: boolean;
  includeFallback?: boolean;
  regionNames?: readonly string[];
  isRelay?: boolean;
  includeDirect?: boolean;
}

function dedupePreserveOrder(items: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    if (!item || seen.has(item)) continue;
    seen.add(item);
    result.push(item);
  }
  return result;
}

function isRegexFilterToken(member: unknown): boolean {
  return (
    typeof member === 'string' &&
    (member.startsWith('(') || member.includes('.*') || member.includes('+') || member.includes('$'))
  );
}

/**
 * 获取主入口策略组名称（普通模式为 🚀 节点选择，中转模式为 🌍 总出口）
 */
export function getMasterEntryGroupName(isRelay: boolean): string {
  return isRelay ? DEFAULT_RELAY_GROUP : DEFAULT_SELECT_GROUP;
}

/**
 * 构建主入口策略组（Layer 2）成员列表
 */
export function buildMasterGroupMembers({
  includeAutoSelect = true,
  includeFallback = true,
  regionNames = [],
  isRelay = false,
  includeDirect = true,
}: MasterGroupMembersOptions = {}): string[] {
  if (isRelay) {
    return dedupePreserveOrder([
      RELAY_CHAIN_GROUP,
      ...(includeAutoSelect ? [AUTO_SELECT_GROUP] : []),
      ...(includeFallback ? [FALLBACK_GROUP] : []),
      MANUAL_SELECT_GROUP,
      RELAY_COMMON_GROUP,
      ...regionNames,
      ...(includeDirect ? ['DIRECT'] : []),
    ]);
  }
  return dedupePreserveOrder([
    ...(includeAutoSelect ? [AUTO_SELECT_GROUP] : []),
    ...(includeFallback ? [FALLBACK_GROUP] : []),
    MANUAL_SELECT_GROUP,
    ...regionNames,
    ...(includeDirect ? ['DIRECT'] : []),
  ]);
}

/**
 * 构建中转模式下「🚀 常用节点」聚合策略组成员列表
 */
export function buildRelayCommonGroupMembers({
  includeAutoSelect = true,
  includeFallback = true,
  regionNames = [],
  includeDirect = true,
}: Omit<MasterGroupMembersOptions, 'isRelay'> = {}): string[] {
  return buildMasterGroupMembers({
    includeAutoSelect,
    includeFallback,
    regionNames,
    isRelay: false,
    includeDirect,
  });
}

/**
 * 构建分流规则组（Layer 3）候选策略列表：
 * 代理类分流组首项统一指向主入口组（🚀 节点选择 / 🌍 总出口），同时保留自动/故障转移/手动切换/地区/DIRECT 覆写能力。
 */
export function buildRuleGroupCandidates({
  action = 'proxy',
  includeAutoSelect = true,
  includeFallback = true,
  regionNames = [],
  isRelay = false,
  includeDirect = true,
}: RuleGroupCandidatesOptions = {}): string[] {
  const masterGroup = getMasterEntryGroupName(isRelay);
  const proxyCandidates = dedupePreserveOrder([
    masterGroup,
    ...(isRelay ? [RELAY_CHAIN_GROUP, RELAY_COMMON_GROUP] : []),
    ...(includeAutoSelect ? [AUTO_SELECT_GROUP] : []),
    ...(includeFallback ? [FALLBACK_GROUP] : []),
    MANUAL_SELECT_GROUP,
    ...regionNames,
  ]);
  if (action === 'reject') {
    return dedupePreserveOrder(['REJECT', 'DIRECT', ...proxyCandidates]);
  }
  if (action === 'direct') {
    return dedupePreserveOrder(['DIRECT', ...proxyCandidates]);
  }
  return dedupePreserveOrder(includeDirect ? [...proxyCandidates, 'DIRECT'] : proxyCandidates);
}

/**
 * 使用三色 DFS 打破策略组引用环路（自环与任意多跳环），同时保留合法有向无环图（DAG）边。
 */
export function removePolicyGroupCycles<T>(
  groups: readonly T[],
  getName: (g: T) => string,
  getMembers: (g: T) => readonly string[] | undefined,
  setMembers: (g: T, next: string[]) => T,
): T[] {
  const groupNames = new Set(groups.map(getName).filter(Boolean));
  const edges = new Map<string, string[]>();
  for (const group of groups) {
    const name = getName(group);
    if (!name || edges.has(name)) continue;
    const rawMembers = getMembers(group);
    edges.set(name, Array.isArray(rawMembers) ? [...rawMembers] : []);
  }

  // 0 = unvisited, 1 = visiting (on active DFS stack), 2 = visited
  const state = new Map<string, 0 | 1 | 2>();

  const dfs = (name: string): void => {
    if ((state.get(name) ?? 0) !== 0) return;
    state.set(name, 1);

    const originalMembers = edges.get(name) ?? [];
    const filteredMembers: string[] = [];

    for (const member of originalMembers) {
      if (member === name) continue;
      if (groupNames.has(member)) {
        const memberState = state.get(member) ?? 0;
        if (memberState === 1) {
          // 回边成环：仅剔除形成环路的边，保留正常的下游/主入口 DAG 引用
          continue;
        }
        if (memberState === 0) {
          dfs(member);
        }
      }
      filteredMembers.push(member);
    }

    edges.set(name, filteredMembers);
    state.set(name, 2);
  };

  for (const group of groups) {
    const name = getName(group);
    if (name && (state.get(name) ?? 0) === 0) {
      dfs(name);
    }
  }

  return groups.map((group) => {
    const name = getName(group);
    const rawMembers = getMembers(group);
    if (!Array.isArray(rawMembers)) return group;
    return setMembers(group, edges.get(name) ?? []);
  });
}

/**
 * 清理策略组中的无效成员引用与环路，并为退化为空的策略组提供安全兜底（AI / DNS 组 fail-closed 为 REJECT）。
 */
export function sanitizePolicyGroupGraph<T extends RegionPolicyGroup>(
  proxyGroups: T[],
  proxies: RegionGroupNode[],
): T[] {
  const validTargetNames = new Set<string>([
    ...proxies.map((p) => p.tag || p.name).filter((name): name is string => Boolean(name)),
    ...proxyGroups.map((g) => g.name).filter((name): name is string => Boolean(name)),
    ...BUILTIN_POLICY_TOKENS,
  ]);

  const filteredGroups = proxyGroups.map((group) => {
    if (!Array.isArray(group.proxies)) return group;

    const newProxies = dedupePreserveOrder(
      group.proxies.filter((member) => {
        if (member === group.name) return false;
        if (isRegexFilterToken(member)) return true;
        return validTargetNames.has(member);
      }),
    );

    return {
      ...group,
      proxies: newProxies,
    };
  });

  const acyclicGroups = removePolicyGroupCycles(
    filteredGroups,
    (group) => group.name,
    (group) => (Array.isArray(group.proxies) ? group.proxies : undefined),
    (group, nextProxies) => ({
      ...group,
      proxies: nextProxies,
    }),
  );

  return acyclicGroups.map((group) => {
    if (!Array.isArray(group.proxies) || group.proxies.length > 0) return group;
    const failClosed = String(group.name || '').startsWith('🤖') || group.name === DNS_PROXY_GROUP;
    return {
      ...group,
      proxies: [failClosed ? 'REJECT' : 'DIRECT'],
    };
  });
}
