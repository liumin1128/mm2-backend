import { v4 as uuidv4 } from 'uuid';
import * as zlib from 'zlib';

/**
 * 火山引擎播客TTS WebSocket二进制协议工具类
 * 协议文档: https://www.volcengine.com/docs/6561/1668014
 */

// Event 类型定义
export enum EventType {
  // 上行事件
  FINISH_CONNECTION = 2,

  // 下行事件
  CONNECTION_FINISHED = 52,
  SESSION_STARTED = 150,
  SESSION_FINISHED = 152,
  USAGE_RESPONSE = 154,
  PODCAST_ROUND_START = 360,
  PODCAST_ROUND_RESPONSE = 361,
  PODCAST_ROUND_END = 362,
  PODCAST_END = 363,
}

// Message Type 定义
export enum MessageType {
  FULL_CLIENT_REQUEST = 0b1001,
  AUDIO_ONLY_RESPONSE = 0b1011,
  ERROR_RESPONSE = 0b1111,
}

// Serialization Method 定义
export enum SerializationMethod {
  RAW = 0b0000,
  JSON = 0b0001,
}

// Compression Method 定义
export enum CompressionMethod {
  NONE = 0b0000,
  GZIP = 0b0001,
}

export interface ParsedFrame {
  protocolVersion: number;
  headerSize: number;
  messageType: number;
  messageFlags: number;
  serializationMethod: number;
  compressionMethod: number;
  eventType?: number;
  sessionId?: string;
  payload?: Buffer | Record<string, unknown>;
  errorCode?: number;
}

export interface PodcastRoundStartPayload {
  text_type: string;
  speaker: string;
  round_id: number;
  text: string;
}

export interface PodcastRoundEndPayload {
  is_error?: boolean;
  error_msg?: string;
  audio_duration?: number;
}

export interface PodcastEndPayload {
  meta_info?: {
    audio_url?: string;
  };
}

export class PodcastProtocol {
  /**
   * 生成唯一的 Session ID
   */
  static generateSessionId(): string {
    return uuidv4().replace(/-/g, '').substring(0, 12);
  }

  /**
   * 构建 StartSession 请求帧
   */
  static buildStartSessionFrame(sessionId: string, payload: object): Buffer {
    const payloadJson = JSON.stringify(payload);
    const payloadBuffer = Buffer.from(payloadJson, 'utf-8');
    const sessionIdBuffer = Buffer.from(sessionId, 'utf-8');

    // Header (4 bytes) + EventType (4 bytes) + SessionIdLen (4 bytes) + SessionId + PayloadLen (4 bytes) + Payload
    const totalLength =
      4 + 4 + 4 + sessionIdBuffer.length + 4 + payloadBuffer.length;
    const frame = Buffer.alloc(totalLength);

    let offset = 0;

    // Byte 0: Protocol version (0b0001) | Header size (0b0001)
    frame.writeUInt8(0b00010001, offset++);

    // Byte 1: Message type (0b1001 Full-client request) | Message flags (0b0100 with event number)
    frame.writeUInt8(0b10010100, offset++);

    // Byte 2: Serialization method (0b0001 JSON) | Compression method (0b0000 none)
    frame.writeUInt8(0b00010000, offset++);

    // Byte 3: Reserved
    frame.writeUInt8(0b00000000, offset++);

    // Event type (4 bytes) - StartSession 没有特定的 event type, 使用 0
    frame.writeUInt32BE(0, offset);
    offset += 4;

    // Session ID length (4 bytes)
    frame.writeUInt32BE(sessionIdBuffer.length, offset);
    offset += 4;

    // Session ID
    sessionIdBuffer.copy(frame, offset);
    offset += sessionIdBuffer.length;

    // Payload length (4 bytes)
    frame.writeUInt32BE(payloadBuffer.length, offset);
    offset += 4;

    // Payload
    payloadBuffer.copy(frame, offset);

    return frame;
  }

  /**
   * 构建 FinishConnection 请求帧
   */
  static buildFinishConnectionFrame(): Buffer {
    const payload = '{}';
    const payloadBuffer = Buffer.from(payload, 'utf-8');

    // Header (4 bytes) + EventType (4 bytes) + PayloadLen (4 bytes) + Payload
    const totalLength = 4 + 4 + 4 + payloadBuffer.length;
    const frame = Buffer.alloc(totalLength);

    let offset = 0;

    // Byte 0: Protocol version (0b0001) | Header size (0b0001)
    frame.writeUInt8(0b00010001, offset++);

    // Byte 1: Message type (0b1001 Full-client request) | Message flags (0b0100 with event number)
    frame.writeUInt8(0b10010100, offset++);

    // Byte 2: Serialization method (0b0001 JSON) | Compression method (0b0000 none)
    frame.writeUInt8(0b00010000, offset++);

    // Byte 3: Reserved
    frame.writeUInt8(0b00000000, offset++);

    // Event type (4 bytes) - FinishConnection = 2
    frame.writeUInt32BE(EventType.FINISH_CONNECTION, offset);
    offset += 4;

    // Payload length (4 bytes)
    frame.writeUInt32BE(payloadBuffer.length, offset);
    offset += 4;

    // Payload
    payloadBuffer.copy(frame, offset);

    return frame;
  }

