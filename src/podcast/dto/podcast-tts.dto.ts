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
  sampleRate?: number = 24000;

  @IsOptional()
  @IsNumber()
  speechRate?: number = 0;
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
  inputUrl?: string;

  @IsOptional()
  @IsBoolean()
  onlyNlpText?: boolean;

  @IsOptional()
  @IsBoolean()
  returnAudioUrl?: boolean;

  @IsOptional()
  @IsNumber()
  inputTextMaxLength?: number;
}

export class SpeakerInfoDto {
  @IsOptional()
  @IsBoolean()
  randomOrder?: boolean = true;

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
  contentProducer?: string;

  @IsOptional()
  @IsString()
  produceId?: string;

  @IsOptional()
  @IsString()
  contentPropagator?: string;

  @IsOptional()
  @IsString()
  propagateId?: string;
}

export class CreatePodcastDto {
  @IsOptional()
  @IsString()
  inputId?: string;

  @IsNumber()
  @IsEnum(ActionType)
  action: ActionType;

  @IsOptional()
  @IsString()
  inputText?: string;

  @IsOptional()
  @IsString()
  promptText?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NlpTextDto)
  nlpTexts?: NlpTextDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => InputInfoDto)
  inputInfo?: InputInfoDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => AudioConfigDto)
  audioConfig?: AudioConfigDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => SpeakerInfoDto)
  speakerInfo?: SpeakerInfoDto;

  @IsOptional()
  @IsBoolean()
  useHeadMusic?: boolean = false;

  @IsOptional()
  @IsBoolean()
  useTailMusic?: boolean = false;

  @IsOptional()
  @IsBoolean()
  aigcWatermark?: boolean = false;

  @IsOptional()
  @ValidateNested()
  @Type(() => AigcMetadataDto)
  aigcMetadata?: AigcMetadataDto;

  @IsUrl()
  callbackUrl: string;

  @IsOptional()
  @IsBoolean()
  debugMode?: boolean = false;
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
  taskId: string;
  inputId?: string;
  status: 'success' | 'failed';
  audioUrl?: string;
  subtitleUrl?: string;
  roundAudios?: Array<{ roundId: number; speaker: string; audioUrl: string }>;
  podcastInfo?: PodcastInfoDetail;
  usage?: UsageInfo;
  errorMessage?: string;
  duration?: number;
}
