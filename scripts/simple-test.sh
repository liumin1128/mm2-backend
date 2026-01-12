#!/bin/bash

# 简单单次测试脚本 - 只运行一次，验证基本功能

set -e

BASE_URL="http://localhost:3000"

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

printf "${BLUE}════════════════════════════════════════${NC}\n"
printf "${BLUE}     播客服务 - 简单功能测试${NC}\n"
printf "${BLUE}════════════════════════════════════════${NC}\n"
echo ""

# 1. 创建任务
printf "${BLUE}[1/2] 创建播客任务...${NC}\n"

# 构建请求数据 - 使用action=3直接传入对话文本
REQUEST_DATA='{
  "action": 3,
  "nlp_texts": [
    {
      "text": "(窗外传来淅淅沥沥的雨声) 唉，这雨下得，让人想起十年前的那个夜晚。",
      "speaker": "zh_male_dayixiansheng_v2_saturn_bigtts"
    },
    {
      "text": "可不是嘛老杨，我刚加完班，看着这雨，突然就想起了MH370。你说这都十年了，重启调查的消息一出，我朋友圈都炸了。",
      "speaker": "zh_female_mizaitongxue_v2_saturn_bigtts"
    },
    {
      "text": "欢迎来到《天涯神贴系列》，我是老杨，我是小李。在这里，我们挖坟神贴，复盘那些被时光掩盖的真相。",
      "speaker": "zh_male_dayixiansheng_v2_saturn_bigtts"
    },
    {
      "text": "今天我们要聊的，就是那个让全世界都睡不着觉的谜案——马航MH370。老杨，我记得当年天涯上有个神贴，简直预言家附体啊！",
      "speaker": "zh_female_mizaitongxue_v2_saturn_bigtts"
    }
  ],
  "speaker_info": {
    "random_order": false
  },
  "audio_config": {
    "format": "mp3",
    "sample_rate": 24000
  },
  "use_head_music": false,
  "use_tail_music": false,
  "callback_url": "http://localhost:3000/podcast/callback-test",
  "debug_mode": true
}'

RESPONSE=$(curl -s -X POST "$BASE_URL/podcast/generate" \
  -H "Content-Type: application/json" \
  -d "$REQUEST_DATA")

TASK_ID=$(echo "$RESPONSE" | jq -r '.data.task_id' 2>/dev/null)

if [ "$TASK_ID" = "null" ] || [ -z "$TASK_ID" ]; then
  printf "${RED}❌ 任务创建失败${NC}\n"
  echo "Response: $RESPONSE"
  exit 1
fi

printf "${GREEN}✅ 任务创建成功${NC}\n"
echo "Task ID: $TASK_ID"
echo ""

# 2. 查询任务状态
printf "${BLUE}[2/2] 查询任务状态...${NC}\n"
sleep 2

STATUS=$(curl -s "$BASE_URL/podcast/status/$TASK_ID")

if echo "$STATUS" | jq -e '.data' > /dev/null 2>&1; then
  printf "${GREEN}✅ 状态查询成功${NC}\n"
  
  SUBTITLE_COUNT=$(echo "$STATUS" | jq '.data.subtitleManager.subtitles | length' 2>/dev/null)
  DURATION=$(echo "$STATUS" | jq '.data.subtitleManager.totalDuration' 2>/dev/null)
  
  echo "字幕数量: $SUBTITLE_COUNT"
  echo "总时长: $DURATION 秒"
  echo ""
  printf "${GREEN}✅ 功能验证完成！${NC}\n"
  exit 0
else
  printf "${RED}❌ 状态查询失败${NC}\n"
  exit 1
fi
