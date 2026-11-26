import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import LogModal from '@/components/modals/LogModal.vue';
import { createI18n } from '@/i18n/index.js';
import { appQueryClient } from '@/lib/query-client.js';

const { apiGet, apiDel, confirmActionMock, showToastMock } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiDel: vi.fn(),
  confirmActionMock: vi.fn(),
  showToastMock: vi.fn(),
}));

vi.mock('@/lib/http.js', () => ({
  api: {
    get: apiGet,
    del: apiDel,
  },
}));

vi.mock('@/composables/useConfirm.js', () => ({
  confirmAction: confirmActionMock,
}));

vi.mock('@/stores/useToastStore.js', () => ({
  useToastStore: () => ({ showToast: showToastMock }),
}));

const mountLogModal = (props = {}) =>
  mount(LogModal, {
    props: {
      show: false,
      ...props,
    },
    global: {
      plugins: [createI18n({ initialLocale: 'zh-CN' })],
      stubs: {
        Teleport: true,
      },
    },
  });

describe('LogModal scoped clear', () => {
  beforeEach(() => {
    appQueryClient.clear();
    apiGet.mockReset();
    apiDel.mockReset();
    confirmActionMock.mockReset();
    showToastMock.mockReset();

    apiGet.mockResolvedValue({
      data: [
        {
          id: 'log-a',
          profileName: 'Share A',
          timestamp: Date.now(),
          status: 'success',
          clientIp: '1.1.1.1',
          userAgent: 'Clash',
        },
        {
          id: 'log-b',
          profileName: 'Share B',
          timestamp: Date.now() - 1000,
          status: 'success',
          clientIp: '2.2.2.2',
          userAgent: 'Clash',
        },
      ],
    });
    apiDel.mockResolvedValue({ success: true });
    confirmActionMock.mockResolvedValue(true);
  });

  it('clears only the filtered profile when filterProfileName is set', async () => {
    const wrapper = mountLogModal({ filterProfileName: 'Share A' });
    await wrapper.setProps({ show: true });
    await flushPromises();

    expect(wrapper.text()).toContain('Share A');
    expect(wrapper.text()).not.toContain('Share B');

    const clearButton = wrapper.findAll('button').find((button) => button.text().trim() === '清空');
    expect(clearButton).toBeTruthy();

    await clearButton.trigger('click');
    await flushPromises();

    expect(confirmActionMock).toHaveBeenCalledWith({
      message: '确定要清空「Share A」的订阅日志并重置其订阅计数吗？',
      variant: 'danger',
    });
    expect(apiDel).toHaveBeenCalledWith('/api/logs?profileName=Share%20A');
    expect(wrapper.text()).toContain('该订阅暂无日志记录');

    // Switching to Share B should still show Share B's retained log
    await wrapper.setProps({ filterProfileName: 'Share B' });
    await flushPromises();
    expect(wrapper.text()).toContain('Share B');
  });

  it('clears all logs when filterProfileName is empty', async () => {
    const wrapper = mountLogModal({ filterProfileName: '' });
    await wrapper.setProps({ show: true });
    await flushPromises();

    const clearButton = wrapper.findAll('button').find((button) => button.text().trim() === '清空');
    await clearButton.trigger('click');
    await flushPromises();

    expect(confirmActionMock).toHaveBeenCalledWith({
      message: '确定要清空所有日志吗？这将同时重置订阅组的订阅计数。',
      variant: 'danger',
    });
    expect(apiDel).toHaveBeenCalledWith('/api/logs');
    expect(wrapper.text()).toContain('暂无日志记录');
  });

  it('disables the clear button when the filtered profile has no logs', async () => {
    const wrapper = mountLogModal({ filterProfileName: 'Empty Share' });
    await wrapper.setProps({ show: true });
    await flushPromises();

    expect(wrapper.text()).toContain('该订阅暂无日志记录');

    const clearButton = wrapper.findAll('button').find((button) => button.text().trim() === '清空');
    expect(clearButton).toBeTruthy();
    expect(clearButton.attributes('disabled')).toBeDefined();

    await clearButton.trigger('click');
    await flushPromises();

    expect(confirmActionMock).not.toHaveBeenCalled();
    expect(apiDel).not.toHaveBeenCalled();
  });
});
