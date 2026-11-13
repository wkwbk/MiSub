import { markRaw } from 'vue';
import { LayoutDashboard, Boxes, Server, CloudDownload, Settings } from 'lucide-vue-next';

export const MAIN_NAV_ITEMS = [
    {
        key: 'nav.dashboard',
        name: '仪表盘',
        path: '/dashboard',
        icon: markRaw(LayoutDashboard),
    },
    {
        key: 'nav.groups',
        name: '机场订阅',
        path: '/dashboard/groups',
        icon: markRaw(Boxes),
    },
    {
        key: 'nav.nodes',
        name: '手动节点',
        path: '/dashboard/nodes',
        icon: markRaw(Server),
    },
    {
        key: 'nav.subscriptions',
        name: '我的订阅',
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
