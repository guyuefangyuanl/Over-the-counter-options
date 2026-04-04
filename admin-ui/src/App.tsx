import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ConfigProvider, App as AntApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import AdminLayout from './components/AdminLayout';
import AuthGuard from './components/AuthGuard';
import Dashboard from './pages/Dashboard';
import Quotes from './pages/Quotes';
import Inquiries from './pages/Inquiries';
import Orders from './pages/Orders';
import Login from './pages/Login';
import Users from './pages/Users';
import Settings from './pages/Settings';
import FeeList from './pages/FeeList';
import FeeStatistics from './pages/FeeStatistics';
import CustomerList from './pages/CustomerList';
import CustomerGroups from './pages/CustomerGroups';
import TradeOrders from './pages/TradeOrders';
import TradeInquiries from './pages/TradeInquiries';
import TradePositions from './pages/TradePositions';
import MessageList from './pages/MessageList';
import MessageTemplates from './pages/MessageTemplates';
import ConfigSystem from './pages/ConfigSystem';
import ConfigUsers from './pages/ConfigUsers';

// 主题配置
import { themeConfig } from './theme/themeConfig';

// 样式文件
import './theme/variables.css';
import './theme/admin-layout.css';
import './theme/table-override.css';

function App() {
  return (
    <ConfigProvider theme={themeConfig} locale={zhCN}>
      <AntApp>
        <BrowserRouter basename="/">
          <Routes>
            <Route path="login" element={<Login />} />
            <Route path="admin/login" element={<Login />} />
            <Route path="/" element={<AuthGuard><AdminLayout /></AuthGuard>}>
              <Route index element={<Dashboard />} />
              {/* 费用管理 */}
              <Route path="fee/list" element={<FeeList />} />
              <Route path="fee/statistics" element={<FeeStatistics />} />
              {/* 客户管理 */}
              <Route path="customer/list" element={<CustomerList />} />
              <Route path="customer/groups" element={<CustomerGroups />} />
              {/* 行情管理 */}
              <Route path="quotes" element={<Quotes />} />
              {/* 交易管理 */}
              <Route path="trade/orders" element={<TradeOrders />} />
              <Route path="trade/inquiries" element={<TradeInquiries />} />
              <Route path="trade/positions" element={<TradePositions />} />
              {/* 消息管理 */}
              <Route path="message/list" element={<MessageList />} />
              <Route path="message/templates" element={<MessageTemplates />} />
              {/* 配置管理 */}
              <Route path="config/system" element={<ConfigSystem />} />
              <Route path="config/users" element={<ConfigUsers />} />
              {/* 旧路由兼容 */}
              <Route path="inquiries" element={<Inquiries />} />
              <Route path="orders" element={<Orders />} />
              <Route path="users" element={<Users />} />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  );
}

export default App;