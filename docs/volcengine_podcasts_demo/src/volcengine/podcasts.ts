import { Command } from 'commander'
import * as fs from 'fs'
import WebSocket from 'ws'
import * as uuid from 'uuid'
import {
  MsgType,
  EventType,
  ReceiveMessage,
  StartConnection,
  StartSession,
  FinishSession,
  FinishConnection,
  WaitForEvent,
} from '../protocols'

const ENDPOINT = 'wss://openspeech.bytedance.com/api/v3/sami/podcasttts'

function main() {
  const program = new Command()
  program
    .name('podcasttts')
    .option('--appid <appid>', 'Application ID')
    .option('--access_token <access_token>', 'Access Key')
    .option('--text [text]', 'Input text Use when action in [0]', '')
    .option(
      '--input_url [input_url]',
      'Web url or file url Use when action in [0]',
      ''
    )
    .option(
      '--prompt_text [prompt_text]',
      'Input Prompt Text must not empty when action in [4]',
      ''
    )
    .option(
      '--nlp_texts [nlp_texts]',
      'Input NLP Texts must not empty when action in [3]',
      '[]',
    )
    .option(
      '--speaker_info [speaker_info]',
      'Podcast Speaker Inf',
      '{"random_order":false}',
    )
    .option(
      '--resource_id [resource_id]',
      'Audio Resource id',
      'volc.service_type.10050',
    )
    .option('--action [action]', 'different podcast type (0, 3, 4)', '0')
    .option('--encoding [encoding]', 'Audio format', 'mp3')
    .option('--input_id [input_id]', 'Unique identifier', 'test_podcast')
    .option('--use_head_music [use_head_music]', 'Enable head music', true)
    .option('--use_tail_music [use_tail_music]', 'Enable tail music', false)
    .option('--only_nlp_text [only_nlp_text]', 'Enable only podcast text when action in [0, 4]', false)
    .option('--return_audio_url [return_audio_url]', 'Enable return audio url that can download', false)
    .option('--skip_round_audio_save [skip_round_audio_save]', 'skip round audio save', false)
    .action(async (options) => {
      // 参数校验
      if (!options.appid || !options.access_token) {
        throw new Error('Application ID or Access Key or Text is required')
      }

      // 构建请求头
      const headers = {
        'X-Api-App-Id': options.appid,
        'X-Api-App-Key': 'aGjiRDfUWi',
        'X-Api-Access-Key': options.access_token,
        'X-Api-Resource-Id': options.resource_id,
        'X-Api-Connect-Id': uuid.v4(),
      }

      let isPodcastRoundEnd = true
      let audioReceived = false
      let lastRoundID = -1
      let taskID = ''
      let retryNum = 5
      const podcastAudio: Uint8Array[] = []
      let audio: Uint8Array[] = []
      let voice = ''
      let currentRound = 0
      let ws: WebSocket | null = null
      let podcastTexts = []

      try {
        while (retryNum > 0) {
          // 建立websocket连接
          ws = new WebSocket(ENDPOINT, {
            headers,
            skipUTF8Validation: true,
          })

          // 打印 ws 的响应 header 信息
          ws.on('upgrade', (res) => {
            console.log('WebSocket upgrade headers:', res.headers)
          })

          await new Promise<void>((resolve, reject) => {
            ws!.on('open', resolve)
            ws!.on('error', reject)
          })

          const reqParams: any = {
            input_id: options.input_id,
            input_text: options.text,
            prompt_text: options.prompt_text,
            // action 转换 int 类型
            action: parseInt(options.action),
            // speaker_info 和 nlp_texts 转换 JSON 类型
            speaker_info: JSON.parse(options.speaker_info),
            nlp_texts: JSON.parse(options.nlp_texts),
            use_head_music: String(options.use_head_music) === 'true',
            use_tail_music: String(options.use_tail_music) === 'true',
            input_info: {
              input_url: options.input_url,
              return_audio_url: String(options.return_audio_url) === 'true',
              only_nlp_text:  String(options.only_nlp_text) === 'true',
            },
            audio_config: {
              format: options.encoding,
              sample_rate: 24000,
              speech_rate: 0,
            },
          }

          if (!isPodcastRoundEnd) {
            reqParams.retry_info = {
              retry_task_id: taskID,
              last_finished_round_id: lastRoundID,
            }
          }

          // output 文件夹不存在则创建
          if (!fs.existsSync('output')) {
            fs.mkdirSync('output')
          }

          // Start connection [event=1] -----------> server
          await StartConnection(ws!)
          // Connection started [event=50] <---------- server
          await WaitForEvent(
            ws!,
            MsgType.FullServerResponse,
            EventType.ConnectionStarted,
          )

          const sessionID = uuid.v4()
          if (!taskID) taskID = sessionID
          // Start session [event=100] -----------> server
          await StartSession(
            ws!,
            new TextEncoder().encode(JSON.stringify(reqParams)),
            sessionID,
          )
          // Session started [event=150] <---------- server
          await WaitForEvent(
            ws!,
            MsgType.FullServerResponse,
            EventType.SessionStarted,
          )
          // Finish session [event=102] -----------> server
          await FinishSession(ws!, sessionID)

          while (true) {
            // 接收响应内容
            const msg = await ReceiveMessage(ws!)
            console.log(msg.toString())

            switch (msg.type) {
              // 音频数据块
              case MsgType.AudioOnlyServer:
                if (msg.event === EventType.PodcastRoundResponse) {
                  if (!audioReceived && audio.length > 0) {
                    audioReceived = true
                  }
                  audio.push(msg.payload)
                  console.log(
                    `Received audio chunk | size: ${msg.payload.length} bytes`,
                  )
                }
                break
              // 错误信息
              case MsgType.Error:
                throw new Error(
                  `Server error: ${new TextDecoder().decode(msg.payload)}`,
                )
              case MsgType.FullServerResponse:
                // 播客round开始
                if (msg.event === EventType.PodcastRoundStart) {
                  const data = JSON.parse(new TextDecoder().decode(msg.payload))
                  if (options.only_nlp_text) {
                    podcastTexts.push({
                      speaker: data.speaker,
                      text: data.text,
                    })
                  }
                  voice = data.speaker || 'head_music'
                  currentRound = data.round_id
                  if (currentRound === 9999) {
                    voice = 'tail_music'
                  }
                  isPodcastRoundEnd = false
                  // 播客round结束
                } else if (msg.event === EventType.PodcastRoundEnd) {
                  const data = JSON.parse(new TextDecoder().decode(msg.payload))
                  const isErr = data.is_error || false
                  if (isErr) {
                    console.log(`Podcast round end with error: ${JSON.stringify(data)}`)
                    break
                  }
                  isPodcastRoundEnd = true
                  lastRoundID = currentRound
                  if (audio.length > 0) {
                    if (String(options.skip_round_audio_save) != 'true') {
                      // 保存当前音频, 拼接当前时间戳
                      const filename = `output/${voice}_${currentRound}.${options.encoding}`
                      await fs.promises.writeFile(filename, Buffer.concat(audio))
                      console.log(`Saved partial audio: ${filename}`)
                    }
                    podcastAudio.push(...audio)
                    audio = []
                  }
                } else if (msg.event === EventType.PodcastEnd) {
                  const data = JSON.parse(new TextDecoder().decode(msg.payload))
                  console.log(`Podcast end: ${JSON.stringify(data)}`)
                }
            }
            // 会话结束
            if (msg.event === EventType.SessionFinished) {
              break
            }
          }
          // 保持连接，等待下一轮播客
          await FinishConnection(ws!)
          await WaitForEvent(
            ws!,
            MsgType.FullServerResponse,
            EventType.ConnectionFinished,
          )
          // 播客结束，保存最终音频
          if (isPodcastRoundEnd) {
            if (podcastAudio.length > 0) {
              // 保存最终音频, 拼接当前时间戳
              const filename = `output/podcast_final_${Date.now()}.${options.encoding}`
              await fs.promises.writeFile(filename, Buffer.concat(podcastAudio))
              console.log(`Final audio saved: ${filename}`)
            }
            if (podcastTexts.length > 0 && options.only_nlp_text) {
              const filename = `output/podcast_final.json`
              await fs.promises.writeFile(filename, JSON.stringify(podcastTexts))
              console.log(`Final text saved: ${filename}`)
            }
            break
          } else {
            console.log(
              `Current podcast not finished, resuming from round ${lastRoundID}`,
            )
            retryNum--
            await new Promise((resolve) => setTimeout(resolve, 1000))
          }
        }
      } finally {
        if (ws) {
          ws.close()
        }
      }
    })
  program.parse()
}

main()