  /**
   * 解析响应帧
   */
  static parseResponseFrame(data: Buffer): ParsedFrame {
    if (data.length < 4) {
      throw new Error('Invalid frame: too short');
    }

    let offset = 0;

    // Byte 0
    const byte0 = data.readUInt8(offset++);
    const protocolVersion = (byte0 >> 4) & 0x0f;
    const headerSize = (byte0 & 0x0f) * 4;

    // Byte 1
    const byte1 = data.readUInt8(offset++);
    const messageType = (byte1 >> 4) & 0x0f;
    const messageFlags = byte1 & 0x0f;

    // Byte 2
    const byte2 = data.readUInt8(offset++);
    const serializationMethod = (byte2 >> 4) & 0x0f;
    const compressionMethod = byte2 & 0x0f;

    // Byte 3: Reserved
    offset++;

    const result: ParsedFrame = {
      protocolVersion,
      headerSize,
      messageType,
      messageFlags,
      serializationMethod,
      compressionMethod,
    };

    // 检查是否是错误帧
    if (messageType === (MessageType.ERROR_RESPONSE as number)) {
      // 错误帧: [4~7] 是错误码
      if (data.length >= offset + 4) {
        result.errorCode = data.readUInt32BE(offset);
        offset += 4;

        // 剩余部分是错误消息
        if (data.length > offset) {
          let payloadBuffer = data.subarray(offset);
          if (compressionMethod === (CompressionMethod.GZIP as number)) {
            payloadBuffer = zlib.gunzipSync(payloadBuffer);
          }

          if (serializationMethod === (SerializationMethod.JSON as number)) {
            try {
              result.payload = JSON.parse(
                payloadBuffer.toString('utf-8'),
              ) as Record<string, unknown>;
            } catch {
              result.payload = payloadBuffer;
            }
          } else {
            result.payload = payloadBuffer;
          }
        }
      }
      return result;
    }

    // 正常响应帧
    // 检查是否有 event number (messageFlags & 0b0100)
    if (messageFlags & 0b0100) {
      if (data.length >= offset + 4) {
        result.eventType = data.readUInt32BE(offset);
        offset += 4;
      }
    }

    // 读取 session ID 长度和 session ID
    if (data.length >= offset + 4) {
      const sessionIdLen = data.readUInt32BE(offset);
      offset += 4;

      if (data.length >= offset + sessionIdLen) {
        result.sessionId = data
          .subarray(offset, offset + sessionIdLen)
          .toString('utf-8');
        offset += sessionIdLen;
      }
    }

    // 读取 payload 长度和 payload
    if (data.length >= offset + 4) {
      const payloadLen = data.readUInt32BE(offset);
      offset += 4;

      if (data.length >= offset + payloadLen && payloadLen > 0) {
        let payloadBuffer = data.subarray(offset, offset + payloadLen);

        if (compressionMethod === (CompressionMethod.GZIP as number)) {
          payloadBuffer = zlib.gunzipSync(payloadBuffer);
        }

        // 根据 message type 判断是音频还是 JSON
        if (messageType === (MessageType.AUDIO_ONLY_RESPONSE as number)) {
          // 音频帧 - payload 可能是 JSON 元数据或者音频数据
          if (result.eventType === EventType.PODCAST_ROUND_RESPONSE) {
            // 音频数据
            result.payload = payloadBuffer;
          } else if (
            serializationMethod === (SerializationMethod.JSON as number)
          ) {
            try {
              result.payload = JSON.parse(
                payloadBuffer.toString('utf-8'),
              ) as Record<string, unknown>;
            } catch {
              result.payload = payloadBuffer;
            }
          } else {
            result.payload = payloadBuffer;
          }
        } else if (
          serializationMethod === (SerializationMethod.JSON as number)
        ) {
          try {
            result.payload = JSON.parse(
              payloadBuffer.toString('utf-8'),
            ) as Record<string, unknown>;
          } catch {
            result.payload = payloadBuffer;
          }
        } else {
          result.payload = payloadBuffer;
        }
      }
    }

    return result;
  }

  /**
   * 获取 Event 类型名称
   */
  static getEventName(eventType: number): string {
    const eventNames: Record<number, string> = {
      [EventType.FINISH_CONNECTION]: 'FinishConnection',
      [EventType.CONNECTION_FINISHED]: 'ConnectionFinished',
      [EventType.SESSION_STARTED]: 'SessionStarted',
      [EventType.SESSION_FINISHED]: 'SessionFinished',
      [EventType.USAGE_RESPONSE]: 'UsageResponse',
      [EventType.PODCAST_ROUND_START]: 'PodcastRoundStart',
      [EventType.PODCAST_ROUND_RESPONSE]: 'PodcastRoundResponse',
      [EventType.PODCAST_ROUND_END]: 'PodcastRoundEnd',
      [EventType.PODCAST_END]: 'PodcastEnd',
    };
    return eventNames[eventType] || `Unknown(${eventType})`;
  }
}
