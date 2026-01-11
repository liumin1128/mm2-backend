import { v4 as uuidv4 } from 'uuid';
import * as zlib from 'zlib';

/**
 * 火山引擎播客TTS WebSocket二进制协议工具类
 * 协议文档: https://www.volcengine.com/docs/6561/1668014
 * 参考实现: volcengine_podcasts_demo/src/protocols.ts
 */

// Event 类型定义
export enum EventType {
  // 无事件
  NONE = 0,

  // 上行连接事件 (1-99)
  START_CONNECTION = 1,
  FINISH_CONNECTION = 2,

  // 下行连接事件 (50-99)
  CONNECTION_STARTED = 50,
  CONNECTION_FAILED = 51,
  CONNECTION_FINISHED = 52,

  // 上行会话事件 (100-149)
  START_SESSION = 100,
  CANCEL_SESSION = 101,
  FINISH_SESSION = 102,

  // 下行会话事件 (150-199)
  SESSION_STARTED = 150,
  SESSION_CANCELED = 151,
  SESSION_FINISHED = 152,
  SESSION_FAILED = 153,
  USAGE_RESPONSE = 154,

  // 播客事件 (360-369)
  PODCAST_ROUND_START = 360,
  PODCAST_ROUND_RESPONSE = 361,
  PODCAST_ROUND_END = 362,
  PODCAST_END = 363,
}

// Message Type 定义
export enum MsgType {
  INVALID = 0,
  FULL_CLIENT_REQUEST = 0b0001,
  AUDIO_ONLY_CLIENT = 0b0010,
  FULL_SERVER_RESPONSE = 0b1001,
  AUDIO_ONLY_SERVER = 0b1011,
  FRONT_END_RESULT_SERVER = 0b1100,
  ERROR = 0b1111,
}

// Message Type Flag 定义
export enum MsgTypeFlagBits {
  NO_SEQ = 0,
  POSITIVE_SEQ = 0b0001,
  LAST_NO_SEQ = 0b0010,
  NEGATIVE_SEQ = 0b0011,
  WITH_EVENT = 0b0100,
}

// Version 定义
export enum VersionBits {
  VERSION_1 = 1,
}

// Header Size 定义
export enum HeaderSizeBits {
  HEADER_SIZE_4 = 1,
}

// Serialization Method 定义
export enum SerializationBits {
  RAW = 0,
  JSON = 0b0001,
  THRIFT = 0b0011,
  CUSTOM = 0b1111,
}

// Compression Method 定义
export enum CompressionBits {
  NONE = 0,
  GZIP = 0b0001,
  CUSTOM = 0b1111,
}

/**
 * 协议消息结构
 */
export interface Message {
  version: VersionBits;
  headerSize: HeaderSizeBits;
  type: MsgType;
  flag: MsgTypeFlagBits;
  serialization: SerializationBits;
  compression: CompressionBits;
  event?: EventType;
  sessionId?: string;
  connectId?: string;
  sequence?: number;
  errorCode?: number;
  payload: Uint8Array;
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
  round_type?: string;
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

/**
 * 获取事件类型名称
 */
export function getEventTypeName(eventType: EventType): string {
  return EventType[eventType] || `invalid event type: ${eventType}`;
}

/**
 * 获取消息类型名称
 */
export function getMsgTypeName(msgType: MsgType): string {
  return MsgType[msgType] || `invalid message type: ${msgType}`;
}

/**
 * 创建消息对象
 */
export function createMessage(
  msgType: MsgType,
  flag: MsgTypeFlagBits,
): Message {
  return {
    type: msgType,
    flag: flag,
    version: VersionBits.VERSION_1,
    headerSize: HeaderSizeBits.HEADER_SIZE_4,
    serialization: SerializationBits.JSON,
    compression: CompressionBits.NONE,
    payload: new Uint8Array(0),
  };
}

/**
 * 消息序列化
 */
export function marshalMessage(msg: Message): Uint8Array {
  const buffers: Uint8Array[] = [];

  // 构建基础 header (4 bytes)
  const headerSize = 4 * msg.headerSize;
  const header = new Uint8Array(headerSize);

  header[0] = (msg.version << 4) | msg.headerSize;
  header[1] = (msg.type << 4) | msg.flag;
  header[2] = (msg.serialization << 4) | msg.compression;
  header[3] = 0; // Reserved

  buffers.push(header);

  // 根据消息类型和标志写入字段
  const writers = getWriters(msg);
  for (const writer of writers) {
    const data = writer(msg);
    if (data) buffers.push(data);
  }

  // 合并所有缓冲区
  const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const buf of buffers) {
    result.set(buf, offset);
    offset += buf.length;
  }

