import { enableAutoUnmount } from '@vue/test-utils';
import { afterAll, afterEach } from 'vitest';

// 每个用例后自动卸载挂载的组件，避免残留组件继续触发 defineAsyncComponent 的懒加载。
enableAutoUnmount(afterEach);

// 兜底：很多视图用 defineAsyncComponent 懒加载弹窗。若测试文件结束时 import() 仍在途中，
// vitest 关闭 module runner 会让它们以 "Vite module runner has been closed" 拒绝；
// 更快的 CI 机器上这会被记为 unhandled error 并使整个 run 以非零码退出（本机较慢不易复现）。
// 优先用 vi.mock('<模块路径>') 直接 mock 懒加载模块（stubs 并不能阻止 loader 被调用），
// 这里再等一小会儿让残留的动态 import 落地。
afterAll(async () => {
  await new Promise((resolve) => setTimeout(resolve, 100));
});
