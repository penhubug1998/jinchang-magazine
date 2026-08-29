export function createHistoryController({ clone, equals, limit = 60, groupWindow = 650 } = {}) {
  let current = null, lastAt = 0, lastGroup = '';
  const undo = [], redo = [];
  const api = {
    reset(value) { current = clone(value); lastAt = 0; lastGroup = ''; undo.length = 0; redo.length = 0; },
    capture(value, group = 'edit', { force = false } = {}) {
      const next = clone(value);
      if (current == null) { current = next; return false; }
      if (equals(current, next)) return false;
      const now = Date.now(), grouped = !force && lastGroup === group && now - lastAt < groupWindow;
      if (!grouped) { undo.push(clone(current)); if (undo.length > limit) undo.shift(); redo.length = 0; }
      current = next; lastAt = now; lastGroup = group; return true;
    },
    undo(value) { if (!undo.length) return null; redo.push(clone(value)); const next = undo.pop(); current = clone(next); return clone(next); },
    redo(value) { if (!redo.length) return null; undo.push(clone(value)); const next = redo.pop(); current = clone(next); return clone(next); },
    stacks() { return { undo, redo }; },
    snapshot() { return current == null ? null : clone(current); }
  };
  return api;
}
