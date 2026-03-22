import React, { useCallback, useEffect, useState } from 'react';
import { 
  App, 
  Table, 
  Button, 
  Card, 
  Typography, 
  Tag, 
  Space, 
  Input, 
  Select, 
  DatePicker, 
  Statistic, 
  Row, 
  Col,
  Badge
} from 'antd';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import api, { getApiErrorMessage, type ApiResponse } from '../utils/api';
import type { ColumnsType } from 'antd/es/table';
import PageState from '../components/PageState';
import dayjs from 'dayjs';

const { Text } = Typography;
const { RangePicker } = DatePicker;

interface QuoteHistory {
  _id: string;
  stock_code: string;
  code: string;
  name: string;
  price?: number;
  rate?: number;
  type?: string;
  term?: string;
  trader?: string;
  changePercent?: number;
  createdAt: string;
  updatedAt: string;
  version?: number;
  isLatest?: boolean;
}

interface PaginatedPayload<T> {
  items: T[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
  };
}

interface QuoteStats {
  total: number;
  todayCount: number;
  uniqueCodes: number;
  avgRate: number;
}

const QuotesHistory: React.FC = () => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<QuoteHistory[]>([]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [error, setError] = useState<string | null>(null);
  
  // 筛选条件
  const [keyword, setKeyword] = useState('');
  const [codeFilter, setCodeFilter] = useState<string | undefined>();
  const [typeFilter, setTypeFilter] = useState<string | undefined>();
  const [termFilter, setTermFilter] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  
  // 统计数据
  const [stats, setStats] = useState<QuoteStats | null>(null);

  const fetchQuotesHistory = useCallback(async (page = 1, pageSize = 20) => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, unknown> = { page, pageSize };
      
      if (keyword) params.keyword = keyword;
      if (codeFilter) params.code = codeFilter;
      if (typeFilter) params.type = typeFilter;
      if (termFilter) params.term = termFilter;
      if (dateRange) {
        params.startDate = dateRange[0].format('YYYY-MM-DD');
        params.endDate = dateRange[1].format('YYYY-MM-DD');
      }

      const res = await api.get<ApiResponse<PaginatedPayload<QuoteHistory>>>('/admin/quotes', {
        params,
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
      const msg = getApiErrorMessage(err, '获取历史行情失败');
      setError(msg);
      message.error(msg);
    } finally {
      setLoading(false);
    }
  }, [keyword, codeFilter, typeFilter, termFilter, dateRange, message]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get<ApiResponse<QuoteStats>>('/admin/quotes/stats');
      if (res.success && res.data) {
        setStats(res.data);
      }
    } catch (err) {
      console.error('获取统计失败:', err);
    }
  }, []);

  useEffect(() => {
    void fetchQuotesHistory();
    void fetchStats();
  }, [fetchQuotesHistory, fetchStats]);

  const handleSearch = () => {
    void fetchQuotesHistory(1, pagination.pageSize);
  };

  const handleReset = () => {
    setKeyword('');
    setCodeFilter(undefined);
    setTypeFilter(undefined);
    setTermFilter(undefined);
    setDateRange(null);
    void fetchQuotesHistory(1, pagination.pageSize);
  };

  const columns: ColumnsType<QuoteHistory> = [
    {
      title: '标的代码',
      dataIndex: 'stock_code',
      key: 'stock_code',
      width: 120,
      fixed: 'left',
      render: (val, record) => (
        <div>
          <Text strong>{val || record.code}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>{record.name}</Text>
        </div>
      ),
    },
    {
      title: '期权类型',
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (type) => {
        const typeMap: Record<string, { color: string; label: string }> = {
          call: { color: 'green', label: '看涨' },
          put: { color: 'red', label: '看跌' },
        };
        const config = typeMap[type] || { color: 'default', label: type || '-' };
        return <Tag color={config.color}>{config.label}</Tag>;
      },
    },
    {
      title: '期限',
      dataIndex: 'term',
      key: 'term',
      width: 100,
      render: (term) => term || '-',
    },
    {
      title: '价格',
      dataIndex: 'price',
      key: 'price',
      width: 100,
      align: 'right',
      render: (val) => val ? `¥${Number(val).toFixed(3)}` : '-',
    },
    {
      title: '费率',
      dataIndex: 'rate',
      key: 'rate',
      width: 100,
      align: 'right',
      render: (val) => {
        if (val === undefined || val === null) return '-';
        const ratePercent = Number(val) * 100;
        const color = ratePercent > 0 ? 'green' : ratePercent < 0 ? 'red' : undefined;
        return <Text type={color as 'success' | 'danger' | undefined}>{ratePercent.toFixed(2)}%</Text>;
      },
    },
    {
      title: '涨跌幅',
      dataIndex: 'changePercent',
      key: 'changePercent',
      width: 100,
      align: 'right',
      render: (val) => {
        if (val === undefined || val === null) return '-';
        const color = val > 0 ? 'success' : val < 0 ? 'danger' : undefined;
        return (
          <Text type={color}>
            {val > 0 ? '+' : ''}{Number(val).toFixed(2)}%
          </Text>
        );
      },
    },
    {
      title: '交易商',
      dataIndex: 'trader',
      key: 'trader',
      width: 100,
      render: (val) => val || '-',
    },
    {
      title: '版本',
      dataIndex: 'version',
      key: 'version',
      width: 80,
      render: (ver, record) => (
        record.isLatest 
          ? <Badge status="success" text="最新" />
          : <Text type="secondary">v{ver || 1}</Text>
      ),
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 160,
      render: (val) => val ? new Date(val).toLocaleString() : '-',
    },
  ];

  return (
    <Card>
      <div style={{ marginBottom: 24 }}>
        <Row gutter={16}>
          <Col span={6}>
            <Statistic 
              title="总记录数" 
              value={stats?.total || pagination.total} 
              suffix="条"
            />
          </Col>
          <Col span={6}>
            <Statistic 
              title="今日更新" 
              value={stats?.todayCount || 0} 
              suffix="条"
              valueStyle={{ color: '#3f8600' }}
            />
          </Col>
          <Col span={6}>
            <Statistic 
              title="标的数量" 
              value={stats?.uniqueCodes || 0} 
              suffix="个"
            />
          </Col>
          <Col span={6}>
            <Statistic 
              title="平均费率" 
              value={(stats?.avgRate || 0) * 100} 
              precision={2}
              suffix="%"
            />
          </Col>
        </Row>
      </div>

      <div style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>
        <div>
          <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>搜索</Text>
          <Input.Search
            placeholder="代码或名称"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onSearch={handleSearch}
            style={{ width: 160 }}
            allowClear
          />
        </div>
        <div>
          <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>期权类型</Text>
          <Select
            placeholder="类型"
            style={{ width: 100 }}
            value={typeFilter}
            onChange={(val) => setTypeFilter(val)}
            allowClear
          >
            <Select.Option value="call">看涨</Select.Option>
            <Select.Option value="put">看跌</Select.Option>
          </Select>
        </div>
        <div>
          <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>期限</Text>
          <Select
            placeholder="期限"
            style={{ width: 100 }}
            value={termFilter}
            onChange={(val) => setTermFilter(val)}
            allowClear
          >
            <Select.Option value="1M">1个月</Select.Option>
            <Select.Option value="2M">2个月</Select.Option>
            <Select.Option value="3M">3个月</Select.Option>
            <Select.Option value="6M">6个月</Select.Option>
            <Select.Option value="1Y">1年</Select.Option>
          </Select>
        </div>
        <div>
          <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>日期范围</Text>
          <RangePicker
            value={dateRange}
            onChange={(dates) => setDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs] | null)}
            style={{ width: 240 }}
          />
        </div>
        <Space>
          <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
            查询
          </Button>
          <Button onClick={handleReset}>
            重置
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => fetchQuotesHistory(pagination.current, pagination.pageSize)}>
            刷新
          </Button>
        </Space>
      </div>

      <PageState
        loading={loading}
        error={error}
        empty={!loading && !error && data.length === 0}
        onRetry={() => fetchQuotesHistory(pagination.current, pagination.pageSize)}
      >
        <Table
          columns={columns}
          dataSource={data}
          rowKey={(record) => record._id || `${record.code}-${record.updatedAt}`}
          scroll={{ x: 1200 }}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条`,
            onChange: (page, pageSize) => {
              setPagination((prev) => ({ ...prev, current: page, pageSize }));
              void fetchQuotesHistory(page, pageSize);
            },
          }}
        />
      </PageState>
    </Card>
  );
};

export default QuotesHistory;