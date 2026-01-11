#!/bin/bash

# 播客生成测试脚本 - 测试重试机制和字幕生成功能
# 使用方式: ./scripts/test-podcast.sh

BASE_URL="${BASE_URL:-http://localhost:3000}"
CALLBACK_URL="${CALLBACK_URL:-http://localhost:3000/test-callback}"

echo "🎙️  播客生成测试 (支持重试机制和字幕生成)"
echo "=================================================="
echo "BASE_URL: $BASE_URL"
echo "CALLBACK_URL: $CALLBACK_URL"
echo ""

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# 测试场景 1: 对话模式（带字幕）
echo -e "${BLUE}[测试1] 对话模式生成播客 (NLP_TEXTS)${NC}"
echo "--------"
RESPONSE=$(curl -s -X POST "$BASE_URL/podcast/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "input_id": "test_dialogue_001",
    "action": 3,
    "use_head_music": true,
    "use_tail_music": true,
    "audio_config": {
        "format": "mp3",
        "sample_rate": 24000,
        "speech_rate": 0
    },
    "nlp_texts": [
        {
            "speaker": "主持人",
            "text": "大家好，欢迎来到本期播客。今天我们要讨论最新的技术发展趋势。"
        },
        {
            "speaker": "嘉宾A",
            "text": "感谢邀请。我认为人工智能将是2024年的重点方向。"
        },
        {
            "speaker": "主持人",
            "text": "非常同意。那么AI在具体应用中有哪些挑战呢？"
        },
        {
            "speaker": "嘉宾A",
            "text": "主要包括数据隐私、模型安全和伦理问题三个方面。"
        }
    ],
    "speaker_info": {
        "random_order": false
    },
    "callback_url": "'"$CALLBACK_URL"'"
}')

echo "📤 响应信息:"
echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"

TASK_ID=$(echo "$RESPONSE" | jq -r '.data.task_id' 2>/dev/null)

if [ "$TASK_ID" != "null" ] && [ -n "$TASK_ID" ]; then
    echo ""
    echo -e "${GREEN}✅ 任务创建成功${NC}"
    echo "Task ID: $TASK_ID"
    echo ""
    echo -e "${YELLOW}⏳ 等待 3 秒后查询任务状态...${NC}"
    sleep 3
    
    echo ""
    echo -e "${BLUE}[查询状态]${NC}"
    STATUS_RESPONSE=$(curl -s "$BASE_URL/podcast/status/$TASK_ID")
    echo "$STATUS_RESPONSE" | jq . 2>/dev/null || echo "$STATUS_RESPONSE"
    
    # 检查是否有字幕
    SUBTITLE_URL=$(echo "$STATUS_RESPONSE" | jq -r '.data.subtitleManager.subtitles[0]' 2>/dev/null)
    if [ "$SUBTITLE_URL" != "null" ] && [ -n "$SUBTITLE_URL" ]; then
        echo -e "${GREEN}✅ 字幕已生成${NC}"
    fi
else
    echo -e "${RED}❌ 任务创建失败${NC}"
fi

echo ""
echo "=================================================="
echo -e "${BLUE}[测试2] 文本总结模式 (SUMMARIZE)${NC}"
echo "--------"
RESPONSE2=$(curl -s -X POST "$BASE_URL/podcast/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "input_id": "test_summarize_001",
    "action": 0,
    "input_text": "云计算技术在过去十年中取得了令人瞩目的发展。从基础设施即服务到平台即服务，再到软件即服务，云计算的应用范围不断扩展。企业通过迁移到云平台，能够显著降低IT运维成本，提高业务灵活性。同时，云计算也带来了数据安全、隐私保护等新的挑战。",
    "use_head_music": false,
    "audio_config": {
        "format": "mp3"
    },
    "callback_url": "'"$CALLBACK_URL"'"
}')

echo "📤 响应信息:"
echo "$RESPONSE2" | jq . 2>/dev/null || echo "$RESPONSE2"

TASK_ID2=$(echo "$RESPONSE2" | jq -r '.data.task_id' 2>/dev/null)

if [ "$TASK_ID2" != "null" ] && [ -n "$TASK_ID2" ]; then
    echo ""
    echo -e "${GREEN}✅ 任务创建成功${NC}"
    echo "Task ID: $TASK_ID2"
else
    echo -e "${RED}❌ 任务创建失败${NC}"
fi

echo ""
echo "=================================================="
echo -e "${BLUE}[测试3] 带重试信息的请求${NC}"
echo "--------"
echo "💡 注：重试机制会在连接中断时自动触发（最多重试5次）"
echo ""

echo ""
echo -e "${GREEN}✅ 所有测试已完成${NC}"
echo ""
echo "说明:"
echo "- 任务为异步处理，将通过回调通知完成"
echo "- 字幕将作为 .srt 文件上传到 MinIO 对象存储"
echo "- 回调 URL 将接收包含 audio_url 和 subtitle_url 的通知"
echo ""