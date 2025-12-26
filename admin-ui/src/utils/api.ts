import axios, { type AxiosRequestConfig } from 'axios';

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

interface ApiClient {
  get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T>;
  post<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>;
  put<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>;
  delete<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getMessageField(value: unknown): string | undefined {
  if (!isPlainObject(value)) return undefined;
  const msg = value.message;
  if (typeof msg !== 'string') return undefined;
  const trimmed = msg.trim();
  return trimmed === '' ? undefined : trimmed;
}

function isRequestCanceled(error: unknown): boolean {
  if (axios.isCancel(error)) return true;
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  return code === 'ERR_CANCELED';
}

export function getApiErrorMessage(error: unknown, fallbackMessage: string): string {
  if (error && typeof error === 'object' && 'userMessage' in error) {
    const msg = (error as { userMessage?: unknown }).userMessage;
    if (typeof msg === 'string' && msg.trim() !== '') return msg;
  }

  if (axios.isAxiosError(error)) {
    if (isRequestCanceled(error)) return '请求已取消';
    const code = error.code;
    const status = error.response?.status;
    const data = error.response?.data as unknown;
    const serverMessage = getMessageField(data);

    if (code === 'ECONNABORTED') return '请求超时，请稍后重试';
    if (!error.response) return '无法连接到 API 服务：请确认后端已启动且端口配置正确';
    if (status === 502) return serverMessage || 'API 服务不可用：后端不可达';
    if (typeof serverMessage === 'string' && serverMessage.trim() !== '') return serverMessage;
  }

  return fallbackMessage;
}

const client = axios.create({
  baseURL: '/api/v1',
  timeout: 300000,
});

// 添加请求拦截器（如需 Token）
client.interceptors.request.use(
  (config) => {
    if (typeof config.url !== 'string' || config.url.trim() === '') {
      throw new Error('API 请求缺少 url');
    }

    const token = localStorage.getItem('admin_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// 添加响应拦截器
client.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (isRequestCanceled(error)) {
      (error as { userMessage?: string }).userMessage = '请求已取消';
      return Promise.reject(error);
    }

    const status: number | undefined = error?.response?.status;
    const responseData = error?.response?.data as unknown;
    if (status === 401) {
      localStorage.removeItem('admin_token');
      const path = window.location.pathname;
      if (!path.startsWith('/admin/login')) {
        window.history.replaceState(null, '', '/admin/login');
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
    }

    const method = (error?.config?.method as string | undefined)?.toUpperCase();
    const baseURL = error?.config?.baseURL as string | undefined;
    const url = error?.config?.url as string | undefined;
    const fullUrl = `${baseURL ?? ''}${url ?? ''}`;

    const serverMessage = getMessageField(responseData);

    const userMessage =
      !error?.response
        ? '无法连接到 API 服务：请确认后端已启动且端口配置正确'
        : serverMessage || error?.message || 'API 请求失败';

    console.error('API Error:', {
      status,
      method,
      url: fullUrl,
      message: userMessage,
    });

    (error as { userMessage?: string }).userMessage = userMessage;
    return Promise.reject(error);
  }
);

const api = client as unknown as ApiClient;

export default api;
