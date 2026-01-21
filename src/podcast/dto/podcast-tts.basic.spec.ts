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
        taskId: 'task-123',
        status: 'success' as const,
        audioUrl: 'https://minio.example.com/podcast.mp3',
        usage: {
          inputTextTokens: 1024,
          outputAudioTokens: 2048,
        },
      };

      expect(payload.taskId).toBe('task-123');
      expect(payload.status).toBe('success');
      expect(payload.usage?.inputTextTokens).toBe(1024);
    });

    it('should support payload with podcastInfo and usage', () => {
      const payload = {
        taskId: 'task-123',
        status: 'success' as const,
        audioUrl: 'https://minio.example.com/podcast.mp3',
        podcastInfo: {
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

      expect(payload.podcastInfo?.totalRounds).toBe(5);
      expect(payload.podcastInfo?.usage?.inputTextTokens).toBe(1024);
      expect(payload.usage?.outputAudioTokens).toBe(2048);
    });

    it('should support error callback without usage', () => {
      const payload = {
        taskId: 'task-123',
        status: 'failed' as const,
        errorMessage: 'Connection failed',
      };

      expect(payload.status).toBe('failed');
      expect(payload.errorMessage).toBeDefined();
    });

    it('should support roundAudios in callback', () => {
      const payload = {
        taskId: 'task-123',
        status: 'success' as const,
        audioUrl: 'https://minio.example.com/podcast.mp3',
        roundAudios: [
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

      expect(payload.roundAudios).toHaveLength(2);
      expect(payload.roundAudios?.[0].speaker).toBe('Alice');
    });
  });

  describe('onlyNlpText and returnAudioUrl parameters', () => {
    it('should support InputInfoDto with onlyNlpText', () => {
      const inputInfo = {
        onlyNlpText: true,
      };

      expect(inputInfo.onlyNlpText).toBe(true);
    });

    it('should support InputInfoDto with returnAudioUrl', () => {
      const inputInfo = {
        returnAudioUrl: true,
        inputUrl: 'https://example.com/text.txt',
      };

      expect(inputInfo.returnAudioUrl).toBe(true);
      expect(inputInfo.inputUrl).toBeDefined();
    });

    it('should support both parameters together', () => {
      const inputInfo = {
        onlyNlpText: false,
        returnAudioUrl: true,
        inputUrl: 'https://example.com/text.txt',
        inputTextMaxLength: 1000,
      };

      expect(inputInfo.onlyNlpText).toBe(false);
      expect(inputInfo.returnAudioUrl).toBe(true);
      expect(inputInfo.inputTextMaxLength).toBe(1000);
    });
  });

  describe('AudioConfigDto defaults', () => {
    it('should have correct default sampleRate', () => {
      expect(24000).toBe(24000);
    });

    it('should have correct default speechRate', () => {
      expect(0).toBe(0);
    });

    it('should support custom audio format', () => {
      const config = {
        format: AudioFormat.OGG_OPUS,
        sampleRate: 24000,
        speechRate: 0,
      };

      expect(config.format).toBe(AudioFormat.OGG_OPUS);
    });
  });

  describe('CreatePodcastDto workflow', () => {
    it('should support complete workflow with all parameters', () => {
      const dto = {
        action: ActionType.DIALOGUE,
        inputId: 'input-1',
        nlpTexts: [
          { speaker: 'Alice', text: 'Hello' },
          { speaker: 'Bob', text: 'Hi' },
        ],
        inputInfo: {
          onlyNlpText: false,
          returnAudioUrl: true,
          inputUrl: 'https://example.com/text.txt',
        },
        audioConfig: {
          format: AudioFormat.MP3,
          sampleRate: 24000,
          speechRate: 0,
        },
        speakerInfo: {
          randomOrder: false,
          speakers: ['Alice', 'Bob'],
        },
        useHeadMusic: true,
        useTailMusic: false,
        callbackUrl: 'https://example.com/callback',
      };

      expect(dto.action).toBe(ActionType.DIALOGUE);
      expect(dto.inputInfo?.onlyNlpText).toBe(false);
      expect(dto.inputInfo?.returnAudioUrl).toBe(true);
      expect(dto.callbackUrl).toBeDefined();
    });
  });

  describe('CreatePodcastDto - debugMode', () => {
    it('should default debugMode to false when not provided', () => {
      const dto: {
        action: number;
        inputText: string;
        callbackUrl: string;
        debugMode?: boolean;
      } = {
        action: ActionType.SUMMARIZE,
        inputText: 'Test text',
        callbackUrl: 'https://example.com/callback',
      };

      expect(dto.debugMode).toBeUndefined();
    });

    it('should accept debugMode as true', () => {
      const dto: {
        action: number;
        inputText: string;
        callbackUrl: string;
        debugMode?: boolean;
      } = {
        action: ActionType.SUMMARIZE,
        inputText: 'Test text',
        callbackUrl: 'https://example.com/callback',
        debugMode: true,
      };

      expect(dto.debugMode).toBe(true);
    });

    it('should accept debugMode as false', () => {
      const dto = {
        action: ActionType.SUMMARIZE,
        inputText: 'Test text',
        callbackUrl: 'https://example.com/callback',
        debugMode: false,
      };

      expect(dto.debugMode).toBe(false);
    });
  });
});
