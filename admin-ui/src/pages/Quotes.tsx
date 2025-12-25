import React, { useCallback, useEffect, useRef, useState } from 'react';
import { App, Table, Button, Upload, Card, Space, Typography, type UploadProps } from 'antd';
import { UploadOutlined, ReloadOutlined } from '@ant-design/icons';
import api, { getApiErrorMessage, type ApiResponse } from '../utils/api';
import type { ColumnsType } from 'antd/es/table';
import PageState from '../components/PageState';

const { Title } = Typography;

interface Quote {
  stock_code: string;
  name: string;
  price: number;
  changePercent?: number;
  updated_at?: string;
}

type PaginatedPayload<T> = {
  items: T[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    pages: number;
  };
};

const Quotes: React.FC = () => {
  const { message } = App.useApp();
  const [isFetching, setIsFetching] = useState(false);
  const [isCrawling, setIsCrawling] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [data, setData] = useState<Quote[]>([]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const crawlAbortRef = useRef<AbortController | null>(null);

  const fetchQuotes = useCallback(async (page = 1, pageSize = 10) => {
    setIsFetching(true);
    setError(null);
    try {
      const res = await api.get<ApiResponse<PaginatedPayload<Quote>>>('/admin/quotes', {
        params: { page, pageSize },
      });
      if (res.success && res.data?.pagination && Array.isArray(res.data.items)) {
        setData(res.data.items);
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
      title: '最新价',
      dataIndex: 'price',
      key: 'price',
      render: (val) => val?.toFixed(2),
    },
    {
      title: '涨跌幅',
      dataIndex: 'changePercent',
      key: 'changePercent',
      render: (val) =>
        typeof val === 'number' ? (
          <span style={{ color: val > 0 ? '#cf1322' : '#3f8600' }}>
            {val > 0 ? '+' : ''}{val.toFixed(2)}%
          </span>
        ) : '-',
    },
    {
      title: '更新时间',
      dataIndex: 'updated_at',
      key: 'updated_at',
      render: (val) => val ? new Date(val).toLocaleString() : '-',
    },
  ];

  const handleCrawl = useCallback(async (event?: React.MouseEvent<HTMLElement>) => {
    event?.preventDefault();
    event?.stopPropagation();

    if (isCrawling) return;

    const abortController = new AbortController();
    crawlAbortRef.current?.abort();
    crawlAbortRef.current = abortController;

    setIsCrawling(true);
    try {
      const res = await api.post<ApiResponse<unknown>>('/admin/crawl-quotes', undefined, {
        signal: abortController.signal,
      });
      if (res.success) {
        message.success(res.message || '同步成功');
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

  const handleUpload: UploadProps['onChange'] = (info) => {
    if (info.file.status === 'uploading') {
      setIsUploading(true);
      return;
    }
    if (info.file.status === 'done') {
      setIsUploading(false);
      const res = info.file.response as ApiResponse<unknown> | undefined;
      if (res?.success) {
        message.success(res.message || '上传成功');
        void fetchQuotes(pagination.current, pagination.pageSize);
      } else {
        message.error(res?.message || '上传失败');
      }
    } else if (info.file.status === 'error') {
      message.error(`${info.file.name} 上传失败`);
      setIsUploading(false);
    }
  };

  const tableLoading = isFetching || isCrawling || isUploading;

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4}>行情管理</Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => fetchQuotes(pagination.current, pagination.pageSize)}>
            刷新
          </Button>
          <Button 
            type="primary" 
            icon={<ReloadOutlined />} 
            onClick={handleCrawl}
            loading={isCrawling}
            disabled={isCrawling}
          >
            从新浪同步最新行情
          </Button>
          <Upload
            name="file"
            action="/api/v1/admin/upload-quotes"
            showUploadList={false}
            onChange={handleUpload}
            accept=".xlsx,.xls,.csv"
          >
            <Button icon={<UploadOutlined />}>上传本地文件</Button>
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
          rowKey="stock_code"
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
    </Card>
  );
};

export default Quotes;
