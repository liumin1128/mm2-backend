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
 * 字幕管理器类
 */
export class SubtitleManager {
  private subtitles: SubtitleEntry[] = [];
  private currentSubtitleIndex = 1;
  private totalDuration = 0;
  private currentStartTime = 0;
  private speakers = new Set<string>();
  private usageInfo?: { inputTextTokens: number; outputAudioTokens: number };

  /**
   * 添加字幕条目
   */
  addSubtitleEntry(
    speaker: string,
    text: string,
    roundId: number,
  ): SubtitleEntry {
    this.speakers.add(speaker);

    const subtitleEntry: SubtitleEntry = {
      index: this.currentSubtitleIndex++,
      startTime: this.currentStartTime,
      endTime: this.currentStartTime, // 临时值，稍后更新
      speaker,
      text,
      roundId,
    };

    this.subtitles.push(subtitleEntry);
    return subtitleEntry;
  }

  /**
   * 更新字幕条目的结束时间
   */
  updateSubtitleEndTime(roundId: number, duration: number): void {
    const subtitle = this.subtitles.find((s) => s.roundId === roundId);
    if (subtitle) {
      subtitle.endTime = this.currentStartTime + duration;
      this.totalDuration += duration;
      this.currentStartTime += duration;
    } else {
      // 没有字幕条目的轮次（如音乐）也要累加时间
      this.totalDuration += duration;
      this.currentStartTime += duration;
    }
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