  return result;
}

/**
 * 消息反序列化
 */
export function unmarshalMessage(data: Uint8Array): Message {
  if (data.length < 3) {
    throw new Error(
      `data too short: expected at least 3 bytes, got ${data.length}`,
    );
  }

  let offset = 0;

  // 读取基础 header
  const versionAndHeaderSize = data[offset++];
  const typeAndFlag = data[offset++];
  const serializationAndCompression = data[offset++];

  const msg: Message = {
    version: ((versionAndHeaderSize >> 4) & 0x0f) as VersionBits,
    headerSize: (versionAndHeaderSize & 0x0f) as HeaderSizeBits,
    type: ((typeAndFlag >> 4) & 0x0f) as MsgType,
    flag: (typeAndFlag & 0x0f) as MsgTypeFlagBits,
    serialization: ((serializationAndCompression >> 4) &
      0x0f) as SerializationBits,
    compression: (serializationAndCompression & 0x0f) as CompressionBits,
    payload: new Uint8Array(0),
  };

  // 跳过剩余的 header 字节
  offset = 4 * msg.headerSize;

  // 根据消息类型和标志读取字段
  const readers = getReaders(msg);
  for (const reader of readers) {
    offset = reader(msg, data, offset);
  }

  return msg;
}

// ============= 内部辅助函数 =============

function getWriters(msg: Message): Array<(msg: Message) => Uint8Array | null> {
  const writers: Array<(msg: Message) => Uint8Array | null> = [];

  if (msg.flag === MsgTypeFlagBits.WITH_EVENT) {
    writers.push(writeEvent, writeSessionId);
  }

  switch (msg.type) {
    case MsgType.AUDIO_ONLY_CLIENT:
    case MsgType.AUDIO_ONLY_SERVER:
    case MsgType.FRONT_END_RESULT_SERVER:
    case MsgType.FULL_CLIENT_REQUEST:
    case MsgType.FULL_SERVER_RESPONSE:
      if (
        msg.flag === MsgTypeFlagBits.POSITIVE_SEQ ||
        msg.flag === MsgTypeFlagBits.NEGATIVE_SEQ
      ) {
        writers.push(writeSequence);
      }
      break;
    case MsgType.ERROR:
      writers.push(writeErrorCode);
      break;
    default:
      throw new Error(`unsupported message type: ${msg.type}`);
  }

  writers.push(writePayload);
  return writers;
}

function getReaders(
  msg: Message,
): Array<(msg: Message, data: Uint8Array, offset: number) => number> {
  const readers: Array<
    (msg: Message, data: Uint8Array, offset: number) => number
  > = [];

  switch (msg.type) {
    case MsgType.AUDIO_ONLY_CLIENT:
    case MsgType.AUDIO_ONLY_SERVER:
    case MsgType.FRONT_END_RESULT_SERVER:
    case MsgType.FULL_CLIENT_REQUEST:
    case MsgType.FULL_SERVER_RESPONSE:
      if (
        msg.flag === MsgTypeFlagBits.POSITIVE_SEQ ||
        msg.flag === MsgTypeFlagBits.NEGATIVE_SEQ
      ) {
        readers.push(readSequence);
      }
      break;
    case MsgType.ERROR:
      readers.push(readErrorCode);
      break;
    default:
      throw new Error(`unsupported message type: ${msg.type}`);
  }

  if (msg.flag === MsgTypeFlagBits.WITH_EVENT) {
    readers.push(readEvent, readSessionId, readConnectId);
  }

  readers.push(readPayload);
  return readers;
}

// Writer 函数
function writeEvent(msg: Message): Uint8Array | null {
  if (msg.event === undefined) return null;
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setInt32(0, msg.event, false);
  return new Uint8Array(buffer);
}

