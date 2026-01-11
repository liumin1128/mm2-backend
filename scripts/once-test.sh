#!/bin/bash

# 单次执行脚本 - 不循环，直接显示结果

BASE_URL="http://localhost:3000"

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${BLUE}════════════════════════════════════════${NC}"
echo -e "${BLUE}  播客服务 - 单次执行测试${NC}"
echo -e "${BLUE}════════════════════════════════════════${NC}"
echo ""

# 1. 创建任务
echo -e "${BLUE}[1/3] 创建播客任务...${NC}"

INPUT_ID="test_$(date +%s)"
RESPONSE=$(curl -s -X POST "$BASE_URL/podcast/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "input_id": "'$INPUT_ID'",
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
  exit 1
fi

echo -e "${GREEN}✅ 任务创建成功${NC}"
echo "Task ID: $TASK_ID"
echo "Input ID: $INPUT_ID"
echo ""

# 2. 等待任务处理
echo -e "${BLUE}[2/3] 等待任务处理（5 秒）...${NC}"
sleep 5

# 3. 查询最终状态
echo -e "${BLUE}[3/3] 查询任务状态...${NC}"
STATUS=$(curl -s "$BASE_URL/podcast/status/$TASK_ID")

TASK_STATUS=$(echo "$STATUS" | jq -r '.data.status' 2>/dev/null)
SUBTITLE_COUNT=$(echo "$STATUS" | jq -r '.data.subtitleManager.subtitles | length' 2>/dev/null)
TOTAL_DURATION=$(echo "$STATUS" | jq -r '.data.subtitleManager.totalDuration' 2>/dev/null)

echo ""
echo -e "${CYAN}字幕信息：${NC}"
echo "$STATUS" | jq '.data.subtitleManager.subtitles[] | {index: .index, startTime: .startTime, endTime: .endTime, speaker: .speaker, text: .text}' 2>/dev/null | head -60

echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "任务状态: $TASK_STATUS"
echo -e "字幕数量: $SUBTITLE_COUNT"
echo -e "总时长: $TOTAL_DURATION 秒"
echo -e "${GREEN}════════════════════════════════════════${NC}"
