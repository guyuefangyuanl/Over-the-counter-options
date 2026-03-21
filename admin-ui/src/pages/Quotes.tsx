import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  App,
  Table,
  Button,
  Upload,
  Card,
  Space,
  Typography,
  Modal,
  type UploadProps,
  Progress,
  Statistic as AntdStatistic,
  Descriptions,
  Row,
  Col,
  Form,
  Input,
  InputNumber,
  Select,
} from 'antd';
import { UploadOutlined, ReloadOutlined, DeleteOutlined, EditOutlined, SearchOutlined, SyncOutlined } from '@ant-design/icons';
import api, { getApiErrorMessage, type ApiResponse } from '../utils/api';
import type { ColumnsType } from 'antd/es/table';
import PageState from '../components/PageState';

const { Title } = Typography;

// 简单的防抖 Hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  
  return debouncedValue;
}

// 简单的内存缓存
const queryCache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 30000; // 30 秒

function getCachedData<T>(key: string): T | null {
  const cached = queryCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data as T;
  }
  queryCache.delete(key);
  return null;
}

function setCachedData<T>(key: string, data: T): void {
  queryCache.set(key, { data, timestamp: Date.now() });
}

function clearCache(): void {
  queryCache.clear();
}

interface Quote {
  _id?: string;
  _rowKey?: string;
  stock_code: string;
  code: string;
  name: string;
  price?: number;
  rate?: number;
  type?: string;
  term?: string;
  trader?: string;
  changePercent?: number;
  updated_at?: string;
}

type ClientRowKey = {
  _rowKey: string;
};

type UploadPreviewPayload = {
  uploadId: string;
  total: number;
  preview: Array<Quote & ClientRowKey>;
};

type UploadPreviewPayloadServer = {
  uploadId: string;
  total: number;
  preview: Quote[];
};

type SyncResultPayload = {
  processed: number;
  fetched?: number;
  durationMs?: number;
  errors?: unknown[];
};

interface ProgressData {
  percent: number;
  step: 'cleaning' | 'ingesting' | 'completed' | 'failed';
  message: string;
  current: number;
  total: number;
  invalid?: number;
  success?: number;
  failed?: number;
}

type ConfirmUploadPayload = {
  status?: 'processing' | 'processed' | 'failed';
  progress?: ProgressData;
  result?: {
    success: boolean;
    processed: number;
    valid: number;
    invalid: number;
    count: number;
    durationMs: number;
    errors?: unknown[];
  };
};

type DeleteQuotesPayload = {
  status?: 'processing' | 'processed' | 'failed';
  taskId?: string;
  deleted?: number;
  durationMs?: number;
};

type SyncLog = {
  _id?: string;
  type?: string;
  source?: string;
  processed?: number;
  fetched?: number;
  errorCount?: number;
  durationMs?: number;
  created_at?: string;
  _rowKey?: string;
};

type PaginatedPayload<T> = {
  items: T[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    pages: number;
  };
};

function createRowKey(prefix: string) {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ? `${prefix}-${uuid}` : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatSyncError(err: unknown) {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message?: unknown }).message ?? '');
  }
  return JSON.stringify(err);
}