function writeSessionId(msg: Message): Uint8Array | null {
  if (msg.event === undefined) return null;

  switch (msg.event) {
    case EventType.START_CONNECTION:
    case EventType.FINISH_CONNECTION:
    case EventType.CONNECTION_STARTED:
    case EventType.CONNECTION_FAILED:
      return null;
  }

  const sessionId = msg.sessionId || '';
  const sessionIdBytes = Buffer.from(sessionId, 'utf8');
  const sizeBuffer = new ArrayBuffer(4);
  const sizeView = new DataView(sizeBuffer);
  sizeView.setUint32(0, sessionIdBytes.length, false);

  const result = new Uint8Array(4 + sessionIdBytes.length);
  result.set(new Uint8Array(sizeBuffer), 0);
  result.set(sessionIdBytes, 4);

  return result;
}

function writeSequence(msg: Message): Uint8Array | null {
  if (msg.sequence === undefined) return null;
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setInt32(0, msg.sequence, false);
  return new Uint8Array(buffer);
}

function writeErrorCode(msg: Message): Uint8Array | null {
  if (msg.errorCode === undefined) return null;
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setUint32(0, msg.errorCode, false);
  return new Uint8Array(buffer);
}

function writePayload(msg: Message): Uint8Array | null {
  const payloadSize = msg.payload.length;
  const sizeBuffer = new ArrayBuffer(4);
  const sizeView = new DataView(sizeBuffer);
  sizeView.setUint32(0, payloadSize, false);

  const result = new Uint8Array(4 + payloadSize);
  result.set(new Uint8Array(sizeBuffer), 0);
  result.set(msg.payload, 4);

  return result;
}

// Reader 函数
function readEvent(msg: Message, data: Uint8Array, offset: number): number {
  if (offset + 4 > data.length) {
    throw new Error('insufficient data for event');
  }
  const view = new DataView(data.buffer, data.byteOffset + offset, 4);
  msg.event = view.getInt32(0, false);
  return offset + 4;
}

function readSessionId(msg: Message, data: Uint8Array, offset: number): number {
  if (msg.event === undefined) return offset;

  switch (msg.event) {
    case EventType.START_CONNECTION:
    case EventType.FINISH_CONNECTION:
    case EventType.CONNECTION_STARTED:
    case EventType.CONNECTION_FAILED:
    case EventType.CONNECTION_FINISHED:
      return offset;
  }

  if (offset + 4 > data.length) {
    throw new Error('insufficient data for session ID size');
  }

  const view = new DataView(data.buffer, data.byteOffset + offset, 4);
  const size = view.getUint32(0, false);
  offset += 4;

  if (size > 0) {
    if (offset + size > data.length) {
      throw new Error('insufficient data for session ID');
    }
    msg.sessionId = new TextDecoder().decode(data.slice(offset, offset + size));
    offset += size;
  }

  return offset;
}

function readConnectId(msg: Message, data: Uint8Array, offset: number): number {
  if (msg.event === undefined) return offset;

  switch (msg.event) {
    case EventType.CONNECTION_STARTED:
    case EventType.CONNECTION_FAILED:
    case EventType.CONNECTION_FINISHED:
      break;
    default:
      return offset;
  }

  if (offset + 4 > data.length) {
    throw new Error('insufficient data for connect ID size');
  }

  const view = new DataView(data.buffer, data.byteOffset + offset, 4);
  const size = view.getUint32(0, false);
  offset += 4;

  if (size > 0) {
    if (offset + size > data.length) {
      throw new Error('insufficient data for connect ID');
    }
    msg.connectId = new TextDecoder().decode(data.slice(offset, offset + size));
    offset += size;
  }

  return offset;
}

function readSequence(msg: Message, data: Uint8Array, offset: number): number {
  if (offset + 4 > data.length) {
    throw new Error('insufficient data for sequence');
  }
  const view = new DataView(data.buffer, data.byteOffset + offset, 4);
  msg.sequence = view.getInt32(0, false);
  return offset + 4;
}

function readErrorCode(msg: Message, data: Uint8Array, offset: number): number {
  if (offset + 4 > data.length) {
    throw new Error('insufficient data for error code');
  }
  const view = new DataView(data.buffer, data.byteOffset + offset, 4);
  msg.errorCode = view.getUint32(0, false);
  return offset + 4;
}

