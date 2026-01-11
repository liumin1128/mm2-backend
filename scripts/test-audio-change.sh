#!/bin/bash

# 测试音频内容变化 - 对比不同输入的音频输出

BASE_URL="http://localhost:3000"

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}════════════════════════════════════════${NC}"
echo -e "${BLUE}  音频内容变化测试${NC}"
echo -e "${BLUE}════════════════════════════════════════${NC}"
echo ""

# 测试 1: 简短文案
echo -e "${CYAN}[测试 1] 简短文案${NC}"
INPUT_ID_1="short_$(date +%s)"
RESPONSE_1=$(curl -s -X POST "$BASE_URL/podcast/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "input_id": "'$INPUT_ID_1'",
    "action": 3,
    "nlp_texts": [
      {"speaker": "主持人", "text": "你好世界。"},
      {"speaker": "嘉宾", "text": "你好。"}
    ],
    "callback_url": "http://localhost:3000/callback"
  }')

TASK_ID_1=$(echo "$RESPONSE_1" | jq -r '.data.task_id' 2>/dev/null)
echo "Task ID: $TASK_ID_1"
echo ""

sleep 5

# 获取任务1的音频信息
STATUS_1=$(curl -s "$BASE_URL/podcast/status/$TASK_ID_1")
DURATION_1=$(echo "$STATUS_1" | jq -r '.data.subtitleManager.totalDuration' 2>/dev/null)
SUBTITLE_COUNT_1=$(echo "$STATUS_1" | jq -r '.data.subtitleManager.subtitles | length' 2>/dev/null)

echo "结果："
echo "  字幕数: $SUBTITLE_COUNT_1"
echo "  时长: $DURATION_1 秒"
echo ""

# 测试 2: 长文案
echo -e "${CYAN}[测试 2] 长文案${NC}"
INPUT_ID_2="long_$(date +%s)"
RESPONSE_2=$(curl -s -X POST "$BASE_URL/podcast/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "input_id": "'$INPUT_ID_2'",
    "action": 3,
    "nlp_texts": [
      {"speaker": "主持人", "text": "这是一个很长的句子，包含很多的信息和细节，用来测试音频生成是否会根据文本长度而改变。"},
      {"speaker": "嘉宾", "text": "我同意你的观点，这个测试很有意义，能够帮助我们理解音频生成系统是否真的在处理不同的输入内容。"}
    ],
    "callback_url": "http://localhost:3000/callback"
  }')

TASK_ID_2=$(echo "$RESPONSE_2" | jq -r '.data.task_id' 2>/dev/null)
echo "Task ID: $TASK_ID_2"
echo ""

sleep 5

# 获取任务2的音频信息
STATUS_2=$(curl -s "$BASE_URL/podcast/status/$TASK_ID_2")
DURATION_2=$(echo "$STATUS_2" | jq -r '.data.subtitleManager.totalDuration' 2>/dev/null)
SUBTITLE_COUNT_2=$(echo "$STATUS_2" | jq -r '.data.subtitleManager.subtitles | length' 2>/dev/null)

echo "结果："
echo "  字幕数: $SUBTITLE_COUNT_2"
echo "  时长: $DURATION_2 秒"
echo ""

# 对比
echo -e "${BLUE}════════════════════════════════════════${NC}"
echo -e "${BLUE}对比结果${NC}"
echo -e "${BLUE}════════════════════════════════════════${NC}"
echo ""
echo "测试 1 (短文案):"
echo "  Task: $TASK_ID_1"
echo "  Input: $INPUT_ID_1"
echo "  字幕数: $SUBTITLE_COUNT_1"
echo "  时长: $DURATION_1"
echo ""
echo "测试 2 (长文案):"
echo "  Task: $TASK_ID_2"
echo "  Input: $INPUT_ID_2"
echo "  字幕数: $SUBTITLE_COUNT_2"
echo "  时长: $DURATION_2"
echo ""

if [ "$DURATION_1" = "$DURATION_2" ]; then
  echo -e "${RED}⚠️  问题：两个任务的时长相同！${NC}"
  echo "这表明音频生成可能没有根据文本内容变化"
else
  echo -e "${GREEN}✅ 音频时长不同，说明系统有响应不同的输入${NC}"
fi

echo ""
echo -e "详细对比："
echo -e "  短文案字幕数: $SUBTITLE_COUNT_1, 时长: ${DURATION_1}s"
echo -e "  长文案字幕数: $SUBTITLE_COUNT_2, 时长: ${DURATION_2}s"
echo -e "  时长差异: $(echo "$DURATION_2 - $DURATION_1" | bc) 秒"
