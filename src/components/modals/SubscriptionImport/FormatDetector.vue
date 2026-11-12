<script setup>
    import { useI18n } from '../../../i18n/index.js';

    const { t } = useI18n();
</script>

<template>
    <div
        class="bg-transparent border border-zinc-200 dark:border-zinc-800 rounded-md p-3"
    >
        <h4 class="text-xs font-semibold text-zinc-900 dark:text-zinc-100 mb-2 flex items-center gap-2">
            <span class="h-1.5 w-1.5 rounded-full bg-zinc-400"></span>
            {{ t('formatDetector.heading') }}
        </h4>
        <ul class="text-xs text-zinc-600 dark:text-zinc-400 space-y-1">
            <li>
                • <strong class="font-mono text-zinc-800 dark:text-zinc-200">{{ t('formatDetector.base64') }}</strong
                >：{{ t('formatDetector.base64Desc') }}
            </li>
            <li>
                • <strong class="font-mono text-zinc-800 dark:text-zinc-200">{{ t('formatDetector.clash') }}</strong
                >：{{ t('formatDetector.clashDesc') }}
            </li>
            <li>
                • <strong class="font-mono text-zinc-800 dark:text-zinc-200">{{ t('formatDetector.singbox') }}</strong
                >：{{ t('formatDetector.singboxDesc') }}
            </li>
            <li>
                • <strong class="font-mono text-zinc-800 dark:text-zinc-200">{{ t('formatDetector.surge') }}</strong
                >：{{ t('formatDetector.surgeDesc') }}
            </li>
            <li>
                • <strong class="font-mono text-zinc-800 dark:text-zinc-200">{{ t('formatDetector.quantumultx') }}</strong
                >：{{ t('formatDetector.quantumultxDesc') }}
            </li>
            <li>
                • <strong class="font-mono text-zinc-800 dark:text-zinc-200">{{ t('formatDetector.plainText') }}</strong
                >：{{ t('formatDetector.plainTextDesc') }}
            </li>
            <li>
                •
                <strong class="text-zinc-800 dark:text-zinc-200">{{ t('formatDetector.protocols') }}</strong
                >：<span class="font-mono">VMess、VLESS、Trojan、Shadowsocks、ShadowsocksR、Hysteria、TUIC、SOCKS5、HTTP</span>
            </li>
        </ul>
    </div>
</template>
