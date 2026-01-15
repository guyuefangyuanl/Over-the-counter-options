import React, { useCallback, useEffect, useRef, useState } from 'react';
import { App, Table, Button, Upload, Card, Space, Typography, Modal, type UploadProps } from 'antd';
import { UploadOutlined, ReloadOutlined, DeleteOutlined } from '@ant-design/icons';
import api, { getApiErrorMessage, type ApiResponse } from '../utils/api';
import type { ColumnsType } from 'antd/es/table';
import PageState from '../components/PageState';

const { Title } = Typography;

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

type ConfirmUploadPayload = {
  status?: 'processing' | 'processed' | 'failed';
  processed?: number;
  durationMs?: number;
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
  const uploadPollTimerRef = useRef<number | null>(null);
  const deletePollTimerRef = useRef<number | null>(null);

  const fetchQuotes = useCallback(async (page = 1, pageSize = 10) => {
    setIsFetching(true);
    setError(null);
    try {
      const res = await api.get<ApiResponse<PaginatedPayload<Quote>>>('/admin/quotes', {
        params: { page, pageSize },
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
  }, [message]);

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
    };
  }, []);

  const columns: ColumnsType<Quote> = [
    {
      title: '代码',
      dataIndex: 'stock_code',
      key: 'stock_code',
    },
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      render: (val) => val || '-',
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
      render: (val, record: any) => {
        if (typeof val === 'number') return `${(val * 100).toFixed(2)}%`;
        if (typeof record.price === 'number') return record.price.toFixed(2);
        return '-';
      },
    },
    {
      title: '更新时间',
      dataIndex: 'updated_at',
      key: 'updated_at',
      render: (val) => val ? new Date(val).toLocaleString() : '-',
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Button
          type="link"
          danger
          icon={<DeleteOutlined />}
          onClick={() => handleDelete([record.stock_code])}
        >
          删除
        </Button>
      ),
    },
  ];

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
              message.loading({ content: res.message || '清空进行中…', key: 'delete-quotes', duration: 0 });
              
              // 乐观更新：如果是清空所有，直接清空本地数据
              if (isClearAll) {
                setData([]);
                setPagination(prev => ({ ...prev, total: 0 }));
              }

              deletePollTimerRef.current = window.setInterval(async () => {
                try {
                  const pollRes = await api.get<ApiResponse<DeleteQuotesPayload>>(`/admin/quotes/delete-task/${taskId}`);
                  if (!pollRes.success) {
                    message.error({ content: pollRes.message || '删除失败', key: 'delete-quotes' });
                    if (deletePollTimerRef.current !== null) {
                      window.clearInterval(deletePollTimerRef.current);
                      deletePollTimerRef.current = null;
                    }
                    setIsDeleting(false);
                    return;
                  }

                  const pollStatus = pollRes.data?.status;
                  if (pollStatus === 'processing') return;

                  if (pollStatus === 'processed') {
                    const deleted = pollRes.data?.deleted ?? 0;
                    message.success({ content: pollRes.message || `已清空：删除 ${deleted} 条`, key: 'delete-quotes' });
                    if (deletePollTimerRef.current !== null) {
                      window.clearInterval(deletePollTimerRef.current);
                      deletePollTimerRef.current = null;
                    }
                    setSelectedRowKeys([]);
                    setIsDeleting(false);
                    void fetchQuotes(pagination.current, pagination.pageSize);
                    return;
                  }

                  message.error({ content: pollRes.message || '删除失败', key: 'delete-quotes' });
                  if (deletePollTimerRef.current !== null) {
                    window.clearInterval(deletePollTimerRef.current);
                    deletePollTimerRef.current = null;
                  }
                  setIsDeleting(false);
                } catch (err) {
                  message.error({ content: getApiErrorMessage(err, '删除失败'), key: 'delete-quotes' });
                  if (deletePollTimerRef.current !== null) {
                    window.clearInterval(deletePollTimerRef.current);
                    deletePollTimerRef.current = null;
                  }
                  setIsDeleting(false);
                }
              }, 2000);
              return;
            }

            const deletedCount = res.data?.deleted ?? 0;
            message.success(res.message || `成功删除 ${deletedCount} 条数据`);
            
            // 乐观更新：从当前显示的数据中移除已删除的代码
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

    setIsCrawlingAll(true);
    try {
      const res = await api.post<ApiResponse<{ status: string; taskId: string }>>('/admin/sync-all-quotes');
      if (res.success && res.data?.taskId) {
        const taskId = res.data.taskId;
        message.loading({ content: '全量同步进行中，可能需要几分钟...', key: 'sync-all', duration: 0 });
        
        // 开始轮询状态
        const timer = window.setInterval(async () => {
          try {
            const pollRes = await api.get<ApiResponse<{ status: string; result?: SyncResultPayload }>>(`/admin/sync-all-quotes/status/${taskId}`);
            if (!pollRes.success) {
              message.error({ content: pollRes.message || '全量同步失败', key: 'sync-all' });
              window.clearInterval(timer);
              setIsCrawlingAll(false);
              return;
            }

            if (pollRes.data?.status === 'processed') {
              const processed = pollRes.data.result?.processed ?? 0;
              message.success({ content: `全量同步完成：写入 ${processed} 条`, key: 'sync-all' });
              window.clearInterval(timer);
              setIsCrawlingAll(false);
              void fetchQuotes(pagination.current, pagination.pageSize);
            } else if (pollRes.data?.status === 'failed') {
              message.error({ content: pollRes.message || '全量同步失败', key: 'sync-all' });
              window.clearInterval(timer);
              setIsCrawlingAll(false);
            }
          } catch (err) {
            message.error({ content: getApiErrorMessage(err, '查询同步状态失败'), key: 'sync-all' });
            window.clearInterval(timer);
            setIsCrawlingAll(false);
          }
        }, 5000);
      }
    } catch (err) {
      message.error(getApiErrorMessage(err, '启动全量同步失败'));
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
    if (uploadPollTimerRef.current !== null) {
      window.clearInterval(uploadPollTimerRef.current);
      uploadPollTimerRef.current = null;
    }
    try {
      const uploadId = uploadPreview.uploadId;
      const res = await api.post<ApiResponse<ConfirmUploadPayload>>('/admin/upload-quotes/confirm', {
        uploadId: uploadPreview.uploadId,
      });
      if (res.success) {
        const status = res.data?.status;
        if (status === 'processing') {
          message.loading({ content: res.message || '入库进行中…', key: 'upload-confirm', duration: 0 });
          uploadPollTimerRef.current = window.setInterval(async () => {
            try {
              const pollRes = await api.post<ApiResponse<ConfirmUploadPayload>>('/admin/upload-quotes/confirm', {
                uploadId,
              });
              if (!pollRes.success) {
                message.error({ content: pollRes.message || '入库失败', key: 'upload-confirm' });
                if (uploadPollTimerRef.current !== null) {
                  window.clearInterval(uploadPollTimerRef.current);
                  uploadPollTimerRef.current = null;
                }
                setIsConfirmingUpload(false);
                return;
              }

              const pollStatus = pollRes.data?.status;
              if (pollStatus === 'processing') return;

              if (pollStatus === 'processed') {
                const processed = pollRes.data?.processed ?? 0;
                message.success({ content: pollRes.message || `入库完成：写入 ${processed} 条`, key: 'upload-confirm' });
                if (uploadPollTimerRef.current !== null) {
                  window.clearInterval(uploadPollTimerRef.current);
                  uploadPollTimerRef.current = null;
                }
                setIsConfirmingUpload(false);
                setUploadModalOpen(false);
                setUploadPreview(null);
                void fetchQuotes(pagination.current, pagination.pageSize);
                return;
              }

              message.error({ content: pollRes.message || '入库失败', key: 'upload-confirm' });
              if (uploadPollTimerRef.current !== null) {
                window.clearInterval(uploadPollTimerRef.current);
                uploadPollTimerRef.current = null;
              }
              setIsConfirmingUpload(false);
            } catch (err) {
              message.error({ content: getApiErrorMessage(err, '入库失败'), key: 'upload-confirm' });
              if (uploadPollTimerRef.current !== null) {
                window.clearInterval(uploadPollTimerRef.current);
                uploadPollTimerRef.current = null;
              }
              setIsConfirmingUpload(false);
            }
          }, 2000);
          return;
        }

        const processed = res.data?.processed ?? 0;
        message.success({ content: res.message || `入库完成：写入 ${processed} 条`, key: 'upload-confirm' });
        setUploadModalOpen(false);
        setUploadPreview(null);
        void fetchQuotes(pagination.current, pagination.pageSize);
        return;
      }
      message.error(res.message || '入库失败');
    } catch (err) {
      message.error(getApiErrorMessage(err, '入库失败'));
    } finally {
      if (uploadPollTimerRef.current === null) {
        setIsConfirmingUpload(false);
      }
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
          <Button icon={<ReloadOutlined />} onClick={() => fetchQuotes(pagination.current, pagination.pageSize)}>
            刷新
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
        title="文件预览"
        open={uploadModalOpen}
        onOk={confirmUpload}
        confirmLoading={isConfirmingUpload}
        onCancel={() => {
          if (uploadPollTimerRef.current !== null) {
            window.clearInterval(uploadPollTimerRef.current);
            uploadPollTimerRef.current = null;
            setIsConfirmingUpload(false);
            message.open({ type: 'info', content: '已关闭窗口，后台仍在入库', key: 'upload-confirm', duration: 2 });
          }
          setUploadModalOpen(false);
          setUploadPreview(null);
        }}
        okText="确认入库"
        cancelText="取消"
      >
        <div style={{ marginBottom: 12 }}>
          {uploadPreview ? `共识别 ${uploadPreview.total} 条，预览前 ${Math.min(uploadPreview.total, 20)} 条` : '暂无预览数据'}
        </div>
        <Table
          size="small"
          rowKey="_rowKey"
          columns={columns}
          dataSource={uploadPreview?.preview || []}
          pagination={false}
        />
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
    </Card>
  );
};

export default Quotes;
