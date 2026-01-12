describe('Podcast DTOs - Basic Types', () => {
  // ActionType 枚举值
  const ActionType = {
    SUMMARIZE: 0,
    DIALOGUE: 3,
    PROMPT: 4,
  };

  // AudioFormat 枚举值
  const AudioFormat = {
    MP3: 'mp3',
    OGG_OPUS: 'ogg_opus',
    PCM: 'pcm',
    AAC: 'aac',
  };
  describe('ActionType enum', () => {
    it('should have SUMMARIZE value of 0', () => {
      expect(ActionType.SUMMARIZE).toBe(0);
    });

    it('should have DIALOGUE value of 3', () => {
      expect(ActionType.DIALOGUE).toBe(3);
    });

    it('should have PROMPT value of 4', () => {
      expect(ActionType.PROMPT).toBe(4);
    });
  });

  describe('AudioFormat enum', () => {
    it('should support MP3 format', () => {
      expect(AudioFormat.MP3).toBe('mp3');
    });

    it('should support OGG_OPUS format', () => {
      expect(AudioFormat.OGG_OPUS).toBe('ogg_opus');
    });

    it('should support PCM format', () => {
      expect(AudioFormat.PCM).toBe('pcm');
    });

    it('should support AAC format', () => {
      expect(AudioFormat.AAC).toBe('aac');
    });
  });

  describe('UsageInfo and PodcastInfoDetail types', () => {
    it('should create UsageInfo with token counts', () => {
      const usage = {
        inputTextTokens: 1024,
        outputAudioTokens: 2048,
      };

      expect(usage.inputTextTokens).toBe(1024);
      expect(usage.outputAudioTokens).toBe(2048);
    });

    it('should create PodcastInfoDetail with speakers and duration', () => {
      const info = {
        totalDuration: 120.5,
        totalRounds: 5,
        speakers: ['Alice', 'Bob'],
      };

      expect(info.totalDuration).toBe(120.5);
      expect(info.totalRounds).toBe(5);
      expect(info.speakers).toEqual(['Alice', 'Bob']);
    });

    it('should support PodcastInfoDetail with usage', () => {
      const info = {
        totalDuration: 120.5,
        totalRounds: 5,
        speakers: ['Alice', 'Bob'],
        usage: {
          inputTextTokens: 1024,
          outputAudioTokens: 2048,
        },
      };

      expect(info.usage).toBeDefined();
      expect(info.usage?.inputTextTokens).toBe(1024);
    });
  });

  describe('PodcastCallbackPayload structure', () => {
    it('should support success callback with usage info', () => {
      const payload = {
        task_id: 'task-123',
        status: 'success' as const,
        audio_url: 'https://minio.example.com/podcast.mp3',
        usage: {
          inputTextTokens: 1024,
          outputAudioTokens: 2048,
        },
      };

      expect(payload.task_id).toBe('task-123');
      expect(payload.status).toBe('success');
      expect(payload.usage?.inputTextTokens).toBe(1024);
    });

    it('should support payload with podcast_info and usage', () => {
      const payload = {
        task_id: 'task-123',
        status: 'success' as const,
        audio_url: 'https://minio.example.com/podcast.mp3',
        podcast_info: {
          totalDuration: 120.5,
          totalRounds: 5,
          speakers: ['Alice', 'Bob'],
          usage: {
            inputTextTokens: 1024,
            outputAudioTokens: 2048,
          },
        },
        usage: {
          inputTextTokens: 1024,
          outputAudioTokens: 2048,
        },
      };

      expect(payload.podcast_info?.totalRounds).toBe(5);
      expect(payload.podcast_info?.usage?.inputTextTokens).toBe(1024);
      expect(payload.usage?.outputAudioTokens).toBe(2048);
    });

    it('should support error callback without usage', () => {
      const payload = {
        task_id: 'task-123',
        status: 'failed' as const,
        error_message: 'Connection failed',
      };

      expect(payload.status).toBe('failed');
      expect(payload.error_message).toBeDefined();
    });

    it('should support round_audios in callback', () => {
      const payload = {
        task_id: 'task-123',
        status: 'success' as const,
        audio_url: 'https://minio.example.com/podcast.mp3',
        round_audios: [
          {
            roundId: 1,
            speaker: 'Alice',
            audioUrl: 'https://minio.example.com/round_1.mp3',
          },
          {
            roundId: 2,
            speaker: 'Bob',
            audioUrl: 'https://minio.example.com/round_2.mp3',
          },
        ],
      };

      expect(payload.round_audios).toHaveLength(2);
      expect(payload.round_audios?.[0].speaker).toBe('Alice');
    });
  });

  describe('only_nlp_text and return_audio_url parameters', () => {
    it('should support InputInfoDto with only_nlp_text', () => {
      const inputInfo = {
        only_nlp_text: true,
      };

      expect(inputInfo.only_nlp_text).toBe(true);
    });

    it('should support InputInfoDto with return_audio_url', () => {
      const inputInfo = {
        return_audio_url: true,
        input_url: 'https://example.com/text.txt',
      };

      expect(inputInfo.return_audio_url).toBe(true);
      expect(inputInfo.input_url).toBeDefined();
    });

    it('should support both parameters together', () => {
      const inputInfo = {
        only_nlp_text: false,
        return_audio_url: true,
        input_url: 'https://example.com/text.txt',
        input_text_max_length: 1000,
      };

      expect(inputInfo.only_nlp_text).toBe(false);
      expect(inputInfo.return_audio_url).toBe(true);
      expect(inputInfo.input_text_max_length).toBe(1000);
    });
  });

  describe('AudioConfigDto defaults', () => {
    it('should have correct default sample_rate', () => {
      expect(24000).toBe(24000);
    });

    it('should have correct default speech_rate', () => {
      expect(0).toBe(0);
    });

    it('should support custom audio format', () => {
      const config = {
        format: AudioFormat.OGG_OPUS,
        sample_rate: 24000,
        speech_rate: 0,
      };

      expect(config.format).toBe(AudioFormat.OGG_OPUS);
    });
  });

  describe('CreatePodcastDto workflow', () => {
    it('should support complete workflow with all parameters', () => {
      const dto = {
        action: ActionType.DIALOGUE,
        input_id: 'input-1',
        nlp_texts: [
          { speaker: 'Alice', text: 'Hello' },
          { speaker: 'Bob', text: 'Hi' },
        ],
        input_info: {
          only_nlp_text: false,
          return_audio_url: true,
          input_url: 'https://example.com/text.txt',
        },
        audio_config: {
          format: AudioFormat.MP3,
          sample_rate: 24000,
          speech_rate: 0,
        },
        speaker_info: {
          random_order: false,
          speakers: ['Alice', 'Bob'],
        },
        use_head_music: true,
        use_tail_music: false,
        callback_url: 'https://example.com/callback',
      };

      expect(dto.action).toBe(ActionType.DIALOGUE);
      expect(dto.input_info?.only_nlp_text).toBe(false);
      expect(dto.input_info?.return_audio_url).toBe(true);
      expect(dto.callback_url).toBeDefined();
    });
  });

  describe('CreatePodcastDto - debug_mode', () => {
    it('should default debug_mode to false when not provided', () => {
      const dto = {
        action: ActionType.SUMMARIZE,
        input_text: 'Test text',
        callback_url: 'https://example.com/callback',
      };

      expect(dto.debug_mode).toBeUndefined();
    });

    it('should accept debug_mode as true', () => {
      const dto = {
        action: ActionType.SUMMARIZE,
        input_text: 'Test text',
        callback_url: 'https://example.com/callback',
        debug_mode: true,
      };

      expect(dto.debug_mode).toBe(true);
    });

    it('should accept debug_mode as false', () => {
      const dto = {
        action: ActionType.SUMMARIZE,
        input_text: 'Test text',
        callback_url: 'https://example.com/callback',
        debug_mode: false,
      };

      expect(dto.debug_mode).toBe(false);
    });
  });
});
