/** Refresh only owned text nodes and attributes; keep inputs, focus and hold bindings intact. */
export function createTextBindings(): {
  text(read: () => string): Text;
  attribute(node: Element, name: string, read: () => string): void;
  refresh: () => void;
} {
  const updates: (() => void)[] = [];
  const bind = (update: () => void): void => {
    updates.push(update);
    update();
  };
  return {
    text(read) {
      const node = document.createTextNode('');
      bind(() => {
        node.data = read();
      });
      return node;
    },
    attribute(node, name, read) {
      bind(() => node.setAttribute(name, read()));
    },
    refresh() {
      for (const update of updates) update();
    },
  };
}
