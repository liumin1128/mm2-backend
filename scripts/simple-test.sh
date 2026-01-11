#!/bin/bash

# 简单单次测试脚本 - 只运行一次，验证基本功能

set -e

BASE_URL="http://localhost:3000"

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}════════════════════════════════════════${NC}"
echo -e "${BLUE}     播客服务 - 简单功能测试${NC}"
echo -e "${BLUE}════════════════════════════════════════${NC}"
echo ""

# 1. 创建任务
echo -e "${BLUE}[1/2] 创建播客任务...${NC}"
RESPONSE=$(curl -s -X POST "$BASE_URL/podcast/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "input_id": "simple_test_'$(date +%s)'",
    "action": 3,
    "nlp_texts": [
      {"speaker": "主持人", "text": "欢迎收听本期节目。"},
      {"speaker": "嘉宾", "text": "感谢邀请，很高兴参与。"}
    ],
    "callback_url": "http://localhost:3000/callback"
  }')

TASK_ID=$(echo "$RESPONSE" | jq -r '.data.task_id' 2>/dev/null)

if [ "$TASK_ID" = "null" ] || [ -z "$TASK_ID" ]; then
  echo -e "${RED}❌ 任务创建失败${NC}"
  echo "Response: $RESPONSE"
  exit 1
fi

echo -e "${GREEN}✅ 任务创建成功${NC}"
echo "Task ID: $TASK_ID"
echo ""

# 2. 查询任务状态
echo -e "${BLUE}[2/2] 查询任务状态...${NC}"
sleep 2

STATUS=$(curl -s "$BASE_URL/podcast/status/$TASK_ID")

if echo "$STATUS" | jq -e '.data' > /dev/null 2>&1; then
  echo -e "${GREEN}✅ 状态查询成功${NC}"
  
  SUBTITLE_COUNT=$(echo "$STATUS" | jq '.data.subtitleManager.subtitles | length' 2>/dev/null)
  DURATION=$(echo "$STATUS" | jq '.data.subtitleManager.totalDuration' 2>/dev/null)
  
  echo "字幕数量: $SUBTITLE_COUNT"
  echo "总时长: $DURATION 秒"
  echo ""
  echo -e "${GREEN}✅ 功能验证完成！${NC}"
  exit 0
else
  echo -e "${RED}❌ 状态查询失败${NC}"
  exit 1
fi
