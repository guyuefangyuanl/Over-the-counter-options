/**
 * 全局状态管理
 * 使用 Zustand 进行状态管理
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// ============================================
// 类型定义
// ============================================

interface User {
  id: string;
  username: string;
  role: string;
  permissions: string[];
}

interface AppState {
  // 用户状态
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;

  // UI状态
  sidebarCollapsed: boolean;
  theme: 'light' | 'dark';

  // 操作
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  login: (user: User, token: string) => void;
  logout: () => void;
  toggleSidebar: () => void;
  setTheme: (theme: 'light' | 'dark') => void;
}

interface InquiryState {
  // 询价列表
  inquiries: any[];
  total: number;
  loading: boolean;

  // 筛选条件
  filters: {
    status?: string;
    page: number;
    pageSize: number;
  };

  // 操作
  setInquiries: (inquiries: any[], total: number) => void;
  setFilters: (filters: Partial<InquiryState['filters']>) => void;
  setLoading: (loading: boolean) => void;
  resetFilters: () => void;
}

interface QuoteState {
  // 行情数据
  quotes: any[];
  loading: boolean;

  // 操作
  setQuotes: (quotes: any[]) => void;
  setLoading: (loading: boolean) => void;
}

// ============================================
// App Store
// ============================================

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // 初始状态
      user: null,
      token: null,
      isAuthenticated: false,
      sidebarCollapsed: false,
      theme: 'light',

      // 操作
      setUser: (user) => set({ user, isAuthenticated: !!user }),

      setToken: (token) => set({ token }),

      login: (user, token) => set({
        user,
        token,
        isAuthenticated: true
      }),

      logout: () => set({
        user: null,
        token: null,
        isAuthenticated: false
      }),

      toggleSidebar: () => set((state) => ({
        sidebarCollapsed: !state.sidebarCollapsed
      })),

      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'app-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        token: state.token,
        theme: state.theme,
        sidebarCollapsed: state.sidebarCollapsed
      }),
    }
  )
);

// ============================================
// Inquiry Store
// ============================================

const defaultFilters = {
  status: undefined,
  page: 1,
  pageSize: 20
};

export const useInquiryStore = create<InquiryState>((set) => ({
  inquiries: [],
  total: 0,
  loading: false,
  filters: { ...defaultFilters },

  setInquiries: (inquiries, total) => set({ inquiries, total }),

  setFilters: (filters) => set((state) => ({
    filters: { ...state.filters, ...filters }
  })),

  setLoading: (loading) => set({ loading }),

  resetFilters: () => set({ filters: { ...defaultFilters } })
}));

// ============================================
// Quote Store
// ============================================

export const useQuoteStore = create<QuoteState>((set) => ({
  quotes: [],
  loading: false,

  setQuotes: (quotes) => set({ quotes }),

  setLoading: (loading) => set({ loading })
}));

// ============================================
// 选择器 Hooks
// ============================================

export const useAuth = () => {
  const user = useAppStore((state) => state.user);
  const token = useAppStore((state) => state.token);
  const isAuthenticated = useAppStore((state) => state.isAuthenticated);
  const login = useAppStore((state) => state.login);
  const logout = useAppStore((state) => state.logout);

  return { user, token, isAuthenticated, login, logout };
};

export const useTheme = () => {
  const theme = useAppStore((state) => state.theme);
  const setTheme = useAppStore((state) => state.setTheme);

  return { theme, setTheme };
};

export const useSidebar = () => {
  const collapsed = useAppStore((state) => state.sidebarCollapsed);
  const toggle = useAppStore((state) => state.toggleSidebar);

  return { collapsed, toggle };
};

// ============================================
// API 集成
// ============================================

import axios from 'axios';

// 配置 axios 拦截器
axios.interceptors.request.use(
  (config) => {
    const token = useAppStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// 响应拦截器处理 401
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAppStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);