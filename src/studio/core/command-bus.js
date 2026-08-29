export function createCommandBus({ getState, beforeDispatch, afterDispatch, onError } = {}) {
  const handlers = new Map();
  const listeners = new Set();
  let sequence = 0;
  return {
    register(type, handler) {
      if (!type || typeof handler !== 'function') throw new TypeError('Command type and handler are required');
      handlers.set(type, handler);
      return () => handlers.delete(type);
    },
    has(type) { return handlers.has(type); },
    list() { return [...handlers.keys()]; },
    commands() { return [...handlers.keys()]; },
    subscribe(listener) {
      if (typeof listener !== 'function') throw new TypeError('Command subscriber must be a function');
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch(type, payload = {}, meta = {}) {
      const handler = handlers.get(type);
      if (!handler) throw new Error(`Unknown Studio command: ${type}`);
      const command = { id: `cmd-${++sequence}`, type, payload, meta, at: Date.now() };
      try {
        beforeDispatch?.(command, getState?.());
        command.result = handler(payload, getState?.(), command);
        afterDispatch?.(command, getState?.());
        for (const listener of listeners) listener(command);
        return command.result;
      } catch (error) {
        onError?.(error, command, getState?.());
        throw error;
      }
    },
    get sequence() { return sequence; }
  };
}
