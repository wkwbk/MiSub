import { createRouter, createWebHistory } from 'vue-router';
import { isChunkLoadError, shouldReloadForChunkError } from '@/utils/chunk-reload.js';
import { prefetchLoader } from '@/utils/prefetch.js';
import { t } from '@/i18n/index.js';

/**
 * 解析路由页标题。
 *
 * 路由表是**模块级常量**，只会在应用启动时求值一次，所以那里不能直接写
 * `t('...')` —— 否则切换语言后标题永远是启动时的那个。约定：
 * - 需要翻译的页面放 `meta.titleKey`（i18n key）
 * - 品牌名等无需翻译的放 `meta.title`（字面量）
 */
export function translateRouteTitle(route, t) {
  const key = route?.meta?.titleKey;
  if (key) return t(key);
  return route?.meta?.title ? String(route.meta.title) : '';
}

// Lazy load views for better performance
const DashboardView = () => import('@/views/DashboardView.vue');
const SubscriptionGroupsView = () => import('@/views/SubscriptionGroupsView.vue');
const ManualNodesView = () => import('@/views/ManualNodesView.vue');
const MySubscriptionsView = () => import('@/views/MySubscriptionsView.vue');
const SettingsView = () => import('@/views/SettingsView.vue');

const HomeView = () => import('@/views/HomeView.vue'); // [NEW] Wrapper View

const ROUTE_PREFETCH_LOADERS = {
  '/dashboard': DashboardView,
  '/dashboard/groups': SubscriptionGroupsView,
  '/dashboard/nodes': ManualNodesView,
  '/dashboard/subscriptions': MySubscriptionsView,
  '/dashboard/settings': SettingsView,
  '/': HomeView,
  '/explore': HomeView,
};

export function prefetchRoute(path) {
  const loader = ROUTE_PREFETCH_LOADERS[path];
  if (loader) {
    prefetchLoader(loader);
  }
}

export const COMMON_DASHBOARD_ROUTE_LOADERS = [
  DashboardView,
  ManualNodesView,
  SubscriptionGroupsView,
  MySubscriptionsView,
  SettingsView,
];

let authContextResolver = () => ({ state: 'loading', loginPath: '/login' });

export function configureAuthGuard(resolver) {
  authContextResolver = typeof resolver === 'function' ? resolver : authContextResolver;
}

const routes = [
  {
    path: '/', // Root path is HomeView (Smart Wrapper)
    name: 'Home',
    component: HomeView,
    meta: { titleKey: 'pageTitles.home', isPublic: true }, // Publicly accessible, view handles content
  },
  {
    path: '/explore',
    name: 'Explore',
    component: HomeView,
    meta: { titleKey: 'pageTitles.publicPage', isPublic: true },
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: DashboardView,
    meta: { titleKey: 'pageTitles.dashboard', requiresAuth: true },
  },
  {
    path: '/dashboard/groups',
    name: 'SubscriptionGroups',
    component: SubscriptionGroupsView,
    meta: { titleKey: 'pageTitles.groups', requiresAuth: true },
  },
  {
    path: '/dashboard/nodes',
    name: 'ManualNodes',
    component: ManualNodesView,
    meta: { titleKey: 'pageTitles.nodes', requiresAuth: true },
  },
  {
    path: '/dashboard/subscriptions',
    name: 'MySubscriptions',
    component: MySubscriptionsView,
    meta: { titleKey: 'pageTitles.subscriptions', requiresAuth: true },
  },
  {
    path: '/dashboard/settings',
    name: 'Settings',
    component: SettingsView,
    meta: { titleKey: 'pageTitles.settings', requiresAuth: true },
  },
  /*
    // [REMOVED] Static /login route.
    // Handled dynamically by Catch-All route (Entrance.vue) to support Custom Login Path.
    {
        path: '/login',
        name: 'Login',
        component: () => import('@/components/modals/Login.vue'),
        meta: { titleKey: 'pageTitles.login', isPublic: false }
    },
    */
  {
    // Catch-all route for Custom Login Path or 404
    path: '/:pathMatch(.*)*',
    name: 'Entrance',
    component: () => import('@/views/Entrance.vue'),
    meta: { title: 'MiSub', isPublic: true }, // Public, so Entrance.vue can decide what to render
  },
];

if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual';
}

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition;
    } else {
      return { top: 0 };
    }
  },
});

// 自动恢复动态 chunk 加载失败导致的白屏
router.onError((error) => {
  if (isChunkLoadError(error?.message) && shouldReloadForChunkError()) {
    window.location.reload();
  }
});

// Navigation guard
router.beforeEach((to) => {
  if (typeof document !== 'undefined') {
    const title = translateRouteTitle(to, t);
    document.title = title ? `${title} - MISUB` : 'MISUB';
  }

  const context = authContextResolver() || {};
  if (context.state === 'loggedIn' && to.name === 'Entrance') {
    const resolvedLoginPath = context.loginPath || '/login';
    if (to.path === resolvedLoginPath) {
      return { path: '/dashboard', replace: true };
    }
  }

  if (!to.meta.requiresAuth) return true;

  if (context.state === 'loading') return true;
  if (context.state === 'loggedIn') return true;

  return {
    path: context.loginPath || '/login',
    query: { redirect: to.fullPath },
  };
});

export default router;
