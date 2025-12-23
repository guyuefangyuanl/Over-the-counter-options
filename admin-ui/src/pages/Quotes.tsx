import React, { useState, useEffect } from 'react';
import { Table, Button, Upload, message, Card, Space, Typography } from 'antd';
import { UploadOutlined, ReloadOutlined } from '@ant-design/icons';
import api from '../utils/api';
import type { ColumnsType } from 'antd/es/table';

const { Title } = Typography;

interface Quote {
  stock_code: string;
  name: string;
  price: number;
  changePercent?: number;
  updated_at?: string;
}

const Quotes: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Quote[]>([]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });

  const fetchQuotes = async (page = 1, pageSize = 10) => {
    setLoading(true);
    try {
      const res: any = await api.get('/admin/quotes', {
        params: { page, pageSize },
      });
      if (res.success) {
        setData(res.data);
      }
    } catch (error) {
      message.error('获取报价列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuotes();
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
      render: (val) => (
        <span style={{ color: val > 0 ? '#cf1322' : '#3f8600' }}>
          {val > 0 ? '+' : ''}{val?.toFixed(2)}%
        </span>
      ),
    },
    {
      title: '更新时间',
      dataIndex: 'updated_at',
      key: 'updated_at',
      render: (val) => val ? new Date(val).toLocaleString() : '-',
    },
  ];

  const handleCrawl = async () => {
    setLoading(true);
    try {
      const res: any = await api.post('/admin/crawl-quotes');
      if (res.success) {
        message.success(res.message);
        fetchQuotes();
      }
    } catch (error) {
      message.error('同步数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = (info: any) => {
    if (info.file.status === 'uploading') {
      setLoading(true);
      return;
    }
    if (info.file.status === 'done') {
      setLoading(false);
      const res = info.file.response;
      if (res.success) {
        message.success(res.message || '上传成功');
        fetchQuotes();
      } else {
        message.error(res.message || '上传失败');
      }
    } else if (info.file.status === 'error') {
      message.error(`${info.file.name} 上传失败`);
      setLoading(false);
    }
  };

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4}>行情管理</Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => fetchQuotes()}>
            刷新
          </Button>
          <Button 
            type="primary" 
            icon={<ReloadOutlined />} 
            onClick={handleCrawl}
            loading={loading}
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
      <Table
        columns={columns}
        dataSource={data}
        rowKey="stock_code"
        loading={loading}
        pagination={{
          ...pagination,
          onChange: (page, pageSize) => {
            setPagination({ current: page, pageSize });
            fetchQuotes(page, pageSize);
          },
        }}
      />
    </Card>
  );
};

export default Quotes;