function readPayload(msg: Message, data: Uint8Array, offset: number): number {
  if (offset + 4 > data.length) {
    throw new Error('insufficient data for payload size');
  }

  const view = new DataView(data.buffer, data.byteOffset + offset, 4);
  const size = view.getUint32(0, false);
  offset += 4;

  if (size > 0) {
    if (offset + size > data.length) {
      throw new Error('insufficient data for payload');
    }
    msg.payload = data.slice(offset, offset + size);
    offset += size;
  }

  return offset;
}

/**
 * 播客协议工具类
 */
export class PodcastProtocol {
  /**
   * 生成唯一的 Session ID
   */
  static generateSessionId(): string {
    return uuidv4();
  }

  /**
   * 构建 StartConnection 请求帧
   */
  static buildStartConnectionFrame(): Buffer {
    const msg = createMessage(
      MsgType.FULL_CLIENT_REQUEST,
      MsgTypeFlagBits.WITH_EVENT,
    );
    msg.event = EventType.START_CONNECTION;
    msg.payload = new TextEncoder().encode('{}');
    const data = marshalMessage(msg);
    return Buffer.from(data);
  }

  /**
   * 构建 StartSession 请求帧
   */
  static buildStartSessionFrame(sessionId: string, payload: object): Buffer {
    const msg = createMessage(
      MsgType.FULL_CLIENT_REQUEST,
      MsgTypeFlagBits.WITH_EVENT,
    );
    msg.event = EventType.START_SESSION;
    msg.sessionId = sessionId;
    msg.payload = new TextEncoder().encode(JSON.stringify(payload));
    const data = marshalMessage(msg);
    return Buffer.from(data);
  }

  /**
   * 构建 FinishSession 请求帧
   */
  static buildFinishSessionFrame(sessionId: string): Buffer {
    const msg = createMessage(
      MsgType.FULL_CLIENT_REQUEST,
      MsgTypeFlagBits.WITH_EVENT,
    );
    msg.event = EventType.FINISH_SESSION;
    msg.sessionId = sessionId;
    msg.payload = new TextEncoder().encode('{}');
    const data = marshalMessage(msg);
    return Buffer.from(data);
  }

  /**
   * 构建 FinishConnection 请求帧
   */
  static buildFinishConnectionFrame(): Buffer {
    const msg = createMessage(
      MsgType.FULL_CLIENT_REQUEST,
      MsgTypeFlagBits.WITH_EVENT,
    );
    msg.event = EventType.FINISH_CONNECTION;
    msg.payload = new TextEncoder().encode('{}');
    const data = marshalMessage(msg);
    return Buffer.from(data);
  }

  /**
   * 解析响应帧
   */
  static parseResponseFrame(data: Buffer): ParsedFrame {
    const uint8Data = new Uint8Array(data.buffer, data.byteOffset, data.length);
    const msg = unmarshalMessage(uint8Data);

    const result: ParsedFrame = {
      protocolVersion: msg.version,
      headerSize: msg.headerSize * 4,
      messageType: msg.type,
      messageFlags: msg.flag,
      serializationMethod: msg.serialization,
      compressionMethod: msg.compression,
      eventType: msg.event,
      sessionId: msg.sessionId,
      errorCode: msg.errorCode,
    };

    // 处理 payload
    if (msg.type === MsgType.ERROR) {
      // 错误帧
      let payloadBuffer = Buffer.from(msg.payload);
      if (msg.compression === CompressionBits.GZIP) {
        payloadBuffer = zlib.gunzipSync(payloadBuffer);
      }
      if (msg.serialization === SerializationBits.JSON) {
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
    } else if (msg.payload.length > 0) {
      let payloadBuffer = Buffer.from(msg.payload);
      if (msg.compression === CompressionBits.GZIP) {
        payloadBuffer = zlib.gunzipSync(payloadBuffer);
      }

      // 根据事件类型判断是音频还是 JSON
      if (msg.event === EventType.PODCAST_ROUND_RESPONSE) {
        // 音频数据
        result.payload = payloadBuffer;
      } else if (msg.serialization === SerializationBits.JSON) {
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

    return result;
  }

  /**
   * 获取 Event 类型名称
   */
  static getEventName(eventType: number): string {
    return EventType[eventType] || `Unknown(${eventType})`;
  }
}
