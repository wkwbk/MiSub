import { markRaw } from 'vue';
import { LayoutDashboard, Boxes, Server, CloudDownload, Settings } from '@lucide/vue';

export const MAIN_NAV_ITEMS = [
    {
        key: 'nav.dashboard',
        name: '仪表盘',
        path: '/dashboard',
        icon: markRaw(LayoutDashboard),
    },
    {
        key: 'nav.nodes',
        name: '节点管理',
        path: '/dashboard/nodes',
        icon: markRaw(Server),
    },
    {
        key: 'nav.groups',
        name: '订阅管理',
        path: '/dashboard/groups',
        icon: markRaw(Boxes),
    },
    {
        key: 'nav.subscriptions',
        name: '分享管理',
        path: '/dashboard/subscriptions',
        icon: markRaw(CloudDownload),
    },
    {
        key: 'nav.settings',
        name: '设置',
        path: '/dashboard/settings',
        icon: markRaw(Settings),
    },
];