const Quotes: React.FC = () => {
  const { message } = App.useApp();
  const [isFetching, setIsFetching] = useState(false);
  const [isCrawling, setIsCrawling] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadPreview, setUploadPreview] = useState<UploadPreviewPayload | null>(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [isConfirmingUpload, setIsConfirmingUpload] = useState(false);
  const [syncLogsOpen, setSyncLogsOpen] = useState(false);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [isFetchingSyncLogs, setIsFetchingSyncLogs] = useState(false);
  const [data, setData] = useState<Quote[]>([]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCrawlingAll, setIsCrawlingAll] = useState(false);
  const crawlAbortRef = useRef<AbortController | null>(null);
  const [uploadProgress, setUploadProgress] = useState<ProgressData | null>(null);
  const [deleteProgress, setDeleteProgress] = useState<ProgressData | null>(null);
  const [uploadResult, setUploadResult] = useState<ConfirmUploadPayload['result'] | null>(null);
  const uploadPollTimerRef = useRef<number | null>(null);
  const deletePollTimerRef = useRef<number | null>(null);
  // 全量更新相关状态
  const syncAllPollTimerRef = useRef<number | null>(null);
  const [syncAllProgress, setSyncAllProgress] = useState<ProgressData | null>(null);
  const [syncAllResult, setSyncAllResult] = useState<SyncResultPayload | null>(null);
  
  // 筛选相关状态
  const [filterForm] = Form.useForm();
  const [filters, setFilters] = useState<{ keyword?: string; type?: string; trader?: string }>({});
  
  // 编辑相关状态
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editForm] = Form.useForm();
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  
  // 自动刷新状态
  const [autoRefresh, setAutoRefresh] = useState(false);
  const autoRefreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchQuotes = useCallback(async (page = 1, pageSize = 10, filterParams?: { keyword?: string; type?: string; trader?: string }) => {
    setIsFetching(true);
    setError(null);
    try {
      const params: Record<string, unknown> = { page, pageSize };
      const currentFilters = filterParams ?? filters;
      if (currentFilters.keyword) params.keyword = currentFilters.keyword;
      if (currentFilters.type) params.type = currentFilters.type;
      if (currentFilters.trader) params.trader = currentFilters.trader;
      
      const res = await api.get<ApiResponse<PaginatedPayload<Quote>>>('/admin/quotes', {
        params,
      });
      console.log('[Quotes] API Response:', res);
      if (res.success && res.data?.pagination && Array.isArray(res.data.items)) {
        setData(
          res.data.items.map((item, index) => ({
            ...item,
            _rowKey: item._id && item._id !== item.stock_code 
              ? item._id 
              : `${item.stock_code}_${item.updated_at || ''}_${index}_${createRowKey('row')}`,
          }))
        );
        setPagination({
          current: res.data.pagination.page,
          pageSize: res.data.pagination.per_page,
          total: res.data.pagination.total,
        });
      }
    } catch (err) {
      const msg = getApiErrorMessage(err, '获取报价列表失败');
      setError(msg);
      message.error(msg);
    } finally {
      setIsFetching(false);
    }
  }, [message, filters]);

  useEffect(() => {
    void fetchQuotes();
  }, [fetchQuotes]);

  useEffect(() => {
    return () => {
      crawlAbortRef.current?.abort();
      crawlAbortRef.current = null;
      if (uploadPollTimerRef.current !== null) {
        window.clearInterval(uploadPollTimerRef.current);
        uploadPollTimerRef.current = null;
      }
      if (deletePollTimerRef.current !== null) {
        window.clearInterval(deletePollTimerRef.current);
        deletePollTimerRef.current = null;
      }
      if (syncAllPollTimerRef.current !== null) {
        window.clearInterval(syncAllPollTimerRef.current);
        syncAllPollTimerRef.current = null;
      }
      if (autoRefreshTimerRef.current !== null) {
        clearInterval(autoRefreshTimerRef.current);
        autoRefreshTimerRef.current = null;
      }
    };
  }, []);

  // 自动刷新逻辑
  useEffect(() => {
    if (autoRefresh) {
      autoRefreshTimerRef.current = setInterval(() => {
        void fetchQuotes(pagination.current, pagination.pageSize, filters);
      }, 30000); // 30秒刷新一次
      
      return () => {
        if (autoRefreshTimerRef.current !== null) {
          clearInterval(autoRefreshTimerRef.current);
          autoRefreshTimerRef.current = null;
        }
      };
    } else {
      if (autoRefreshTimerRef.current !== null) {
        clearInterval(autoRefreshTimerRef.current);
        autoRefreshTimerRef.current = null;
      }
    }
  }, [autoRefresh, pagination.current, pagination.pageSize, filters, fetchQuotes]);

  const columns: ColumnsType<Quote> = [
    {
      title: '代码',
      dataIndex: 'stock_code',
      key: 'stock_code',
      sorter: (a, b) => a.stock_code.localeCompare(b.stock_code),
    },
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      sorter: (a, b) => (a.name || '').localeCompare(b.name || ''),
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      render: (val) => val || '-',
      filters: [
        { text: '香草', value: '香草' },
        { text: 'Call', value: 'Call' },
        { text: 'Put', value: 'Put' },
      ],
      onFilter: (value, record) => record.type === value,
    },
    {
      title: '期限',
      dataIndex: 'term',
      key: 'term',
      render: (val) => val || '-',
    },
    {
      title: '交易商',
      dataIndex: 'trader',
      key: 'trader',
      render: (val) => val || '-',
    },
    {
      title: '费率/价格',
      dataIndex: 'rate',
      key: 'rate',
      sorter: (a, b) => {
        const valA = a.rate ?? a.price ?? 0;
        const valB = b.rate ?? b.price ?? 0;
        return valA - valB;
      },
      render: (val, record: Quote) => {
        // 如果有涨跌幅数据，显示涨跌幅并添加颜色
        if (typeof record.changePercent === 'number') {
          const changePercent = record.changePercent;
          const color = changePercent > 0 ? '#cf1322' : changePercent < 0 ? '#3f8600' : '#595959';
          const arrow = changePercent > 0 ? '↑' : changePercent < 0 ? '↓' : '';
          return (
            <span style={{ color, fontWeight: 500 }}>
              {changePercent > 0 ? '+' : ''}{(changePercent * 100).toFixed(2)}% {arrow}
            </span>
          );
        }
        // 显示费率
        if (typeof val === 'number') {
          return <span style={{ color: '#595959' }}>{(val * 100).toFixed(2)}%</span>;
        }
        // 显示价格
        if (typeof record.price === 'number') {
          return <span style={{ color: '#595959' }}>{record.price.toFixed(2)}</span>;
        }
        return '-';
      },
    },
    {
      title: '更新时间',
      dataIndex: 'updated_at',
      key: 'updated_at',
      sorter: (a, b) => {
        const timeA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
        const timeB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
        return timeA - timeB;
      },
      render: (val) => val ? new Date(val).toLocaleString() : '-',
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEditOpen(record)}
          >
            编辑
          </Button>
          <Button
            type="link"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDelete([record.stock_code])}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ];
  
  // 筛选处理
  const handleFilterSubmit = useCallback(() => {
    const values = filterForm.getFieldsValue();
    setFilters(values);
    void fetchQuotes(1, pagination.pageSize, values);
  }, [fetchQuotes, filterForm, pagination.pageSize]);
  
  const handleFilterReset = useCallback(() => {
    filterForm.resetFields();
    setFilters({});
    void fetchQuotes(1, pagination.pageSize, {});
  }, [fetchQuotes, filterForm, pagination.pageSize]);
  
  // 编辑处理
  const handleEditOpen = useCallback((record: Quote) => {
    setEditingQuote(record);
    editForm.setFieldsValue({
      name: record.name,
      price: record.price,
      rate: record.rate,
      type: record.type,
      term: record.term,
      trader: record.trader,
    });
    setEditModalOpen(true);
  }, [editForm]);
  
  const handleEditSubmit = useCallback(async () => {
    if (!editingQuote) return;
    
    try {
      const values = await editForm.validateFields();
      setIsUpdating(true);
      
      const quoteId = editingQuote._id || editingQuote.code;
      const res = await api.put<ApiResponse<{ updated: boolean }>>(`/admin/quotes/${quoteId}`, values);
      
      if (res.success) {
        message.success('更新成功');
        setEditModalOpen(false);
        setEditingQuote(null);
        editForm.resetFields();
        void fetchQuotes(pagination.current, pagination.pageSize, filters);
      } else {
        message.error(res.message || '更新失败');
      }
    } catch (err) {
      message.error(getApiErrorMessage(err, '更新失败'));
    } finally {
      setIsUpdating(false);
    }
  }, [editingQuote, editForm, fetchQuotes, message, pagination, filters]);

  const [isBulkImporting, setIsBulkImporting] = useState(false);

  const handleBulkImportLocal = useCallback(async () => {
    setIsBulkImporting(true);
    setUploadProgress(null);
    setUploadResult(null);
    try {
      const res = await api.post<ApiResponse<{ status: string; uploadId: string }>>('/admin/upload-quotes/bulk-local');
      if (res.success && res.data?.uploadId) {
        const uploadId = res.data.uploadId;
        setUploadModalOpen(true);
        setIsConfirmingUpload(true);
        
        if (uploadPollTimerRef.current !== null) {
          window.clearInterval(uploadPollTimerRef.current);
          uploadPollTimerRef.current = null;
        }

        uploadPollTimerRef.current = window.setInterval(async () => {
          try {
            const pollRes = await api.get<ApiResponse<ConfirmUploadPayload>>('/admin/upload-quotes/progress', {
              params: { uploadId },
            });
            if (pollRes.success) {
              const { status, progress, result } = pollRes.data;
              setUploadProgress(progress || null);
              if (status === 'processed' || status === 'failed') {
                if (uploadPollTimerRef.current !== null) {
                  window.clearInterval(uploadPollTimerRef.current);
                  uploadPollTimerRef.current = null;
                }
                setIsConfirmingUpload(false);
                setUploadResult(result || null);
                if (status === 'processed') {
                  message.success('批量导入完成');
                  void fetchQuotes(pagination.current, pagination.pageSize);
                } else {
                  message.error('批量导入失败');
                }
              }
            }
          } catch {
            if (uploadPollTimerRef.current !== null) {
              window.clearInterval(uploadPollTimerRef.current);
              uploadPollTimerRef.current = null;
            }
            setIsConfirmingUpload(false);
            message.error('获取进度失败');
          }
        }, 2000);
      }
    } catch (err) {
      message.error(getApiErrorMessage(err, '启动批量导入失败'));
    } finally {
      setIsBulkImporting(false);
    }
  }, [fetchQuotes, message, pagination]);

  const handleDelete = useCallback(async (codes?: string[]) => {
    const isClearAll = !codes || codes.length === 0;
    const content = isClearAll 
      ? '确定要清空所有行情数据吗？此操作不可撤销。' 
      : `确定要删除选中的 ${codes.length} 条数据吗？`;
    
    Modal.confirm({
      title: isClearAll ? '清空确认' : '删除确认',
      content,
      okText: '确定',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        setIsDeleting(true);
        if (deletePollTimerRef.current !== null) {
          window.clearInterval(deletePollTimerRef.current);
          deletePollTimerRef.current = null;
        }
        try {
          const res = await api.delete<ApiResponse<DeleteQuotesPayload>>('/admin/quotes', {
            data: { codes },
          });
          if (res.success) {
            const status = res.data?.status;
            if (status === 'processing' && res.data?.taskId) {
              const taskId = res.data.taskId;
              
              // 初始进度
              setDeleteProgress({
                percent: 0,
                step: 'cleaning',
                message: '正在准备清空...',
                current: 0,
                total: 0
              });

              // 乐观更新：如果是清空所有，直接清空本地数据
              if (isClearAll) {
                setData([]);
                setPagination(prev => ({ ...prev, total: 0 }));
              }

              deletePollTimerRef.current = window.setInterval(async () => {
                try {
                  const pollRes = await api.get<ApiResponse<DeleteQuotesPayload & { progress?: ProgressData }>>(`/admin/quotes/delete-task/${taskId}`);
                  if (!pollRes.success) {
                    message.error({ content: pollRes.message || '删除失败', key: 'delete-quotes' });
                    setDeleteProgress(null);
                    if (deletePollTimerRef.current !== null) {
                      window.clearInterval(deletePollTimerRef.current);
                      deletePollTimerRef.current = null;
                    }
                    setIsDeleting(false);
                    return;
                  }

                  // 更新进度
                  if (pollRes.data?.progress) {
                    setDeleteProgress(pollRes.data.progress);
                  } else if (pollRes.data?.deleted !== undefined) {
                    setDeleteProgress(prev => ({
                      percent: prev?.percent ?? 0,
                      step: 'cleaning',
                      message: `正在删除: ${pollRes.data?.deleted}`,
                      current: pollRes.data?.deleted ?? 0,
                      total: prev?.total ?? 0
                    }));
                  }

                  const pollStatus = pollRes.data?.status;
                  if (pollStatus === 'processing') return;

                  if (pollStatus === 'processed') {
                    const deleted = pollRes.data?.deleted ?? 0;
                    setDeleteProgress({
                      percent: 100,
                      step: 'completed',
                      message: `清空完成，共删除 ${deleted} 条记录`,
                      current: deleted,
                      total: deleted
                    });
                    
                    if (deletePollTimerRef.current !== null) {
                      window.clearInterval(deletePollTimerRef.current);
                      deletePollTimerRef.current = null;
                    }
                    
                    setTimeout(() => {
                      message.success({ content: pollRes.message || `已清空：删除 ${deleted} 条`, key: 'delete-quotes' });
                      setDeleteProgress(null);
                      setIsDeleting(false);
                      setSelectedRowKeys([]);
                      void fetchQuotes(1, pagination.pageSize);
                    }, 1000);
                    return;
                  }

                  if (pollStatus === 'failed') {
                    message.error({ content: pollRes.message || '清空失败', key: 'delete-quotes' });
                    setDeleteProgress(null);
                    if (deletePollTimerRef.current !== null) {
                      window.clearInterval(deletePollTimerRef.current);
                      deletePollTimerRef.current = null;
                    }
                    setIsDeleting(false);
                    return;
                  }
                } catch (err) {
                  console.error('Polling error:', err);
                }
              }, 1000);
              return;
            }

            const deletedCount = res.data?.deleted ?? 0;
            message.success(res.message || `成功删除 ${deletedCount} 条数据`);
            
            if (codes && codes.length > 0) {
              const codesSet = new Set(codes);
              setData(prev => prev.filter(item => !codesSet.has(item.stock_code)));
            } else if (isClearAll) {
              setData([]);
              setPagination(prev => ({ ...prev, total: 0 }));
            }

            setSelectedRowKeys([]);
            void fetchQuotes(pagination.current, pagination.pageSize);
          }
        } catch (err) {
          message.error(getApiErrorMessage(err, '删除失败'));
        }
        setIsDeleting(false);
      },
    });
  }, [fetchQuotes, message, pagination]);

  const handleCrawl = useCallback(async (event?: React.MouseEvent<HTMLElement>) => {
    event?.preventDefault();
    event?.stopPropagation();

    if (isCrawling) return;

    const abortController = new AbortController();
    crawlAbortRef.current?.abort();
    crawlAbortRef.current = abortController;

    setIsCrawling(true);
    try {
      const res = await api.post<ApiResponse<SyncResultPayload>>('/admin/sync-quotes', undefined, {
        signal: abortController.signal,
      });
      if (res.success) {
        const processed = res.data?.processed ?? 0;
        message.success(res.message || `同步完成：写入 ${processed} 条`);
        void fetchQuotes(pagination.current, pagination.pageSize);
      }
    } catch (err) {
      if (err && typeof err === 'object' && 'code' in err && (err as { code?: unknown }).code === 'ERR_CANCELED') {
        return;
      }
      message.error(getApiErrorMessage(err, '同步数据失败'));
    } finally {
      if (crawlAbortRef.current === abortController) {
        crawlAbortRef.current = null;
      }
      setIsCrawling(false);
    }
  }, [fetchQuotes, isCrawling, message, pagination]);

  const handleCrawlAll = useCallback(async () => {
    if (isCrawlingAll) return;

    // 清理之前的定时器
    if (syncAllPollTimerRef.current !== null) {
      window.clearInterval(syncAllPollTimerRef.current);
      syncAllPollTimerRef.current = null;
    }

    setIsCrawlingAll(true);
    setSyncAllProgress(null);
    setSyncAllResult(null);

    // 设置初始进度
    setSyncAllProgress({
      percent: 0,
      step: 'cleaning',
      message: '正在启动全量同步...',
      current: 0,
      total: 0,
    });

    try {
      const res = await api.post<ApiResponse<{ status: string; taskId: string }>>('/admin/sync-all-quotes');
      if (res.success && res.data?.taskId) {
        const taskId = res.data.taskId;

        // 开始轮询状态 - 使用 ref 存储定时器
        syncAllPollTimerRef.current = window.setInterval(async () => {
          try {
            const pollRes = await api.get<ApiResponse<{
              status: string;
              progress?: ProgressData;
              result?: SyncResultPayload;
            }>>(`/admin/sync-all-quotes/status/${taskId}`);

            if (!pollRes.success) {
              message.error({ content: pollRes.message || '全量同步失败', key: 'sync-all' });
              if (syncAllPollTimerRef.current !== null) {
                window.clearInterval(syncAllPollTimerRef.current);
                syncAllPollTimerRef.current = null;
              }
              setSyncAllProgress(null);
              setIsCrawlingAll(false);
              return;
            }

            // 更新进度
            if (pollRes.data?.progress) {
              setSyncAllProgress(pollRes.data.progress);
            }

            const status = pollRes.data?.status;
            if (status === 'processed') {
              const result = pollRes.data?.result;
              const processed = result?.processed ?? 0;

              // 更新最终进度
              setSyncAllProgress({
                percent: 100,
                step: 'completed',
                message: `全量同步完成：写入 ${processed} 条`,
                current: processed,
                total: processed,
              });

              if (syncAllPollTimerRef.current !== null) {
                window.clearInterval(syncAllPollTimerRef.current);
                syncAllPollTimerRef.current = null;
              }

              setSyncAllResult(result || null);
              message.success({ content: `全量同步完成：写入 ${processed} 条`, key: 'sync-all' });
              setIsCrawlingAll(false);
              void fetchQuotes(pagination.current, pagination.pageSize);

              // 1秒后关闭进度弹窗
              setTimeout(() => {
                setSyncAllProgress(null);
              }, 1000);
            } else if (status === 'failed') {
              message.error({ content: pollRes.message || '全量同步失败', key: 'sync-all' });
              if (syncAllPollTimerRef.current !== null) {
                window.clearInterval(syncAllPollTimerRef.current);
                syncAllPollTimerRef.current = null;
              }
              setSyncAllProgress(null);
              setIsCrawlingAll(false);
            }
          } catch (err) {
            message.error({ content: getApiErrorMessage(err, '查询同步状态失败'), key: 'sync-all' });
            if (syncAllPollTimerRef.current !== null) {
              window.clearInterval(syncAllPollTimerRef.current);
              syncAllPollTimerRef.current = null;
            }
            setSyncAllProgress(null);
            setIsCrawlingAll(false);
          }
        }, 2000); // 统一使用 2 秒轮询间隔
      }
    } catch (err) {
      message.error(getApiErrorMessage(err, '启动全量同步失败'));
      setSyncAllProgress(null);
      setIsCrawlingAll(false);
    }
  }, [fetchQuotes, isCrawlingAll, message, pagination]);

  const handleBeforeUpload: UploadProps['beforeUpload'] = useCallback(async (file: File) => {
    setIsUploading(true);
    setUploadPreview(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post<ApiResponse<UploadPreviewPayloadServer>>('/admin/upload-quotes/preview', form);
      if (res.success) {
        const payload = res.data;
        const preview = Array.isArray(payload?.preview)
          ? payload.preview.map((row, index) => ({ ...row, _rowKey: `${row.stock_code || 'preview'}_${index}_${createRowKey('preview')}` }))
          : [];
        setUploadPreview({ ...payload, preview });
        setUploadModalOpen(true);
        message.success(res.message || '解析成功');
      } else {
        message.error(res.message || '解析失败');
      }
    } catch (err) {
      message.error(getApiErrorMessage(err, '解析文件失败'));
    } finally {
      setIsUploading(false);
    }
    return false;
  }, [message]);

  const confirmUpload = useCallback(async () => {
    if (!uploadPreview?.uploadId) {
      message.error('缺少 uploadId');
      return;
    }
    setIsConfirmingUpload(true);
    setUploadProgress(null);
    setUploadResult(null);

    if (uploadPollTimerRef.current !== null) {
      window.clearInterval(uploadPollTimerRef.current);
      uploadPollTimerRef.current = null;
    }

    try {
      const uploadId = uploadPreview.uploadId;
      const res = await api.post<ApiResponse<ConfirmUploadPayload>>('/admin/upload-quotes/confirm', {
        uploadId,
      });

      if (res.success) {
        if (res.data?.status === 'processing') {
          setUploadProgress(res.data.progress || null);
          
          uploadPollTimerRef.current = window.setInterval(async () => {
            try {
              const pollRes = await api.get<ApiResponse<ConfirmUploadPayload>>('/admin/upload-quotes/progress', {
                params: { uploadId },
              });

              if (!pollRes.success) {
                throw new Error(pollRes.message || '获取进度失败');
              }

              const { status, progress, result } = pollRes.data;
              setUploadProgress(progress || null);

              if (status === 'processed' || status === 'failed') {
                if (uploadPollTimerRef.current !== null) {
                  window.clearInterval(uploadPollTimerRef.current);
                  uploadPollTimerRef.current = null;
                }
                setIsConfirmingUpload(false);
                setUploadResult(result || null);
                
                if (status === 'processed' && result?.success) {
                  message.success('入库完成');
                  void fetchQuotes(pagination.current, pagination.pageSize);
                } else {
                  message.error('入库失败');
                }
              }
            } catch (err) {
              if (uploadPollTimerRef.current !== null) {
                window.clearInterval(uploadPollTimerRef.current);
                uploadPollTimerRef.current = null;
              }
              setIsConfirmingUpload(false);
              message.error(getApiErrorMessage(err, '同步进度获取失败'));
            }
          }, 2000);
        } else if (res.data?.status === 'processed') {
          setUploadResult(res.data.result || null);
          setIsConfirmingUpload(false);
          message.success('入库完成');
          void fetchQuotes(pagination.current, pagination.pageSize);
        }
      }
    } catch (err) {
      setIsConfirmingUpload(false);
      message.error(getApiErrorMessage(err, '启动确认入库失败'));
    }
  }, [fetchQuotes, message, pagination, uploadPreview]);

  const fetchSyncLogs = useCallback(async () => {
    setIsFetchingSyncLogs(true);
    try {
      const res = await api.get<ApiResponse<PaginatedPayload<SyncLog>>>('/admin/sync-logs', {
        params: { page: 1, pageSize: 20 },
      });
      if (res.success && Array.isArray(res.data?.items)) {
        setSyncLogs(
          res.data.items.map((row, index) => ({
            ...row,
            _rowKey: row._id || `${index}_${createRowKey('sync-log')}`,
          }))
        );
      }
    } catch (err) {
      message.error(getApiErrorMessage(err, '获取同步历史失败'));
    } finally {
      setIsFetchingSyncLogs(false);
    }
  }, [message]);

  const openSyncLogs = useCallback(() => {
    setSyncLogsOpen(true);
    void fetchSyncLogs();
  }, [fetchSyncLogs]);

  const tableLoading = isFetching || isCrawling || isUploading;

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4}>行情管理</Title>
        <Space>
          {selectedRowKeys.length > 0 && (
            <Button 
              danger 
              icon={<DeleteOutlined />} 
              onClick={() => handleDelete(selectedRowKeys as string[])}
              loading={isDeleting}
            >
              删除选中 ({selectedRowKeys.length})
            </Button>
          )}
          <Button 
            danger 
            icon={<DeleteOutlined />} 
            onClick={() => handleDelete()}
            loading={isDeleting}
          >
            清空所有
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => fetchQuotes(pagination.current, pagination.pageSize, filters)}>
            刷新
          </Button>
          <Button 
            type={autoRefresh ? 'primary' : 'default'}
            icon={<SyncOutlined spin={autoRefresh} />}
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            {autoRefresh ? '自动刷新中' : '开启自动刷新'}
          </Button>
          <Button onClick={openSyncLogs} disabled={isFetchingSyncLogs}>
            同步历史
          </Button>
          <Button 
            type="primary" 
            icon={<ReloadOutlined />} 
            onClick={handleCrawlAll}
            loading={isCrawlingAll}
            disabled={isCrawlingAll}
          >
            全量更新 (A股全部)
          </Button>
          <Button 
            icon={<ReloadOutlined />} 
            onClick={handleCrawl}
            loading={isCrawling}
            disabled={isCrawling}
          >
            快速更新 (默认股票)
          </Button>
          <Button 
            icon={<UploadOutlined />} 
            onClick={handleBulkImportLocal}
            loading={isBulkImporting}
            disabled={isBulkImporting}
          >
            批量录入本地数据
          </Button>
          <Upload
            name="file"
            showUploadList={false}
            beforeUpload={handleBeforeUpload}
            accept=".xlsx,.xls,.csv"
          >
            <Button icon={<UploadOutlined />} loading={isUploading} disabled={isUploading}>
              上传本地文件
            </Button>
          </Upload>
        </Space>
      </div>
      
      {/* 筛选表单 */}
      <Form
        form={filterForm}
        layout="inline"
        style={{ marginBottom: 16 }}
        onFinish={handleFilterSubmit}
      >
        <Form.Item name="keyword" style={{ marginBottom: 8 }}>
          <Input 
            placeholder="股票代码/名称" 
            allowClear 
            style={{ width: 150 }}
            prefix={<SearchOutlined />}
          />
        </Form.Item>
        <Form.Item name="type" style={{ marginBottom: 8 }}>
          <Select 
            placeholder="类型" 
            allowClear 
            style={{ width: 120 }}
            options={[
              { label: '香草', value: '香草' },
              { label: 'Call', value: 'Call' },
              { label: 'Put', value: 'Put' },
            ]}
          />
        </Form.Item>
        <Form.Item name="trader" style={{ marginBottom: 8 }}>
          <Input 
            placeholder="交易商" 
            allowClear 
            style={{ width: 120 }}
          />
        </Form.Item>
        <Form.Item style={{ marginBottom: 8 }}>
          <Space>
            <Button type="primary" htmlType="submit" loading={isFetching}>
              筛选
            </Button>
            <Button onClick={handleFilterReset}>
              重置
            </Button>
          </Space>
        </Form.Item>
      </Form>
      
      <PageState
        loading={tableLoading}
        error={error}
        empty={!tableLoading && !error && data.length === 0}
        onRetry={() => fetchQuotes(pagination.current, pagination.pageSize)}
      >
        <Table
          columns={columns}
          dataSource={data}
          rowKey="_rowKey"
          scroll={{ x: 'max-content', y: 'calc(100vh - 400px)' }}
          rowSelection={{
            selectedRowKeys,
            onChange: (keys) => setSelectedRowKeys(keys),
          }}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条`,
            onChange: (page, pageSize) => {
              setPagination((prev) => ({ ...prev, current: page, pageSize }));
              void fetchQuotes(page, pageSize);
            },
          }}
        />
      </PageState>

      <Modal
        title="文件确认入库"
        open={uploadModalOpen}
        onOk={confirmUpload}
        confirmLoading={isConfirmingUpload}
        onCancel={() => {
          if (uploadPollTimerRef.current !== null) {
            window.clearInterval(uploadPollTimerRef.current);
            uploadPollTimerRef.current = null;
            setIsConfirmingUpload(false);
          }
          setUploadModalOpen(false);
          setUploadPreview(null);
          setUploadProgress(null);
          setUploadResult(null);
        }}
        okText="确认入库"
        cancelText="取消"
        width={800}
        okButtonProps={{ disabled: isConfirmingUpload }}
      >
        {isConfirmingUpload ? (
          <div style={{ padding: '20px 0' }}>
            <Title level={5}>{uploadProgress?.message || '处理中...'}</Title>
            <Progress 
              percent={uploadProgress?.percent || 0} 
              status={uploadProgress?.step === 'failed' ? 'exception' : 'active'}
              strokeColor={{
                '0%': '#108ee9',
                '100%': '#87d068',
              }}
            />
            <Row gutter={16} style={{ marginTop: 20 }}>
              <Col span={6}>
                <AntdStatistic title="总数" value={uploadProgress?.total || 0} />
              </Col>
              <Col span={6}>
                <AntdStatistic title="已处理" value={uploadProgress?.current || 0} />
              </Col>
              <Col span={6}>
                <AntdStatistic title="成功" value={uploadProgress?.success || 0} styles={{ content: { color: '#3f8600' } }} />
              </Col>
              <Col span={6}>
                <AntdStatistic title="清洗过滤" value={uploadProgress?.invalid || 0} styles={{ content: { color: '#cf1322' } }} />
              </Col>
            </Row>
          </div>
        ) : uploadResult ? (
          <div style={{ padding: '20px 0' }}>
            <Descriptions title="处理结果报告" bordered column={2}>
              <Descriptions.Item label="总提交记录">{uploadResult.count}</Descriptions.Item>
              <Descriptions.Item label="清洗后有效">{uploadResult.valid}</Descriptions.Item>
              <Descriptions.Item label="清洗过滤">{uploadResult.invalid}</Descriptions.Item>
              <Descriptions.Item label="同步成功">{uploadResult.processed}</Descriptions.Item>
              <Descriptions.Item label="同步失败">{uploadResult.count - uploadResult.processed - uploadResult.invalid}</Descriptions.Item>
              <Descriptions.Item label="总耗时">{uploadResult.durationMs}ms</Descriptions.Item>
            </Descriptions>
            {uploadResult.errors && uploadResult.errors.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <Typography.Text type="danger">部分同步失败原因：</Typography.Text>
                <ul>
                  {uploadResult.errors.slice(0, 5).map((err, i) => (
                    <li key={i}>{formatSyncError(err)}</li>
                  ))}
                  {uploadResult.errors.length > 5 && <li>...等更多错误</li>}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 12 }}>
              {uploadPreview ? `共识别 ${uploadPreview.total} 条，预览前 ${Math.min(uploadPreview.total, 20)} 条` : '暂无预览数据'}
            </div>
            <Table
              size="small"
              rowKey="_rowKey"
              columns={columns}
              dataSource={uploadPreview?.preview || []}
              pagination={false}
              scroll={{ y: 300 }}
            />
          </>
        )}
      </Modal>

      <Modal
        title="同步历史（最近20条）"
        open={syncLogsOpen}
        footer={null}
        onCancel={() => setSyncLogsOpen(false)}
      >
        <Table
          size="small"
          rowKey="_rowKey"
          loading={isFetchingSyncLogs}
          dataSource={syncLogs}
          pagination={false}
          columns={[
            { title: '类型', dataIndex: 'type', key: 'type', render: (v) => v || '-' },
            { title: '来源', dataIndex: 'source', key: 'source', render: (v) => v || '-' },
            { title: '写入', dataIndex: 'processed', key: 'processed', render: (v) => (typeof v === 'number' ? v : '-') },
            { title: '错误', dataIndex: 'errorCount', key: 'errorCount', render: (v) => (typeof v === 'number' ? v : '-') },
            { title: '耗时(ms)', dataIndex: 'durationMs', key: 'durationMs', render: (v) => (typeof v === 'number' ? v : '-') },
            {
              title: '时间',
              dataIndex: 'created_at',
              key: 'created_at',
              render: (v) => (v ? new Date(v).toLocaleString() : '-'),
            },
          ]}
        />
      </Modal>

      <Modal
        title="正在处理清空任务"
        open={!!deleteProgress}
        footer={null}
        closable={false}
        maskClosable={false}
        destroyOnHidden
      >
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <Progress
            type="circle"
            percent={deleteProgress?.percent}
            status={deleteProgress?.step === 'failed' ? 'exception' : 'active'}
          />
          <div style={{ marginTop: 20 }}>
            <Typography.Text strong style={{ fontSize: 16 }}>
              {deleteProgress?.message}
            </Typography.Text>
          </div>
          {deleteProgress?.total !== undefined && deleteProgress.total > 0 && (
            <div style={{ marginTop: 10 }}>
              <Typography.Text type="secondary">
                已删除: {deleteProgress.current} / 总计: {deleteProgress.total}
              </Typography.Text>
            </div>
          )}
        </div>
      </Modal>

      {/* 全量更新进度 Modal */}
      <Modal
        title="全量更新进度"
        open={!!syncAllProgress}
        footer={null}
        closable={false}
        maskClosable={false}
        destroyOnHidden
      >
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <Progress
            type="circle"
            percent={syncAllProgress?.percent}
            status={syncAllProgress?.step === 'failed' ? 'exception' : 'active'}
          />
          <div style={{ marginTop: 20 }}>
            <Typography.Text strong style={{ fontSize: 16 }}>
              {syncAllProgress?.message}
            </Typography.Text>
          </div>
          {syncAllProgress?.total !== undefined && syncAllProgress.total > 0 && (
            <div style={{ marginTop: 10 }}>
              <Typography.Text type="secondary">
                已处理: {syncAllProgress.current} / 总计: {syncAllProgress.total}
              </Typography.Text>
            </div>
          )}
          {syncAllResult && (
            <div style={{ marginTop: 16 }}>
              <Descriptions bordered size="small" column={2}>
                <Descriptions.Item label="写入数量">{syncAllResult.processed}</Descriptions.Item>
                <Descriptions.Item label="获取数量">{syncAllResult.fetched ?? '-'}</Descriptions.Item>
                {syncAllResult.durationMs && (
                  <Descriptions.Item label="耗时">{syncAllResult.durationMs}ms</Descriptions.Item>
                )}
              </Descriptions>
            </div>
          )}
        </div>
      </Modal>

      {/* 编辑Modal */}
      <Modal
        title="编辑行情"
        open={editModalOpen}
        onOk={handleEditSubmit}
        confirmLoading={isUpdating}
        onCancel={() => {
          setEditModalOpen(false);
          setEditingQuote(null);
          editForm.resetFields();
        }}
        okText="保存"
        cancelText="取消"
        width={600}
      >
        <Form
          form={editForm}
          layout="vertical"
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
                <Input placeholder="请输入名称" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="price" label="价格">
                <InputNumber placeholder="请输入价格" style={{ width: '100%' }} precision={2} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="rate" label="费率">
                <InputNumber placeholder="请输入费率（小数）" style={{ width: '100%' }} precision={4} step={0.0001} min={0} max={1} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="type" label="类型">
                <Select 
                  placeholder="请选择类型" 
                  allowClear
                  options={[
                    { label: '香草', value: '香草' },
                    { label: 'Call', value: 'Call' },
                    { label: 'Put', value: 'Put' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="term" label="期限">
                <Select 
                  placeholder="请选择期限" 
                  allowClear
                  options={[
                    { label: '1周', value: '1W' },
                    { label: '2周', value: '2W' },
                    { label: '1个月', value: '1M' },
                    { label: '2个月', value: '2M' },
                    { label: '3个月', value: '3M' },
                    { label: '6个月', value: '6M' },
                    { label: '12个月', value: '12M' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="trader" label="交易商">
                <Input placeholder="请输入交易商" />
              </Form.Item>
            </Col>
          </Row>
          {editingQuote && (
            <Descriptions column={2} size="small" style={{ marginTop: 16 }}>
              <Descriptions.Item label="代码">{editingQuote.stock_code}</Descriptions.Item>
              <Descriptions.Item label="ID">{editingQuote._id || editingQuote.code}</Descriptions.Item>
            </Descriptions>
          )}
        </Form>
      </Modal>
    </Card>
  );
};

export default Quotes;
