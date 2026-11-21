/** * 共享数据表格组件 * @author MiSub Team */

<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { ChevronsUpDown, Loader2 } from '@lucide/vue';
import { t } from '@/i18n/index.js';
import { scrollToPaginationStart } from '@/utils/scroll.js';

const props = defineProps({
  data: {
    type: Array,
    default: () => [],
  },
  columns: {
    type: Array,
    required: true,
  },
  loading: {
    type: Boolean,
    default: false,
  },
  height: {
    type: String,
    default: 'auto',
  },
  maxHeight: {
    type: String,
    default: '',
  },
  striped: {
    type: Boolean,
    default: true,
  },
  bordered: {
    type: Boolean,
    default: false,
  },
  hoverable: {
    type: Boolean,
    default: true,
  },
  compact: {
    type: Boolean,
    default: false,
  },
  emptyText: {
    type: String,
    default: '',
  },
  showHeader: {
    type: Boolean,
    default: true,
  },
  selectable: {
    type: Boolean,
    default: false,
  },
  selectedRows: {
    type: Array,
    default: () => [],
  },
  rowKey: {
    type: String,
    default: 'id',
  },
  pagination: {
    type: [Boolean, Object],
    default: false,
  },
  pageSize: {
    type: Number,
    default: 10,
  },
  currentPage: {
    type: Number,
    default: 1,
  },
  total: {
    type: Number,
    default: 0,
  },
});

const emit = defineEmits([
  'update:selectedRows',
  'rowClick',
  'rowDblClick',
  'selectionChange',
  'pageChange',
  'sortChange',
  'filterChange',
]);

const selectedKeys = ref([]);
const selectedKeySet = computed(() => new Set(selectedKeys.value));
const sortField = ref('');
const sortOrder = ref(''); // 'asc', 'desc', ''

const resolvedEmptyText = computed(() => props.emptyText || t('common.noData'));

// 计算分页数据
const paginatedData = computed(() => {
  if (!props.pagination) return props.data;

  if (typeof props.pagination === 'object' && props.pagination.server) {
    return props.data; // 服务端分页，直接使用传入的数据
  }

  // 客户端分页
  const start = (props.currentPage - 1) * props.pageSize;
  const end = start + props.pageSize;
  return props.data.slice(start, end);
});

// 计算总页数
const totalPages = computed(() => {
  if (typeof props.pagination === 'object' && props.pagination.server) {
    return Math.ceil(props.total / props.pageSize);
  }
  return Math.ceil(props.data.length / props.pageSize);
});

// 表格样式
const tableClasses = computed(() => [
  'w-full',
  {
    'divide-y divide-line-subtle': props.bordered,
    'border border-line': props.bordered,
  },
]);

const headerClasses = computed(() => [
  'bg-surface',
  {
    'sticky top-0 z-10': props.maxHeight || props.height !== 'auto',
  },
]);

const rowClasses = computed(() => (index) => [
  {
    'bg-surface': props.striped && index % 2 === 1,
    'hover:bg-hover': props.hoverable,
    'cursor-pointer': props.selectable,
  },
]);

// 选择相关方法
const isRowSelected = (row) => {
  const key = row[props.rowKey];
  return selectedKeySet.value.has(key);
};

const toggleRowSelection = (row) => {
  if (!props.selectable) return;

  const key = row[props.rowKey];
  const index = selectedKeys.value.indexOf(key);

  if (index > -1) {
    selectedKeys.value.splice(index, 1);
  } else {
    selectedKeys.value.push(key);
  }

  const selectedRows = props.data.filter((row) => selectedKeySet.value.has(row[props.rowKey]));

  emit('update:selectedRows', selectedRows);
  emit('selectionChange', selectedRows);
};

const toggleAllSelection = () => {
  if (selectedKeys.value.length === paginatedData.value.length) {
    selectedKeys.value = [];
  } else {
    selectedKeys.value = paginatedData.value.map((row) => row[props.rowKey]);
  }

  const selectedRows = props.data.filter((row) => selectedKeySet.value.has(row[props.rowKey]));

  emit('update:selectedRows', selectedRows);
  emit('selectionChange', selectedRows);
};

// 排序相关方法
const handleSort = (column) => {
  if (!column.sortable) return;

  if (sortField.value === column.key) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : '';
    sortField.value = sortOrder.value ? column.key : '';
  } else {
    sortField.value = column.key;
    sortOrder.value = 'asc';
  }

  emit('sortChange', { field: sortField.value, order: sortOrder.value });
};

// 获取列值
const getColumnValue = (row, column) => {
  const value = column.render ? column.render(row) : row[column.key];
  return value !== undefined && value !== null ? value : '';
};

// 监听选中行变化
watch(
  () => props.selectedRows,
  (newVal) => {
    selectedKeys.value = newVal.map((row) => row[props.rowKey]);
  },
  { immediate: true },
);

const gridRootRef = ref(null);
const tableScrollRef = ref(null);

// 分页事件
const handlePageChange = (page) => {
  if (page === props.currentPage || page < 1 || page > totalPages.value) return;
  emit('pageChange', page);
  nextTick(() => {
    if (tableScrollRef.value && tableScrollRef.value.scrollTop > 0) {
      scrollToPaginationStart(tableScrollRef.value);
    }
    scrollToPaginationStart(gridRootRef.value);
  });
};
</script>

