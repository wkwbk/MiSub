export function applyPatch(originalItems = [], diff = {}) {
  if (!diff) return originalItems;

  const { added = [], updated = [], removed = [] } = diff;
  let newItems = [...originalItems];

  if (removed.length > 0) {
    const removedIds = new Set(removed);
    newItems = newItems.filter((item) => !removedIds.has(item.id));
  }

  if (updated.length > 0) {
    const updatesMap = new Map(updated.map((item) => [item.id, item]));
    newItems = newItems.map((item) => {
      if (updatesMap.has(item.id)) {
        return { ...item, ...updatesMap.get(item.id) };
      }
      return item;
    });
  }

  if (added.length > 0) {
    const existingIds = new Set(newItems.map((i) => i.id));
    const validAdds = added.filter((item) => !existingIds.has(item.id));
    newItems = [...newItems, ...validAdds];
  }

  return newItems;
}
