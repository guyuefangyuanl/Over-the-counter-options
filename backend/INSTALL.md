# 安装指南

## 环境要求

- Node.js v12.0 或更高版本
- npm v6.0 或更高版本

## 安装 Node.js

### Windows 系统

1. 访问 [Node.js 官方网站](https://nodejs.org/zh-cn/)
2. 下载 LTS 版本（长期支持版本）
3. 运行安装程序，按照提示完成安装
4. 安装完成后，打开新的命令提示符窗口，验证安装：
   ```bash
   node --version
   npm --version
   ```

### macOS 系统

使用 Homebrew 安装：
```bash
brew install node
```

或者从官网下载安装。

### Linux 系统 (Ubuntu/Debian)

```bash
# 使用 apt 安装
sudo apt update
sudo apt install nodejs npm

# 或使用 NodeSource 仓库安装最新版本
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs
```

## 安装项目依赖

1. 打开命令提示符或终端
2. 进入项目 backend 目录：
   ```bash
   cd backend
   ```
3. 安装依赖：
   ```bash
   npm install
   ```

## 安装过程中可能遇到的问题

### 1. 权限问题 (Linux/macOS)
如果遇到权限错误，可以使用以下命令：
```bash
sudo npm install
```

或者配置 npm 使用不同的目录：
```bash
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
export PATH=~/.npm-global/bin:$PATH
```

### 2. 网络问题
如果下载依赖包时速度很慢，可以配置 npm 使用国内镜像：
```bash
npm config set registry https://registry.npmmirror.com
```

### 3. better-sqlite3 编译问题
如果 better-sqlite3 安装失败，可能需要安装构建工具：

**Windows:**
```bash
npm install -g windows-build-tools
```

**macOS:**
```bash
xcode-select --install
```

**Linux:**
```bash
sudo apt install build-essential
```

## 验证安装

安装完成后，可以通过以下命令验证：

```bash
# 检查 Node.js 版本
node --version

# 检查 npm 版本
npm --version

# 列出项目依赖
npm list
```

## 启动服务器

安装完成后，可以使用以下命令启动服务器：

```bash
# 开发模式启动
npm run dev

# 生产模式启动
npm start
```

## 故障排除

### 如果仍然提示找不到 npm 命令

1. 确认 Node.js 是否正确安装
2. 检查环境变量是否配置正确
3. 重启命令行工具或计算机
4. 如果使用的是 nvm 管理 Node.js 版本，请确保已启用一个版本：
   ```bash
   nvm list
   nvm use [version]
   ```