<template>
  <div ref="gridRootRef" class="data-grid">
    <!-- 表格容器 -->
    <div :style="{ height, maxHeight }" class="overflow-hidden misub-radius-md border border-line">
      <div ref="tableScrollRef" class="overflow-x-auto overflow-y-auto">
        <table :class="tableClasses">
          <!-- 表头 -->
          <thead v-if="showHeader" :class="headerClasses">
            <tr>
              <!-- 全选列 -->
              <th v-if="selectable" class="px-6 py-3 text-left">
                <input
                  :aria-label="t('actions.selectAllPage')"
                  :checked="selectedKeys.length === paginatedData.length && paginatedData.length > 0"
                  :indeterminate="selectedKeys.length > 0 && selectedKeys.length < paginatedData.length"
                  class="h-4 w-4 rounded border-line-strong text-fg focus-visible:ring-line-strong"
                  type="checkbox"
                  @change="toggleAllSelection"
                />
              </th>

              <!-- 数据列 -->
              <th
                v-for="column in columns"
                :key="column.key"
                :class="[
                  'px-6 py-3 text-left text-xs font-medium text-fg-subtle uppercase tracking-wider',
                  column.width ? `w-${column.width}` : '',
                  column.align === 'center' ? 'text-center' : '',
                  column.align === 'right' ? 'text-right' : '',
                  column.sticky === 'right'
                    ? 'sticky right-0 z-20 border-l border-line bg-surface/95 backdrop-blur'
                    : '',
                  column.sticky === 'left' ? 'sticky left-0 z-20 border-r border-line bg-surface/95 backdrop-blur' : '',
                ]"
              >
                <div class="flex items-center space-x-1">
                  <span>{{ column.title }}</span>

                  <!-- 排序图标 -->
                  <button
                    v-if="column.sortable"
                    :aria-label="t('common.sortColumn')"
                    class="text-fg-subtle hover:text-fg"
                    @click="handleSort(column)"
                  >
                    <ChevronsUpDown class="w-4 h-4" />
                  </button>
                </div>
              </th>
            </tr>
          </thead>

          <!-- 表体 -->
          <tbody class="bg-surface divide-y divide-line-subtle">
            <!-- 加载状态 -->
            <tr v-if="loading">
              <td :colspan="columns.length + (selectable ? 1 : 0)" class="px-6 py-12 text-center">
                <div class="flex items-center justify-center space-x-2">
                  <Loader2 class="animate-spin h-5 w-5 text-fg-subtle" />
                  <span class="text-fg-subtle">{{ t('common.loading') }}</span>
                </div>
              </td>
            </tr>

            <!-- 空数据状态 -->
            <tr v-else-if="paginatedData.length === 0">
              <td :colspan="columns.length + (selectable ? 1 : 0)" class="px-6 py-12 text-center">
                <div class="text-fg-subtle">
                  {{ resolvedEmptyText }}
                </div>
              </td>
            </tr>

            <!-- 数据行 -->
            <tr
              v-for="(row, index) in paginatedData"
              v-else
              :key="row[rowKey]"
              :class="rowClasses(index)"
              @click="toggleRowSelection(row)"
              @dblclick="$emit('rowDblClick', row)"
            >
              <!-- 选择列 -->
              <td v-if="selectable" class="px-6 py-4">
                <input
                  :aria-label="t('common.selectRow')"
                  :checked="isRowSelected(row)"
                  class="h-4 w-4 rounded border-line-strong text-fg focus-visible:ring-line-strong"
                  type="checkbox"
                  @change="toggleRowSelection(row)"
                  @click.stop
                />
              </td>

              <!-- 数据列 -->
              <td
                v-for="column in columns"
                :key="column.key"
                :class="[
                  'px-6 py-4 whitespace-nowrap text-sm',
                  column.align === 'center' ? 'text-center' : '',
                  column.align === 'right' ? 'text-right' : '',
                  compact ? 'py-2' : '',
                  column.sticky === 'right'
                    ? 'sticky right-0 z-10 border-l border-line bg-surface/95 backdrop-blur'
                    : '',
                  column.sticky === 'left' ? 'sticky left-0 z-10 border-r border-line bg-surface/95 backdrop-blur' : '',
                ]"
              >
                <slot :column="column" :name="`column-${column.key}`" :row="row" :value="getColumnValue(row, column)">
                  <span :class="column.className">
                    {{ getColumnValue(row, column) }}
                  </span>
                </slot>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 分页 -->
    <div v-if="pagination && totalPages > 1" class="mt-4">
      <div class="flex items-center justify-between">
        <div class="text-sm text-fg-muted">
          {{
            t('common.itemRange', {
              start: (currentPage - 1) * pageSize + 1,
              end: Math.min(currentPage * pageSize, total),
              total,
            })
          }}
        </div>

        <div class="flex space-x-1">
          <button
            :disabled="currentPage <= 1"
            class="px-3 py-2 text-sm border border-line-strong rounded-l-md rounded-r-none bg-surface hover:bg-hover disabled:opacity-50"
            @click="handlePageChange(currentPage - 1)"
          >
            {{ t('common.prevPage') }}
          </button>

          <button
            v-for="page in Math.min(totalPages, 5)"
            :key="page"
            :class="[
              'px-3 py-2 text-sm border border-line-strong',
              currentPage === page ? 'bg-active border-line-strong text-fg font-semibold' : 'bg-surface hover:bg-hover',
            ]"
            @click="handlePageChange(page)"
          >
            {{ page }}
          </button>

          <button
            :disabled="currentPage >= totalPages"
            class="px-3 py-2 text-sm border border-line-strong rounded-r-md rounded-l-none bg-surface hover:bg-hover disabled:opacity-50"
            @click="handlePageChange(currentPage + 1)"
          >
            {{ t('common.nextPage') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
