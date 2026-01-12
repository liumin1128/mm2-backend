#!/bin/bash

# 简单单次测试脚本 - 只运行一次，验证基本功能

set -e

BASE_URL="http://localhost:3000"

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}════════════════════════════════════════${NC}"
echo -e "${BLUE}     播客服务 - 简单功能测试${NC}"
echo -e "${BLUE}════════════════════════════════════════${NC}"
echo ""

# 1. 创建任务
echo -e "${BLUE}[1/2] 创建播客任务...${NC}"
RESPONSE=$(curl -s -X POST "$BASE_URL/podcast/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "input_id": "simple_test_'$(date +%s)'",
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
      },
      {
        "text": "(端起茶杯喝了一口) 是啊，那个ID叫国道G107的帖子，当年在天涯可是掀起了惊涛骇浪。他发帖的时间点，就在飞机失联的第二天，所有人都还在南中国海找呢。",
        "speaker": "zh_male_dayixiansheng_v2_saturn_bigtts"
      },
      {
        "text": "他上来就说“别找了，飞机根本不在那里”，这也太敢说了吧？",
        "speaker": "zh_female_mizaitongxue_v2_saturn_bigtts"
      },
      {
        "text": "(老杨笑了起来) 当时大家都觉得这人疯了。但一个星期后，马来西亚官方公布卫星数据，说飞机通信系统是人为关闭的，还飞了七个小时——这跟国道大神的说法几乎一字不差。",
        "speaker": "zh_male_dayixiansheng_v2_saturn_bigtts"
      },
      {
        "text": "我去！这也太准了吧？那后来呢？他到底还说了什么？",
        "speaker": "zh_female_mizaitongxue_v2_saturn_bigtts"
      },
      {
        "text": "这才是最让人脊背发凉的地方。国道大神在帖子里给出了一个具体的答案——劫持者的目标，是飞机上的人和物。",
        "speaker": "zh_male_dayixiansheng_v2_saturn_bigtts"
      },
      {
        "text": "等等，不为钱不为恐袭，那图什么啊？",
        "speaker": "zh_female_mizaitongxue_v2_saturn_bigtts"
      },
      {
        "text": "他指向了一家美国公司——菲斯卡尔半导体。飞机上有20名这家公司的员工，其中12名马来西亚人，8名中国人。更关键的是，失联前几天，一项重要专利刚刚获批。",
        "speaker": "zh_male_dayixiansheng_v2_saturn_bigtts"
      },
      {
        "text": "专利？这跟飞机失联有什么关系？",
        "speaker": "zh_female_mizaitongxue_v2_saturn_bigtts"
      },
      {
        "text": "这项专利编号US8671381B，是关于芯片堆叠的新技术，据说对军事科技有颠覆性意义。发明人有五位，其中四位就是搭乘MH370的中国籍工程师。",
        "speaker": "zh_male_dayixiansheng_v2_saturn_bigtts"
      },
      {
        "text": "我的天...那专利法是怎么规定的？",
        "speaker": "zh_female_mizaitongxue_v2_saturn_bigtts"
      },
      {
        "text": "(放下茶杯) 根据专利法，如果共有人去世，专利所有权会自动转移给剩下的共有人。所以国道大神推测，这是一场定点清除，目的就是为了获得专利的完全控制权。",
        "speaker": "zh_male_dayixiansheng_v2_saturn_bigtts"
      },
      {
        "text": "这也太黑暗了吧！那飞机到底去哪了？官方不是说在南印度洋吗？",
        "speaker": "zh_female_mizaitongxue_v2_saturn_bigtts"
      },
      {
        "text": "国道大神给出了一个截然不同的答案——迪戈加西亚。那是印度洋上的美军基地，有3600米跑道，足以起降波音777。",
        "speaker": "zh_male_dayixiansheng_v2_saturn_bigtts"
      },
      {
        "text": "迪戈加西亚？我查过，那地方确实是个军事禁区，外界根本进不去。但有什么证据吗？",
        "speaker": "zh_female_mizaitongxue_v2_saturn_bigtts"
      },
      {
        "text": "有几个耐人寻味的线索。第一，家属在失联后几个小时还能打通亲人手机，说明手机可能在地面基站范围内。第二，马尔代夫居民目击到低空飞行的巨大飞机。",
        "speaker": "zh_male_dayixiansheng_v2_saturn_bigtts"
      },
      {
        "text": "等等，我记得还有个石油工人的目击证词？",
        "speaker": "zh_female_mizaitongxue_v2_saturn_bigtts"
      },
      {
        "text": "对，麦克麦凯，他在越南附近的钻井平台工作，声称看到一架燃烧的飞机从高空掠过。但这些证词当时都被忽略了。",
        "speaker": "zh_male_dayixiansheng_v2_saturn_bigtts"
      },
      {
        "text": "那官方的南印度洋坠毁论呢？不是找到残骸了吗？",
        "speaker": "zh_female_mizaitongxue_v2_saturn_bigtts"
      },
      {
        "text": "(翻动资料的声音) 问题就在这。长达数年的搜索，耗资2亿美元，覆盖12万平方公里，结果一无所获。后来在非洲东海岸发现的残骸，也有专家质疑——上面的海洋生物更像是温暖近海生长的。",
        "speaker": "zh_male_dayixiansheng_v2_saturn_bigtts"
      },
      {
        "text": "你的意思是...这些残骸可能是人为投放的？",
        "speaker": "zh_female_mizaitongxue_v2_saturn_bigtts"
      },
      {
        "text": "只是一种猜测。但你看，无论是劫持论还是坠毁论，都有无法解释的漏洞。真相就像被打碎的魔方，我们手里只有几块碎片。",
        "speaker": "zh_male_dayixiansheng_v2_saturn_bigtts"
      },
      {
        "text": "最痛苦的是家属啊。十年了，活不见人死不见尸。我认识一位叫江辉的家属，他母亲就在飞机上，这十年他几乎放下了所有生活，就为了追寻真相。",
        "speaker": "zh_female_mizaitongxue_v2_saturn_bigtts"
      },
      {
        "text": "是啊，他说“我们不要赔偿，我们只要真相”。这种坚持，终于在十年后看到了一丝曙光——重启调查。",
        "speaker": "zh_male_dayixiansheng_v2_saturn_bigtts"
      },
      {
        "text": "美国海洋无限公司，无发现不收费。这确实是个好消息，但...如果飞机真的不在南印度洋呢？",
        "speaker": "zh_female_mizaitongxue_v2_saturn_bigtts"
      },
      {
        "text": "(叹了口气) 那就是在错误的地方用再先进的技术，结果也是徒劳。但重启调查本身就有意义——它意味着官方承认过去的调查没能给出令人信服的结论。",
        "speaker": "zh_male_dayixiansheng_v2_saturn_bigtts"
      },
      {
        "text": "老杨，你说国道大神到底是什么人？他发完帖就消失了，身份和内容一样成了谜。",
        "speaker": "zh_female_mizaitongxue_v2_saturn_bigtts"
      },
      {
        "text": "可能是内部知情者，也可能是逻辑缜密的推理高手。但MH370事件和这篇神贴给我们的思考，远超事件本身。",
        "speaker": "zh_male_dayixiansheng_v2_saturn_bigtts"
      },
      {
        "text": "它让我们看到平静生活下的暗流，国家间科技竞争的残酷，也让我们反思——在信息爆炸的时代，该如何分辨真相和谎言？",
        "speaker": "zh_female_mizaitongxue_v2_saturn_bigtts"
      },
      {
        "text": "当官方叙事充满漏洞，民间猜测又缺乏实证时，我们该相信什么？MH370就像一面镜子，照出了这个世界的复杂和不确定性。",
        "speaker": "zh_male_dayixiansheng_v2_saturn_bigtts"
      },
      {
        "text": "239个生命的离去，换来的不应该是一个冰冷的结案报告。无论重启调查结果如何，我们都应该记住MH370，记住那些无辜的生命，记住永不放弃的家属。",
        "speaker": "zh_female_mizaitongxue_v2_saturn_bigtts"
      },
      {
        "text": "对真相的追寻，是对逝者最好的告慰。或许在未来的某一天，当尘封的档案被解密，我们会发现那个在天涯敲下文字的神秘人，早已洞悉了一切。",
        "speaker": "zh_male_dayixiansheng_v2_saturn_bigtts"
      },
      {
        "text": "又或者，真相会以我们所有人都意想不到的方式呈现。在那之前，我们能做的就是保持关注，保持思考，保持质疑。",
        "speaker": "zh_female_mizaitongxue_v2_saturn_bigtts"
      },
      {
        "text": "因为遗忘，才是对真相最大的背叛。马航MH370的故事还远未结束，而我们，都是这个故事的见证者。",
        "speaker": "zh_male_dayixiansheng_v2_saturn_bigtts"
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
echo "Task ID: $TASK_ID"
echo ""

# 2. 查询任务状态
echo -e "${BLUE}[2/2] 查询任务状态...${NC}"
sleep 2

STATUS=$(curl -s "$BASE_URL/podcast/status/$TASK_ID")

if echo "$STATUS" | jq -e '.data' > /dev/null 2>&1; then
  echo -e "${GREEN}✅ 状态查询成功${NC}"
  
  SUBTITLE_COUNT=$(echo "$STATUS" | jq '.data.subtitleManager.subtitles | length' 2>/dev/null)
  DURATION=$(echo "$STATUS" | jq '.data.subtitleManager.totalDuration' 2>/dev/null)
  
  echo "字幕数量: $SUBTITLE_COUNT"
  echo "总时长: $DURATION 秒"
  echo ""
  echo -e "${GREEN}✅ 功能验证完成！${NC}"
  exit 0
else
  echo -e "${RED}❌ 状态查询失败${NC}"
  exit 1
fi
