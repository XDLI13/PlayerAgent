/** 简单的类型安全事件总线。订阅返回清理函数，避免重复启动后堆积监听。 */
export class EventBus<T> {
  private listeners = new Set<(value: T) => void>();
  on(fn: (value: T) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit(value: T) {
    for (const fn of this.listeners) fn(value);
  }
}
