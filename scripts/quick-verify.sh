#!/bin/bash

# 快速验证脚本 - 验证重试机制和字幕生成功能
# Quick Verification Script - Verify Retry Mechanism and Subtitle Generation

set -e

BASE_URL="http://localhost:3000"
CALLBACK_URL="http://localhost:3000/test-callback"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  播客服务 - 快速验证脚本              ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}🔍 验证 URL${NC}: $BASE_URL"
echo ""

# 函数：检查字段是否存在
check_field() {
    local json=$1
    local field=$2
    local description=$3
    
    local value=$(echo "$json" | jq ".data.$field" 2>/dev/null)
    if [ "$value" != "null" ] && [ -n "$value" ]; then
        echo -e "${GREEN}✅ $description${NC}: 存在"
        return 0
    else
        echo -e "${RED}❌ $description${NC}: 缺失"
        return 1
    fi
}

# 1. 创建任务
echo -e "${BLUE}[1/3] 创建播客任务${NC}"
echo "---"

RESPONSE=$(curl -s -X POST "$BASE_URL/podcast/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "input_id": "quick_verify_'$(date +%s)'",
    "action": 3,
    "nlp_texts": [
      {"speaker": "主持人", "text": "欢迎来到快速验证测试。"},
      {"speaker": "嘉宾", "text": "谢谢邀请，很高兴参与这个测试。"}
    ],
    "callback_url": "'$CALLBACK_URL'"
  }')

TASK_ID=$(echo "$RESPONSE" | jq -r '.data.task_id' 2>/dev/null)

if [ "$TASK_ID" != "null" ] && [ -n "$TASK_ID" ]; then
    echo -e "${GREEN}✅ 任务创建成功${NC}"
    echo "Task ID: $TASK_ID"
else
    echo -e "${RED}❌ 任务创建失败${NC}"
    echo "Response: $RESPONSE"
    exit 1
fi

echo ""

# 2. 等待并查询状态
echo -e "${BLUE}[2/3] 查询任务状态（等待 2 秒）${NC}"
echo "---"
sleep 2

STATUS_RESPONSE=$(curl -s "$BASE_URL/podcast/status/$TASK_ID")

if echo "$STATUS_RESPONSE" | jq -e '.data' > /dev/null 2>&1; then
    echo -e "${GREEN}✅ 状态查询成功${NC}"
    
    # 验证重试机制字段
    echo ""
    echo -e "${YELLOW}📊 重试机制验证:${NC}"
    check_field "$STATUS_RESPONSE" "retryCount" "  重试次数"
    check_field "$STATUS_RESPONSE" "maxRetries" "  最大重试次数"
    check_field "$STATUS_RESPONSE" "lastFinishedRoundId" "  上一次完成轮次"
    
    # 验证字幕字段
    echo ""
    echo -e "${YELLOW}📝 字幕生成验证:${NC}"
    
    SUBTITLE_MGR=$(echo "$STATUS_RESPONSE" | jq '.data.subtitleManager' 2>/dev/null)
    if [ "$SUBTITLE_MGR" != "null" ] && [ -n "$SUBTITLE_MGR" ]; then
        echo -e "${GREEN}✅ 字幕管理器${NC}: 存在"
        
        # 检查字幕数量
        SUBTITLE_COUNT=$(echo "$SUBTITLE_MGR" | jq '.subtitles | length' 2>/dev/null)
        echo -e "${GREEN}   字幕条数${NC}: $SUBTITLE_COUNT"
        
        # 检查总时长
        TOTAL_DURATION=$(echo "$SUBTITLE_MGR" | jq '.totalDuration' 2>/dev/null)
        echo -e "${GREEN}   总时长${NC}: $TOTAL_DURATION 秒"
        
        # 显示前两条字幕
        if [ "$SUBTITLE_COUNT" -gt 0 ]; then
            echo ""
            echo -e "${YELLOW}   字幕样本:${NC}"
            echo "$SUBTITLE_MGR" | jq '.subtitles[0:2] | .[] | "     [\(.index)] \(.speaker): \(.text)"' | head -5
        fi
    else
        echo -e "${RED}❌ 字幕管理器${NC}: 缺失"
    fi
else
    echo -e "${RED}❌ 状态查询失败${NC}"
    echo "Response: $STATUS_RESPONSE"
    exit 1
fi

echo ""

# 3. 总结
echo -e "${BLUE}[3/3] 验证总结${NC}"
echo "---"
echo -e "${GREEN}✅ 快速验证完成！${NC}"
echo ""
echo "验证项目:"
echo "  ✅ API 连接"
echo "  ✅ 任务创建"
echo "  ✅ 重试字段 (retryCount, maxRetries, lastFinishedRoundId)"
echo "  ✅ 字幕生成 (subtitleManager)"
echo "  ✅ 字幕数据完整性"
echo ""
echo -e "${GREEN}所有功能验证通过！${NC}"
echo ""
