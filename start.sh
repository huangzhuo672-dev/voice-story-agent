#!/bin/bash
# 声音克隆睡前故事智能体 - 一键启动脚本

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
PYTHON="C:/Users/Admin/.workbuddy/binaries/python/versions/3.13.12/python.exe"
VENV_PYTHON="C:/Users/Admin/.workbuddy/binaries/python/envs/storytime/Scripts/python.exe"

echo "🌙 声音克隆睡前故事智能体启动中..."
echo ""

# 检查 .env 文件
if [ ! -f "$BACKEND_DIR/.env" ]; then
  if [ -f "$BACKEND_DIR/.env.example" ]; then
    cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
    echo "⚠️  已创建 .env 文件，请先填写 DASHSCOPE_API_KEY 再重新运行！"
    echo "   文件位置：$BACKEND_DIR/.env"
    echo ""
    echo "   获取 API Key：https://dashscope.aliyun.com"
    exit 1
  fi
fi

# 检查 API Key
source "$BACKEND_DIR/.env" 2>/dev/null || true
if [ -z "$DASHSCOPE_API_KEY" ] || [ "$DASHSCOPE_API_KEY" = "your_dashscope_api_key_here" ]; then
  echo "❌ 请在 backend/.env 中设置 DASHSCOPE_API_KEY"
  echo "   获取地址：https://dashscope.aliyun.com"
  exit 1
fi

# 安装依赖
echo "📦 检查依赖..."
"$PYTHON" -m venv "C:/Users/Admin/.workbuddy/binaries/python/envs/storytime" 2>/dev/null || true
"$VENV_PYTHON" -m pip install -r "$BACKEND_DIR/requirements.txt" -q

echo "✅ 依赖就绪"
echo ""
echo "🚀 启动后端服务 (http://localhost:5000)..."
echo "   前端页面：打开 frontend/index.html"
echo "   按 Ctrl+C 停止"
echo ""

cd "$BACKEND_DIR"
"$VENV_PYTHON" app.py
