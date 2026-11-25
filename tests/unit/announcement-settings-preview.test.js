import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import AnnouncementSettings from '@/components/settings/sections/AnnouncementSettings.vue';
import { i18n } from '@/i18n/index.js';

describe('AnnouncementSettings 实时预览', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('未设置标题和内容时展示与实际公告一致的兜底标题和内容', () => {
    const wrapper = mount(AnnouncementSettings, {
      props: {
        settings: {
          announcement: {
            enabled: true,
            title: '',
            content: '',
            type: 'error',
            dismissible: true,
            updatedAt: null,
          },
        },
      },
      global: {
        stubs: {
          Select: true,
          Switch: true,
          SectionHeader: true,
        },
        plugins: [i18n],
      },
    });

    const heading = wrapper.find('h3');
    expect(heading.exists()).toBe(true);
    expect(heading.text()).toBe(i18n.t('common.announcementFallbackTitle'));
    expect(wrapper.text()).toContain(i18n.t('common.announcementFallbackContent'));
  });

  it('标题为空白字符时也回退到默认标题，填写标题后展示填写内容', async () => {
    const settings = {
      announcement: {
        enabled: true,
        title: '   ',
        content: '检测到您正在使用默认密码',
        type: 'error',
        dismissible: true,
        updatedAt: null,
      },
    };
    const wrapper = mount(AnnouncementSettings, {
      props: {
        settings,
        'onUpdate:settings': (next) => wrapper.setProps({ settings: next }),
      },
      global: {
        stubs: {
          Select: true,
          Switch: true,
          SectionHeader: true,
        },
        plugins: [i18n],
      },
    });

    expect(wrapper.find('h3').text()).toBe(i18n.t('common.announcementFallbackTitle'));
    expect(wrapper.text()).toContain('检测到您正在使用默认密码');

    await wrapper.find('input[type="text"]').setValue('安全警告');
    expect(wrapper.find('h3').text()).toBe('安全警告');
  });
});
