/**
 * 字幕数据结构
 */
export interface SubtitleEntry {
  index: number;
  startTime: number;
  endTime: number;
  speaker: string;
  text: string;
  roundId: number;
}

/**
 * 播客详细信息结构
 */
export interface PodcastInfo {
  totalDuration: number;
  totalRounds: number;
  speakers: string[];
  subtitles: SubtitleEntry[];
  usage?: {
    inputTextTokens: number;
    outputAudioTokens: number;
  };
}

/**
 * 字幕配置
 */
export interface SubtitleConfig {
  /** 每条字幕的最大字符数（中文约15-20字为宜） */
  maxCharsPerLine: number;
  /** 每条字幕的最大时长（秒） */
  maxDurationPerSubtitle: number;
  /** 最小时长（秒），避免字幕闪过太快 */
  minDurationPerSubtitle: number;
}

const DEFAULT_SUBTITLE_CONFIG: SubtitleConfig = {
  maxCharsPerLine: 25,
  maxDurationPerSubtitle: 6,
  minDurationPerSubtitle: 1.5,
};

/**
 * 分割文本为多个短句
 * 按标点符号分割，确保每句不超过最大字符数
 */
export function splitTextIntoSegments(
  text: string,
  maxChars: number = DEFAULT_SUBTITLE_CONFIG.maxCharsPerLine,
): string[] {
  if (!text || text.length <= maxChars) {
    return text ? [text] : [];
  }

  const segments: string[] = [];

  // 按句子分隔符分割（中文和英文标点）
  const sentenceDelimiters = /([。！？；.!?;，,])/;
  const parts = text.split(sentenceDelimiters);

  let currentSegment = '';

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    // 如果是分隔符，附加到当前片段
    if (sentenceDelimiters.test(part)) {
      currentSegment += part;
      continue;
    }

    // 如果当前片段加上新部分不超过限制
    if (currentSegment.length + part.length <= maxChars) {
      currentSegment += part;
    } else {
      // 保存当前片段（如果有内容）
      if (currentSegment.trim()) {
        segments.push(currentSegment.trim());
      }

      // 如果单个部分就超过限制，需要进一步分割
      if (part.length > maxChars) {
        const subParts = splitLongText(part, maxChars);
        segments.push(...subParts.slice(0, -1));
        currentSegment = subParts[subParts.length - 1] || '';
      } else {
        currentSegment = part;
      }
    }
  }

  // 添加最后一个片段
  if (currentSegment.trim()) {
    segments.push(currentSegment.trim());
  }

  return segments.filter((s) => s.length > 0);
}

/**
 * 分割超长文本（无标点或标点间距太大）
 */
function splitLongText(text: string, maxChars: number): string[] {
  const segments: string[] = [];
  let remaining = text;

  while (remaining.length > maxChars) {
    // 尝试在空格或自然断点处分割
    let splitIndex = maxChars;

    // 优先在空格处分割
    const lastSpace = remaining.lastIndexOf(' ', maxChars);
    if (lastSpace > maxChars * 0.5) {
      splitIndex = lastSpace;
    }

    segments.push(remaining.substring(0, splitIndex).trim());
    remaining = remaining.substring(splitIndex).trim();
  }

  if (remaining) {
    segments.push(remaining);
  }

  return segments;
}

/**
 * 字幕管理器类
 */
export class SubtitleManager {
  private subtitles: SubtitleEntry[] = [];
  private currentSubtitleIndex = 1;
  private totalDuration = 0;
  private currentStartTime = 0;
  private speakers = new Set<string>();
  private usageInfo?: { inputTextTokens: number; outputAudioTokens: number };
  private config: SubtitleConfig;

  // 临时存储每轮的原始文本，用于后续根据时长分配
  private pendingRounds: Map<
    number,
    { speaker: string; text: string; segments: string[] }
  > = new Map();

  constructor(config?: Partial<SubtitleConfig>) {
    this.config = { ...DEFAULT_SUBTITLE_CONFIG, ...config };
  }

  /**
   * 添加字幕条目（先分割文本，等待时长信息后再分配时间）
   */
  addSubtitleEntry(
    speaker: string,
    text: string,
    roundId: number,
  ): SubtitleEntry | null {
    this.speakers.add(speaker);

    // 分割文本为多个短句
    const segments = splitTextIntoSegments(text, this.config.maxCharsPerLine);

    if (segments.length === 0) {
      return null;
    }

    // 暂存分割后的文本，等待时长信息
    this.pendingRounds.set(roundId, { speaker, text, segments });

    // 返回占位符（第一个片段），实际字幕会在 updateSubtitleEndTime 时创建
    return {
      index: this.currentSubtitleIndex,
      startTime: this.currentStartTime,
      endTime: this.currentStartTime,
      speaker,
      text: segments[0],
      roundId,
    };
  }

