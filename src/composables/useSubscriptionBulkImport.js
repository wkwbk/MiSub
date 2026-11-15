import { ref } from 'vue';
import { useToastStore } from '../stores/toast.js';
import { useDataStore } from '../stores/useDataStore.js';
import { extractNodeName } from '../lib/utils.js';
import { generateSubscriptionId } from '../utils/id.js';
import {
    createAirportGroupId,
    getAirportIdentityKey,
    getAirportIdentityName,
} from '../utils/airport-identity.js';
import { inferAirportRootDomain } from '../utils/airport-domain.js';
import { lookupDomainName } from '../utils/domain-name-memory.js';
import { t } from '../i18n/index.js';

function prettifyHost(host) {
    const raw = String(host || '').trim();
    if (!raw) return '';
    const root = inferAirportRootDomain(`https://${raw}`) || raw;
    const main = root.split('.')[0] || '';
    const cleaned = main
        .replace(/[-_](vpn|proxy|cloud|services?|network|sub|node)$/i, '')
        .replace(/[-_]+/g, ' ')
        .trim();
    const base = cleaned || main;
    return base ? base.charAt(0).toUpperCase() + base.slice(1) : '';
}

function resolveGroupDisplayName(items = []) {
    const confirmed = items.map(getAirportIdentityName).find(Boolean);
    if (confirmed) return confirmed;

    const firstUrl = items.find((item) => item?.url)?.url;
    let host = '';
    if (firstUrl) {
        try {
            host = new URL(firstUrl).hostname;
        } catch {
            host = '';
        }
    }
    if (host) {
        const rootDomain = inferAirportRootDomain(`https://${host}`) || host;
        const remembered = lookupDomainName(rootDomain);
        if (remembered) return remembered;
    }

    const detected = items.find(
        (item) => typeof item?.detectedName === 'string' && item.detectedName.trim()
    );
    if (detected) return detected.detectedName.trim();

    return host ? prettifyHost(host) : '';
}

/**
 * 从现有机场订阅中提取当前所有分组名称（包括显式命名的机场分组和按域名/识别名自动聚合的分组）。
 */
export function extractAirportGroupNames(subscriptions = []) {
    const httpSubs = (subscriptions || []).filter((sub) => isValidSubscriptionUrl(sub?.url));
    const groupMap = new Map();

    for (const sub of httpSubs) {
        const key = getAirportIdentityKey(sub);
        if (!groupMap.has(key)) groupMap.set(key, []);
        groupMap.get(key).push(sub);
    }

    const seen = new Set();
    const names = [];
    for (const items of groupMap.values()) {
        const name = resolveGroupDisplayName(items);
        if (name && !seen.has(name)) {
            seen.add(name);
            names.push(name);
        }
    }
    return names;
}

/**
 * 校验单行是否为合法的 http:// 或 https:// 订阅链接。
 */
export function isValidSubscriptionUrl(line) {
    if (!/^https?:\/\//i.test(line)) return false;
    try {
        const parsed = new URL(line);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

/**
 * 根据分组名称解析（或创建）对应的 airportIdentity：
 * - 分组名为空：返回 null（按域名自动分组）
 * - 命中已存在的显式分组：复用其 groupId
 * - 命中按域名自动聚合的分组：生成新 groupId 并把同组已有订阅一并绑定（需传入 updateSubscription）
 * - 全新分组名：生成新 groupId
 */
export function resolveAirportIdentityForGroup(
    groupName,
    subscriptions = [],
    updateSubscription = null
) {
    const normalizedName = String(groupName || '').trim();
    if (!normalizedName) return null;

    const httpSubs = (subscriptions || []).filter((sub) => isValidSubscriptionUrl(sub?.url));

    const existingExplicit = httpSubs.find(
        (sub) =>
            String(sub?.airportIdentity?.name || '').trim() === normalizedName &&
            String(sub?.airportIdentity?.groupId || '').trim()
    );
    if (existingExplicit) {
        return {
            groupId: existingExplicit.airportIdentity.groupId,
            name: normalizedName,
        };
    }

    const newIdentity = {
        groupId: createAirportGroupId(),
        name: normalizedName,
    };

    if (typeof updateSubscription === 'function') {
        const groupMap = new Map();
        for (const sub of httpSubs) {
            const key = getAirportIdentityKey(sub);
            if (!groupMap.has(key)) groupMap.set(key, []);
            groupMap.get(key).push(sub);
        }
        for (const items of groupMap.values()) {
            if (resolveGroupDisplayName(items) === normalizedName) {
                items.forEach((item) => {
                    updateSubscription({ ...item, airportIdentity: { ...newIdentity } });
                });
                break;
            }
        }
    }

    return newIdentity;
}

/**
 * 机场订阅专用批量导入逻辑：
 * 仅处理 http:// / https:// 订阅链接，支持统一绑定机场分组（airportIdentity）。
 */
export function useSubscriptionBulkImport({ addSubscriptionsFromBulk, updateSubscription } = {}) {
    const { showToast } = useToastStore();
    const dataStore = useDataStore();
    const showModal = ref(false);

    const handleSubscriptionBulkImport = (importText, groupName = '') => {
        if (!importText || !String(importText).trim()) return;

        const existingUrls = new Set(
            (dataStore.subscriptions || []).map((s) => s.url).filter(Boolean)
        );
        const seenInBatch = new Set();
        const airportIdentity = resolveAirportIdentityForGroup(
            groupName,
            dataStore.subscriptions || [],
            updateSubscription
        );

        const lines = String(importText)
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean);

        const validSubs = [];
        let duplicateCount = 0;
        let invalidCount = 0;

        for (const line of lines) {
            if (!isValidSubscriptionUrl(line)) {
                invalidCount++;
                continue;
            }
            if (existingUrls.has(line) || seenInBatch.has(line)) {
                duplicateCount++;
                continue;
            }
            seenInBatch.add(line);

            validSubs.push({
                id: generateSubscriptionId(),
                name: extractNodeName(line) || t('bulkImport.unnamed'),
                url: line,
                enabled: true,
                status: 'unchecked',
                exclude: '',
                customUserAgent: '',
                notes: '',
                airportIdentity: airportIdentity ? { ...airportIdentity } : null,
            });
        }

        if (validSubs.length > 0) {
            addSubscriptionsFromBulk(validSubs);
            const parts = [t('bulkImport.importedSubscriptions', { count: validSubs.length })];
            if (duplicateCount > 0) {
                parts.push(t('bulkImport.skippedDuplicates', { count: duplicateCount }));
            }
            if (invalidCount > 0) {
                parts.push(t('subscriptionBulkImport.ignoredInvalid', { count: invalidCount }));
            }
            const [main, ...details] = parts;
            showToast(details.length > 0 ? `${main} (${details.join('，')})` : main, 'success');
        } else if (duplicateCount > 0) {
            showToast(t('subscriptionBulkImport.allDuplicates', { count: duplicateCount }), 'info');
        } else if (invalidCount > 0) {
            showToast(
                t('subscriptionBulkImport.noValidSubscriptionsWithInvalid', { count: invalidCount }),
                'warning'
            );
        } else {
            showToast(t('subscriptionBulkImport.noValidSubscriptions'), 'warning');
        }

        showModal.value = false;
    };

    return {
        showModal,
        handleSubscriptionBulkImport,
    };
}

