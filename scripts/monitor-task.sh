#!/bin/bash

# 任务进度监控脚本 - 持续观察任务状态，不中断服务

BASE_URL="http://localhost:3000"
TASK_ID=$1
INTERVAL=${2:-2}  # 默认每2秒查询一次

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

if [ -z "$TASK_ID" ]; then
  echo -e "${RED}❌ 错误：需要提供 TASK_ID${NC}"
  echo "使用方法: $0 <task_id> [查询间隔秒数]"
  echo "示例: $0 'bcf5b46d-65bf-40c5-94b3-6eaebc3dd429' 2"
  exit 1
fi

echo -e "${BLUE}════════════════════════════════════════${NC}"
echo -e "${BLUE}     任务进度监控 - 每 ${INTERVAL} 秒更新${NC}"
echo -e "${BLUE}════════════════════════════════════════${NC}"
echo -e "${CYAN}Task ID: $TASK_ID${NC}"
echo ""

COUNTER=0
while true; do
  COUNTER=$((COUNTER + 1))
  
  # 查询任务状态
  STATUS=$(curl -s "$BASE_URL/podcast/status/$TASK_ID" 2>/dev/null)
  
  if [ -z "$STATUS" ]; then
    echo -e "${RED}[$(date '+%H:%M:%S')] ❌ 无法连接到服务器${NC}"
    sleep "$INTERVAL"
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
      STATUS_COLOR="${GREEN}✅ 已完成${NC}"
      ;;
    "processing")
      STATUS_COLOR="${YELLOW}⏳ 处理中${NC}"
      ;;
    "pending")
      STATUS_COLOR="${YELLOW}⏳ 待处理${NC}"
      ;;
    "failed")
      STATUS_COLOR="${RED}❌ 失败${NC}"
      ;;
    *)
      STATUS_COLOR="${CYAN}❓ 未知${NC}"
      ;;
  esac
  
  # 显示进度
  echo -e "${CYAN}[查询 #${COUNTER}] $(date '+%H:%M:%S')${NC}"
  echo -e "  状态: $STATUS_COLOR"
  echo -e "  当前轮次: $CURRENT_ROUND"
  echo -e "  字幕数量: $SUBTITLE_COUNT"
  echo -e "  总时长: $TOTAL_DURATION 秒"
  echo -e "  重试次数: $RETRY_COUNT"
  
  if [ "$ERROR" != "null" ] && [ -n "$ERROR" ]; then
    echo -e "  ${RED}错误: $ERROR${NC}"
  fi
  
  # 如果任务完成或失败，退出
  if [ "$TASK_STATUS" = "completed" ] || [ "$TASK_STATUS" = "failed" ]; then
    echo ""
    if [ "$TASK_STATUS" = "completed" ]; then
      echo -e "${GREEN}════════════════════════════════════════${NC}"
      echo -e "${GREEN}        任务完成！${NC}"
      echo -e "${GREEN}════════════════════════════════════════${NC}"
      exit 0
    else
      echo -e "${RED}════════════════════════════════════════${NC}"
      echo -e "${RED}        任务失败！${NC}"
      echo -e "${RED}════════════════════════════════════════${NC}"
      exit 1
    fi
  fi
  
  echo ""
  sleep "$INTERVAL"
done