  /**
   * 更新字幕条目的结束时间，并根据时长分配多条字幕
   */
  updateSubtitleEndTime(roundId: number, duration: number): void {
    const pendingRound = this.pendingRounds.get(roundId);

    if (pendingRound) {
      const { speaker, segments } = pendingRound;

      // 根据字符数比例分配时间
      const totalChars = segments.reduce((sum, s) => sum + s.length, 0);
      let segmentStartTime = this.currentStartTime;

      for (const segment of segments) {
        // 按字符比例计算时长
        let segmentDuration = (segment.length / totalChars) * duration;

        // 应用时长限制
        segmentDuration = Math.max(
          this.config.minDurationPerSubtitle,
          Math.min(this.config.maxDurationPerSubtitle, segmentDuration),
        );

        const subtitle: SubtitleEntry = {
          index: this.currentSubtitleIndex++,
          startTime: segmentStartTime,
          endTime: segmentStartTime + segmentDuration,
          speaker,
          text: segment,
          roundId,
        };

        this.subtitles.push(subtitle);
        segmentStartTime = subtitle.endTime;
      }

      // 修正最后一条字幕的结束时间，确保与实际音频时长对齐
      if (this.subtitles.length > 0) {
        const lastSubtitle = this.subtitles[this.subtitles.length - 1];
        if (lastSubtitle.roundId === roundId) {
          lastSubtitle.endTime = this.currentStartTime + duration;
        }
      }

      this.pendingRounds.delete(roundId);
    }

    // 累加时间
    this.totalDuration += duration;
    this.currentStartTime += duration;
  }

  /**
   * 计算均匀分布的字幕时间
   * 当 API 无法提供每轮具体时长时，按字幕条数均匀分布总时长
   */
  distributeSubtitleTimes(totalDuration: number): void {
    const count = this.subtitles.length;
    if (count === 0) {
      this.totalDuration = totalDuration;
      return;
    }

    // 每条字幕分配的时长（秒）
    const timePerSubtitle = totalDuration / count;
    let currentTime = 0;

    for (const subtitle of this.subtitles) {
      subtitle.startTime = currentTime;
      subtitle.endTime = currentTime + timePerSubtitle;
      currentTime += timePerSubtitle;
    }

    this.totalDuration = totalDuration;
    this.currentStartTime = totalDuration;
  }

  /**
   * 设置使用情况信息
   */
  setUsageInfo(usage: {
    inputTextTokens: number;
    outputAudioTokens: number;
  }): void {
    this.usageInfo = usage;
  }

  /**
   * 获取字幕列表
   */
  getSubtitles(): SubtitleEntry[] {
    return this.subtitles;
  }

  /**
   * 获取说话人列表
   */
  getSpeakers(): string[] {
    return Array.from(this.speakers);
  }

  /**
   * 获取总时长
   */
  getTotalDuration(): number {
    return this.totalDuration;
  }

  /**
   * 获取播客信息
   */
  getPodcastInfo(): PodcastInfo {
    return {
      totalDuration: this.totalDuration,
      totalRounds: this.subtitles.length,
      speakers: Array.from(this.speakers),
      subtitles: this.subtitles,
      usage: this.usageInfo,
    };
  }

  /**
   * 重置管理器状态
   */
  reset(): void {
    this.subtitles = [];
    this.currentSubtitleIndex = 1;
    this.totalDuration = 0;
    this.currentStartTime = 0;
    this.speakers.clear();
    this.usageInfo = undefined;
    this.pendingRounds.clear();
  }
}

/**
 * 时间格式化函数（SRT格式）
 */
export function formatSRTTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const milliseconds = Math.floor((seconds % 1) * 1000);

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${milliseconds.toString().padStart(3, '0')}`;
}

/**
 * 生成SRT字幕内容
 */
export function generateSRT(subtitles: SubtitleEntry[]): string {
  return subtitles
    .filter((s) => s.text) // 过滤掉没有文本的条目
    .map(
      (subtitle) =>
        `${subtitle.index}\n${formatSRTTime(subtitle.startTime)} --> ${formatSRTTime(subtitle.endTime)}\n${subtitle.text}\n`,
    )
    .join('\n');
}
