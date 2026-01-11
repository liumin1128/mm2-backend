#!/bin/bash

# 完整流程脚本 - 创建任务并实时监控进度

set -e

BASE_URL="http://localhost:3000"
MONITOR_INTERVAL=2

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}════════════════════════════════════════${NC}"
echo -e "${BLUE}  播客服务 - 完整流程测试${NC}"
echo -e "${BLUE}════════════════════════════════════════${NC}"
echo ""

# 1. 创建任务
echo -e "${BLUE}[1/2] 创建播客任务...${NC}"
echo "---"

INPUT_ID="test_$(date +%s)"
RESPONSE=$(curl -s -X POST "$BASE_URL/podcast/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "input_id": "'$INPUT_ID'",
    "action": 3,
    "nlp_texts": [
      {
        "text": "(窗外传来淅淅沥沥的雨声) 唉，这雨下得，让人想起十年前的那个夜晚。",
        "speaker": "老杨"
      },
      {
        "text": "可不是嘛老杨，我刚加完班，看着这雨，突然就想起了MH370。你说这都十年了，重启调查的消息一出，我朋友圈都炸了。",
        "speaker": "小李"
      },
      {
        "text": "欢迎来到《天涯神贴系列》，我是老杨，我是小李。在这里，我们挖坟神贴，复盘那些被时光掩盖的真相。",
        "speaker": "老杨"
      },
      {
        "text": "今天我们要聊的，就是那个让全世界都睡不着觉的谜案——马航MH370。老杨，我记得当年天涯上有个神贴，简直预言家附体啊！",
        "speaker": "小李"
      },
      {
        "text": "(端起茶杯喝了一口) 是啊，那个ID叫国道G107的帖子，当年在天涯可是掀起了惊涛骇浪。他发帖的时间点，就在飞机失联的第二天，所有人都还在南中国海找呢。",
        "speaker": "老杨"
      },
      {
        "text": "他上来就说\"别找了，飞机根本不在那里\"，这也太敢说了吧？",
        "speaker": "小李"
      },
      {
        "text": "(老杨笑了起来) 当时大家都觉得这人疯了。但一个星期后，马来西亚官方公布卫星数据，说飞机通信系统是人为关闭的，还飞了七个小时——这跟国道大神的说法几乎一字不差。",
        "speaker": "老杨"
      },
      {
        "text": "我去！这也太准了吧？那后来呢？他到底还说了什么？",
        "speaker": "小李"
      },
      {
        "text": "这才是最让人脊背发凉的地方。国道大神在帖子里给出了一个具体的答案——劫持者的目标，是飞机上的人和物。",
        "speaker": "老杨"
      },
      {
        "text": "等等，不为钱不为恐袭，那图什么啊？",
        "speaker": "小李"
      },
      {
        "text": "他指向了一家美国公司——菲斯卡尔半导体。飞机上有20名这家公司的员工，其中12名马来西亚人，8名中国人。更关键的是，失联前几天，一项重要专利刚刚获批。",
        "speaker": "老杨"
      },
      {
        "text": "专利？这跟飞机失联有什么关系？",
        "speaker": "小李"
      },
      {
        "text": "这项专利编号US8671381B，是关于芯片堆叠的新技术，据说对军事科技有颠覆性意义。发明人有五位，其中四位就是搭乘MH370的中国籍工程师。",
        "speaker": "老杨"
      },
      {
        "text": "我的天...那专利法是怎么规定的？",
        "speaker": "小李"
      },
      {
        "text": "(放下茶杯) 根据专利法，如果共有人去世，专利所有权会自动转移给剩下的共有人。所以国道大神推测，这是一场定点清除，目的就是为了获得专利的完全控制权。",
        "speaker": "老杨"
      },
      {
        "text": "这也太黑暗了吧！那飞机到底去哪了？官方不是说在南印度洋吗？",
        "speaker": "小李"
      },
      {
        "text": "国道大神给出了一个截然不同的答案——迪戈加西亚。那是印度洋上的美军基地，有3600米跑道，足以起降波音777。",
        "speaker": "老杨"
      },
      {
        "text": "迪戈加西亚？我查过，那地方确实是个军事禁区，外界根本进不去。但有什么证据吗？",
        "speaker": "小李"
      },
      {
        "text": "有几个耐人寻味的线索。第一，家属在失联后几个小时还能打通亲人手机，说明手机可能在地面基站范围内。第二，马尔代夫居民目击到低空飞行的巨大飞机。",
        "speaker": "老杨"
      },
      {
        "text": "等等，我记得还有个石油工人的目击证词？",
        "speaker": "小李"
      },
      {
        "text": "对，麦克麦凯，他在越南附近的钻井平台工作，声称看到一架燃烧的飞机从高空掠过。但这些证词当时都被忽略了。",
        "speaker": "老杨"
      }
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
echo -e "  Task ID: $TASK_ID"
echo -e "  Input ID: $INPUT_ID"
echo ""

# 2. 实时监控任务进度
echo -e "${BLUE}[2/2] 监控任务进度（每 $MONITOR_INTERVAL 秒更新）...${NC}"
echo "---"
echo ""

COUNTER=0
while true; do
  COUNTER=$((COUNTER + 1))
  
  # 查询任务状态
  STATUS=$(curl -s "$BASE_URL/podcast/status/$TASK_ID" 2>/dev/null)
  
  if [ -z "$STATUS" ]; then
    echo -e "${RED}[$(date '+%H:%M:%S')] ❌ 无法连接到服务器${NC}"
    sleep "$MONITOR_INTERVAL"
    continue
  fi
  
  # 提取任务信息
  TASK_STATUS=$(echo "$STATUS" | jq -r '.data.status' 2>/dev/null)
  CURRENT_ROUND=$(echo "$STATUS" | jq -r '.data.currentRound' 2>/dev/null)
  TOTAL_DURATION=$(echo "$STATUS" | jq -r '.data.subtitleManager.totalDuration' 2>/dev/null)
  SUBTITLE_COUNT=$(echo "$STATUS" | jq -r '.data.subtitleManager.subtitles | length' 2>/dev/null)
  RETRY_COUNT=$(echo "$STATUS" | jq -r '.data.retryCount' 2>/dev/null)
  ERROR=$(echo "$STATUS" | jq -r '.data.error' 2>/dev/null)
  
  # 状态颜色
  case "$TASK_STATUS" in
    "completed")
      STATUS_ICON="${GREEN}✅${NC}"
      STATUS_TEXT="已完成"
      ;;
    "processing")
      STATUS_ICON="${YELLOW}⏳${NC}"
      STATUS_TEXT="处理中"
      ;;
    "pending")
      STATUS_ICON="${YELLOW}⏳${NC}"
      STATUS_TEXT="待处理"
      ;;
    "failed")
      STATUS_ICON="${RED}❌${NC}"
      STATUS_TEXT="失败"
      ;;
    *)
      STATUS_ICON="${CYAN}❓${NC}"
      STATUS_TEXT="未知"
      ;;
  esac
  
  # 显示进度
  echo -e "${CYAN}[$(printf '%3d' $COUNTER)] $(date '+%H:%M:%S')${NC} | 状态: $STATUS_ICON $STATUS_TEXT | 轮次: $CURRENT_ROUND | 字幕: $SUBTITLE_COUNT | 时长: ${TOTAL_DURATION}s | 重试: $RETRY_COUNT"
  
  if [ "$ERROR" != "null" ] && [ -n "$ERROR" ] && [ "$ERROR" != "" ]; then
    echo -e "           ${RED}⚠️ 错误: $ERROR${NC}"
  fi
  
  # 如果任务完成或失败，显示结果并退出
  if [ "$TASK_STATUS" = "completed" ] || [ "$TASK_STATUS" = "failed" ]; then
    echo ""
    if [ "$TASK_STATUS" = "completed" ]; then
      echo -e "${GREEN}════════════════════════════════════════${NC}"
      echo -e "${GREEN}✅ 任务完成！${NC}"
      echo -e "${GREEN}════════════════════════════════════════${NC}"
      echo ""
      echo -e "总用时: $((COUNTER * MONITOR_INTERVAL)) 秒"
      echo -e "最终字幕数: $SUBTITLE_COUNT"
      echo -e "最终时长: $TOTAL_DURATION 秒"
      exit 0
    else
      echo -e "${RED}════════════════════════════════════════${NC}"
      echo -e "${RED}❌ 任务失败！${NC}"
      echo -e "${RED}════════════════════════════════════════${NC}"
      exit 1
    fi
  fi
  
  sleep "$MONITOR_INTERVAL"
done
