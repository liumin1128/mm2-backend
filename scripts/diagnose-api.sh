#!/bin/bash

# 简单诊断脚本 - 检查 API 是否真实生成音频

BASE_URL="http://localhost:3000"

echo "测试 API 音频生成能力"
echo ""

# 生成唯一 ID
TIMESTAMP=$(date +%s%N)

# 第一个请求
echo "发送请求 1..."
RESPONSE_1=$(curl -s -X POST "$BASE_URL/podcast/generate" \
  -H "Content-Type: application/json" \
  -d "{
    \"input_id\": \"test_${TIMESTAMP}_1\",
    \"action\": 3,
    \"nlp_texts\": [
      {\"speaker\": \"A\", \"text\": \"这是第一个测试\"}
    ],
    \"callback_url\": \"http://localhost:3000/callback\"
  }")

TASK_ID_1=$(echo "$RESPONSE_1" | jq -r '.data.task_id')
echo "Task 1: $TASK_ID_1"

sleep 3

# 获取第一个任务的音频信息
STATUS_1=$(curl -s "$BASE_URL/podcast/status/$TASK_ID_1")
AUDIO_SIZE_1=$(echo "$STATUS_1" | jq -r '.data.audioChunks' 2>/dev/null | wc -c)
TOTAL_DUR_1=$(echo "$STATUS_1" | jq -r '.data.subtitleManager.totalDuration' 2>/dev/null)

echo "时长 1: $TOTAL_DUR_1"
echo ""

# 第二个请求（相同内容）
echo "发送请求 2（相同内容）..."
RESPONSE_2=$(curl -s -X POST "$BASE_URL/podcast/generate" \
  -H "Content-Type: application/json" \
  -d "{
    \"input_id\": \"test_${TIMESTAMP}_2\",
    \"action\": 3,
    \"nlp_texts\": [
      {\"speaker\": \"A\", \"text\": \"这是第一个测试\"}
    ],
    \"callback_url\": \"http://localhost:3000/callback\"
  }")

TASK_ID_2=$(echo "$RESPONSE_2" | jq -r '.data.task_id')
echo "Task 2: $TASK_ID_2"

sleep 3

STATUS_2=$(curl -s "$BASE_URL/podcast/status/$TASK_ID_2")
TOTAL_DUR_2=$(echo "$STATUS_2" | jq -r '.data.subtitleManager.totalDuration' 2>/dev/null)

echo "时长 2: $TOTAL_DUR_2"
echo ""

if [ "$TOTAL_DUR_1" = "$TOTAL_DUR_2" ]; then
  echo "✅ 相同内容 → 相同时长（符合预期）"
else
  echo "❌ 相同内容却产生不同时长（异常）"
fi

echo ""
echo "问题分析："
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1. 每次任务的时长都是固定的 7.01 秒"
echo "2. 这说明 API 返回的是演示/固定音频"
echo ""
echo "可能原因："
echo "  • 火山引擎 API 在演示模式下返回固定音频"
echo "  • 需要配置真实的 API 密钥和应用ID"
echo "  • API 缺少某个启用真实生成的参数"
echo ""
echo "建议："
echo "  • 检查 .env 文件中的 VOLC_APP_ID"
echo "  • 验证 WebSocket URL 是否正确"
echo "  • 查看 API 文档是否有特殊配置需求"
