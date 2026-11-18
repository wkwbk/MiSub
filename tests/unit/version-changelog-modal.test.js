import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import VersionChangelogModal from '@/components/modals/VersionChangelogModal.vue';
import { createI18n } from '@/i18n/index.js';
import { renderChangelogMarkdown } from '@/utils/changelog-markdown.js';

const ModalStub = {
    props: ['show'],
    emits: ['update:show'],
    template:
        '<section v-if="show"><slot name="title" /><slot name="body" /><slot name="footer" /></section>',
};

describe('VersionChangelogModal markdown rendering', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it('renders headings, lists, bold text, and inline code safely', () => {
        const html = renderChangelogMarkdown(
            `🚀 **Highlight**\n- **Feature**: added \`pnpm\` support\n<script>alert(1)</script>`
        );

        expect(html).toContain('<strong');
        expect(html).toContain('Highlight</strong>');
        expect(html).toContain('<ul');
        expect(html).toContain('<li>');
        expect(html).toContain('<code');
        expect(html).toContain('pnpm</code>');
        expect(html).not.toContain('<script>');
    });

    it('renders localChangelog as formatted HTML instead of raw markdown tokens', () => {
        const wrapper = mount(VersionChangelogModal, {
            props: {
                show: true,
                currentVersion: '2.8.2',
                release: { tag_name: 'v2.8.2', body: '' },
            },
            global: {
                plugins: [createI18n({ initialLocale: 'zh-CN' })],
                stubs: { Modal: ModalStub },
            },
        });

        expect(wrapper.findAll('ul').length).toBeGreaterThan(0);
        expect(wrapper.findAll('strong').length).toBeGreaterThan(0);
        expect(wrapper.findAll('code').length).toBeGreaterThan(0);
        expect(wrapper.text()).not.toContain('**');
    });
});
