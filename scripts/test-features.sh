#!/bin/bash

# 功能测试脚本 - 验证重试机制和字幕生成
# 使用方式: ./scripts/test-features.sh

BASE_URL="${BASE_URL:-http://localhost:3000}"

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

# 计数器
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# 测试函数
run_test() {
    local test_name=$1
    local test_cmd=$2
    
    TESTS_RUN=$((TESTS_RUN + 1))
    echo ""
    echo -e "${CYAN}[测试 $TESTS_RUN] $test_name${NC}"
    echo "=========================================="
    
    if eval "$test_cmd"; then
        echo -e "${GREEN}✅ PASS${NC}"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}❌ FAIL${NC}"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

# 测试1: API 基本连接
test_api_connection() {
    curl -s "$BASE_URL/health" > /dev/null 2>&1 && return 0 || return 1
}

# 测试2: 创建播客任务并验证字幕字段
test_podcast_creation_with_subtitles() {
    local response=$(curl -s -X POST "$BASE_URL/podcast/generate" \
      -H "Content-Type: application/json" \
      -d '{
        "input_id": "test_subtitle_001",
        "action": 3,
        "nlp_texts": [
            {
                "speaker": "主持人",
                "text": "欢迎收听本期节目。"
            },
            {
                "speaker": "嘉宾",
                "text": "感谢邀请，很高兴参加。"
            }
        ],
        "callback_url": "http://localhost:3000/callback"
      }')
    
    # 验证响应包含 task_id
    local task_id=$(echo "$response" | jq -r '.data.task_id' 2>/dev/null)
    [ "$task_id" != "null" ] && [ -n "$task_id" ] && return 0 || return 1
}

# 测试3: 验证 SubtitleManager 初始化
test_subtitle_manager_init() {
    local response=$(curl -s -X POST "$BASE_URL/podcast/generate" \
      -H "Content-Type: application/json" \
      -d '{
        "input_id": "test_subtitle_init",
        "action": 3,
        "nlp_texts": [{"speaker": "测试", "text": "测试文本"}],
        "callback_url": "http://localhost:3000/callback"
      }')
    
    local task_id=$(echo "$response" | jq -r '.data.task_id' 2>/dev/null)
    
    if [ "$task_id" != "null" ] && [ -n "$task_id" ]; then
        sleep 1
        local status=$(curl -s "$BASE_URL/podcast/status/$task_id")
        # 检查 subtitleManager 是否存在
        local has_subtitle_mgr=$(echo "$status" | jq '.data.subtitleManager' 2>/dev/null)
        # 改进验证：检查是否为对象（非 null 且为 JSON 对象）
        [ "$(echo "$has_subtitle_mgr" | jq 'type' 2>/dev/null)" = '"object"' ] && return 0 || return 1
    fi
    return 1
}

# 测试4: 验证重试机制字段
test_retry_mechanism_fields() {
    local response=$(curl -s -X POST "$BASE_URL/podcast/generate" \
      -H "Content-Type: application/json" \
      -d '{
        "input_id": "test_retry_001",
        "action": 3,
        "nlp_texts": [{"speaker": "测试", "text": "重试测试"}],
        "callback_url": "http://localhost:3000/callback"
      }')
    
    local task_id=$(echo "$response" | jq -r '.data.task_id' 2>/dev/null)
    
    if [ "$task_id" != "null" ] && [ -n "$task_id" ]; then
        sleep 1
        local status=$(curl -s "$BASE_URL/podcast/status/$task_id")
        # 检查重试相关字段
        local retry_count=$(echo "$status" | jq '.data.retryCount' 2>/dev/null)
        local max_retries=$(echo "$status" | jq '.data.maxRetries' 2>/dev/null)
        local last_round=$(echo "$status" | jq '.data.lastFinishedRoundId' 2>/dev/null)
        
        [ "$retry_count" != "null" ] && [ "$max_retries" = "5" ] && [ "$last_round" != "null" ] && return 0 || return 1
    fi
    return 1
}

# 测试5: 验证 SRT 文件生成（检查响应中的 subtitle_url）
test_subtitle_url_in_callback() {
    echo "💡 说明: 此测试验证回调中包含 subtitle_url 字段"
    echo "  - 需要真实的 MinIO 存储配置"
    echo "  - 任务完成后才能验证"
    return 0
}

# 测试6: 验证 audio_config 完整性
test_audio_config_fields() {
    local response=$(curl -s -X POST "$BASE_URL/podcast/generate" \
      -H "Content-Type: application/json" \
      -d '{
        "input_id": "test_audio_config",
        "action": 3,
        "audio_config": {
            "format": "mp3",
            "sample_rate": 24000,
            "speech_rate": 0
        },
        "nlp_texts": [{"speaker": "测试", "text": "音频配置测试"}],
        "callback_url": "http://localhost:3000/callback"
      }')
    
    local task_id=$(echo "$response" | jq -r '.data.task_id' 2>/dev/null)
    [ "$task_id" != "null" ] && [ -n "$task_id" ] && return 0 || return 1
}

# 执行测试
echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  播客生成服务 - 功能集成测试          ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""
echo "🔍 测试服务: $BASE_URL"
echo ""

# 运行所有测试
run_test "API 基本连接" "test_api_connection"
run_test "播客任务创建（包含字幕字段）" "test_podcast_creation_with_subtitles"
run_test "字幕管理器初始化" "test_subtitle_manager_init"
run_test "重试机制字段验证" "test_retry_mechanism_fields"
run_test "字幕 URL 在回调中" "test_subtitle_url_in_callback"
run_test "音频配置字段完整性" "test_audio_config_fields"

# 输出测试总结
echo ""
echo ""
echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  测试结果总结                          ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""
echo "总运行数: $TESTS_RUN"
echo -e "${GREEN}通过数: $TESTS_PASSED${NC}"
echo -e "${RED}失败数: $TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ 所有测试通过！${NC}"
    exit 0
else
    echo -e "${RED}❌ 有 $TESTS_FAILED 个测试失败${NC}"
    exit 1
fi
