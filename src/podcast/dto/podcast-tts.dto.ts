import {
  IsString,
  IsNumber,
  IsBoolean,
  IsOptional,
  IsArray,
  ValidateNested,
  IsUrl,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum AudioFormat {
  MP3 = 'mp3',
  OGG_OPUS = 'ogg_opus',
  PCM = 'pcm',
  AAC = 'aac',
}

export enum ActionType {
  /** 根据提供的 input_text 或者 input_info.input_url 总结生成播客 */
  SUMMARIZE = 0,
  /** 根据提供的 nlp_texts 对话文本直接生成播客 */
  DIALOGUE = 3,
  /** 根据提供的 prompt_text 文本扩展生成播客 */
  PROMPT = 4,
}

export class AudioConfigDto {
  @IsOptional()
  @IsEnum(AudioFormat)
  format?: AudioFormat = AudioFormat.MP3;

  @IsOptional()
  @IsNumber()
  sample_rate?: number = 24000;

  @IsOptional()
  @IsNumber()
  speech_rate?: number = 0;
}

export class NlpTextDto {
  @IsString()
  speaker: string;

  @IsString()
  text: string;
}

export class InputInfoDto {
  @IsOptional()
  @IsString()
  input_url?: string;

  @IsOptional()
  @IsBoolean()
  only_nlp_text?: boolean;

  @IsOptional()
  @IsBoolean()
  return_audio_url?: boolean;

  @IsOptional()
  @IsNumber()
  input_text_max_length?: number;
}

export class SpeakerInfoDto {
  @IsOptional()
  @IsBoolean()
  random_order?: boolean = true;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  speakers?: string[];
}

export class AigcMetadataDto {
  @IsOptional()
  @IsBoolean()
  enable?: boolean = false;

  @IsOptional()
  @IsString()
  content_producer?: string;

  @IsOptional()
  @IsString()
  produce_id?: string;

  @IsOptional()
  @IsString()
  content_propagator?: string;

  @IsOptional()
  @IsString()
  propagate_id?: string;
}

export class CreatePodcastDto {
  @IsOptional()
  @IsString()
  input_id?: string;

  @IsNumber()
  @IsEnum(ActionType)
  action: ActionType;

  @IsOptional()
  @IsString()
  input_text?: string;

  @IsOptional()
  @IsString()
  prompt_text?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NlpTextDto)
  nlp_texts?: NlpTextDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => InputInfoDto)
  input_info?: InputInfoDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => AudioConfigDto)
  audio_config?: AudioConfigDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => SpeakerInfoDto)
  speaker_info?: SpeakerInfoDto;

  @IsOptional()
  @IsBoolean()
  use_head_music?: boolean = false;

  @IsOptional()
  @IsBoolean()
  use_tail_music?: boolean = false;

  @IsOptional()
  @IsBoolean()
  aigc_watermark?: boolean = false;

  @IsOptional()
  @ValidateNested()
  @Type(() => AigcMetadataDto)
  aigc_metadata?: AigcMetadataDto;

  @IsUrl()
  callback_url: string;
}

export interface UsageInfo {
  inputTextTokens: number;
  outputAudioTokens: number;
}

export interface PodcastInfoDetail {
  totalDuration: number;
  totalRounds: number;
  speakers: string[];
  usage?: UsageInfo;
}

export class PodcastCallbackPayload {
  task_id: string;
  status: 'success' | 'failed';
  audio_url?: string;
  subtitle_url?: string;
  round_audios?: Array<{ roundId: number; speaker: string; audioUrl: string }>;
  podcast_info?: PodcastInfoDetail;
  usage?: UsageInfo;
  error_message?: string;
  duration?: number;
}
