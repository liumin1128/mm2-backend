#!/bin/bash

# 播客生成测试脚本
# 使用方式: ./scripts/test-podcast.sh

BASE_URL="${BASE_URL:-http://localhost:3000}"
CALLBACK_URL="${CALLBACK_URL:-http://localhost:3000/test-callback}"

echo "🎙️  测试播客生成接口..."
echo "BASE_URL: $BASE_URL"
echo ""

# 发送播客生成请求
RESPONSE=$(curl -s -X POST "$BASE_URL/podcast/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "input_id": "test_podcast",
    "action": 3,
    "use_head_music": false,
    "audio_config": {
        "format": "mp3",
        "sample_rate": 24000,
        "speech_rate": 0
    },
    "nlp_texts": [
        {
            "speaker": "zh_male_dayixiansheng_v2_saturn_bigtts",
            "text": "今天呢我们要聊的呢是火山引擎在这个 FORCE 原动力大会上面的一些比较重磅的发布。"
        },
        {
            "speaker": "zh_female_mizaitongxue_v2_saturn_bigtts",
            "text": "来看看都有哪些亮点哈。"
        }
    ],
    "callback_url": "'"$CALLBACK_URL"'"
}')

echo "📤 请求响应:"
echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"

# 提取 task_id
TASK_ID=$(echo "$RESPONSE" | jq -r '.data.task_id' 2>/dev/null)

if [ "$TASK_ID" != "null" ] && [ -n "$TASK_ID" ]; then
    echo ""
    echo "✅ 任务创建成功! Task ID: $TASK_ID"
    echo ""
    echo "⏳ 等待 5 秒后查询任务状态..."
    sleep 5
    
    echo ""
    echo "📊 任务状态:"
    curl -s "$BASE_URL/podcast/status/$TASK_ID" | jq . 2>/dev/null || curl -s "$BASE_URL/podcast/status/$TASK_ID"
else
    echo ""
    echo "❌ 任务创建失败"
fi
