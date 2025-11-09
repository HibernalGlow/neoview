/**
 * NeoView - Simple Store Utilities
 * 简单的存储工具，替代 svelte-persisted-store
 */

import { writable, type Writable } from 'svelte/store';

/**
 * 创建一个持久化的 writable store
 * 使用 localStorage 进行持久化
 */
export function persisted<T>(key: string, initialValue: T): Writable<T> {
  // 从 localStorage 读取初始值
  const storedValue = typeof window !== 'undefined' ? localStorage.getItem(key) : null;
  const value = storedValue ? JSON.parse(storedValue) : initialValue;

  // 创建 writable store
  const store = writable<T>(value);

  // 订阅 store 的变化并保存到 localStorage
  if (typeof window !== 'undefined') {
    store.subscribe((value) => {
      localStorage.setItem(key, JSON.stringify(value));
    });
  }

  return store;
}

/**
 * 创建一个会话级别的 store
 * 使用 sessionStorage 进行持久化
 */
export function sessionStore<T>(key: string, initialValue: T): Writable<T> {
  // 从 sessionStorage 读取初始值
  const storedValue = typeof window !== 'undefined' ? sessionStorage.getItem(key) : null;
  const value = storedValue ? JSON.parse(storedValue) : initialValue;

  // 创建 writable store
  const store = writable<T>(value);

  // 订阅 store 的变化并保存到 sessionStorage
  if (typeof window !== 'undefined') {
    store.subscribe((value) => {
      sessionStorage.setItem(key, JSON.stringify(value));
    });
  }

  return store;
}