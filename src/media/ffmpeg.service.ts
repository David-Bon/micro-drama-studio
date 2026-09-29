import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';

export interface AssembleOptions {
  clips: string[]; // абсолютні шляхи
  audio?: string;
  subtitlesPath?: string; // .srt
  output: string;
  /** Загальна тривалість відео (сума кліпів), сек. */
  durationSec: number;
}

// Цільовий формат вертикального серіалу
const W = 1080;
const H = 1920;
const FPS = 30;

@Injectable()
export class FfmpegService {
  private readonly logger = new Logger(FfmpegService.name);

  /** Тривалість файлу в секундах через ffprobe. */
  async probeDuration(file: string): Promise<number> {
    const out = await run('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      file,
    ]);
    const d = Number.parseFloat(out.trim());
    if (!Number.isFinite(d)) throw new Error(`Cannot read duration of ${file}`);
    return d;
  }

  /**
   * Чиста функція: вхідні параметри → аргументи FFmpeg.
   * 🧠 Відокремлена від запуску процесу, щоб її легко тестувати й дебажити:
   * виведи результат у консоль і запусти команду вручну в терміналі.
   */
  buildAssembleArgs(opts: AssembleOptions): string[] {
    const { clips, audio, subtitlesPath, output, durationSec } = opts;
    const args = ['-y', '-hide_banner', '-loglevel', 'error', '-nostats', '-progress', 'pipe:1'];

    for (const clip of clips) args.push('-i', clip);
    if (audio) args.push('-i', audio);

    // 🧠 filter_complex — граф фільтрів. [0:v] = відеопотік першого входу,
    // [v0] = іменований вихід, який можна подати в наступний фільтр.
    //
    // Кожен кліп нормалізуємо до ОДНАКОВИХ параметрів, бо concat вимагає
    // ідентичних роздільної здатності, SAR, fps і формату пікселів.
    // Відеомоделі віддають різні розміри й fps — це реальна проблема продакшну.
    //
    // scale ... increase + crop = "заповнити кадр і обрізати зайве"
    // (центральний кроп горизонтального кадру у вертикальний).
    const filters = clips.map(
      (_, i) =>
        `[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,` +
        `crop=${W}:${H},setsar=1,fps=${FPS},format=yuv420p[v${i}]`,
    );

    // a=0: беремо тільки відео кліпів, аудіо накладемо окремою доріжкою.
    const concatInputs = clips.map((_, i) => `[v${i}]`).join('');
    filters.push(`${concatInputs}concat=n=${clips.length}:v=1:a=0[vcat]`);

    let videoOut = 'vcat';
    if (subtitlesPath) {
      // Субтитри "впікаються" в кадр (burn-in) через libass.
      filters.push(
        `[vcat]subtitles=filename='${escapeFilterValue(subtitlesPath)}':` +
          `force_style='FontName=DejaVu Sans,FontSize=14,Outline=2,Alignment=2,MarginV=70'[vsub]`,
      );
      videoOut = 'vsub';
    }

    if (audio) {
      // apad доповнює аудіо тишею до кінця відео, atrim обрізає задовге.
      // Разом: довжину епізоду завжди визначає відео.
      // (Популярний варіант "apad + -shortest" у filter_complex може
      // зависнути назавжди — нескінченний потік тиші. Перевірено болем.)
      filters.push(
        `[${clips.length}:a]apad=whole_dur=${durationSec},atrim=0:${durationSec}[aout]`,
      );
    }

    args.push('-filter_complex', filters.join(';'), '-map', `[${videoOut}]`);
    if (audio) args.push('-map', '[aout]', '-c:a', 'aac', '-b:a', '192k');

    args.push(
      '-c:v', 'libx264',
      '-preset', 'veryfast', // швидкість кодування vs розмір файлу
      '-crf', '23', // якість: менше = краще й більше
      '-movflags', '+faststart', // moov-атом на початку → відео стартує до повного завантаження
      '-t', String(durationSec), // страховка від нескінченного виходу
      output,
    );
    return args;
  }

  /** Склеює кліпи у вертикальне відео й повідомляє прогрес 0–99. */
  async assembleVertical(
    opts: Omit<AssembleOptions, 'durationSec'>,
    onProgress?: (percent: number) => void,
  ): Promise<void> {
    const durations = await Promise.all(opts.clips.map((c) => this.probeDuration(c)));
    const totalSec = durations.reduce((a, b) => a + b, 0);
    const args = this.buildAssembleArgs({ ...opts, durationSec: totalSec });
    this.logger.debug(`ffmpeg ${args.join(' ')}`);

    // 🧠 -progress pipe:1 пише в stdout рядки key=value, зокрема
    // out_time_us — скільки мікросекунд результату вже закодовано.
    // Ділимо на загальну тривалість → відсоток.
    await run('ffmpeg', args, (line) => {
      const [key, value] = line.split('=');
      if (key === 'out_time_us' && onProgress && totalSec > 0) {
        const done = Number(value) / 1e6;
        if (Number.isFinite(done)) {
          onProgress(Math.min(99, Math.round((done / totalSec) * 100)));
        }
      }
    });
  }
}

/**
 * Запуск процесу без shell.
 * 🧠 spawn з масивом аргументів, а не exec("ffmpeg " + ...), — жодної
 * shell-інтерпретації, тож шлях на кшталт "a; rm -rf /" не виконається.
 */
function run(cmd: string, args: string[], onStdoutLine?: (line: string) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args);
    let stdout = '';
    let stderr = '';
    let buffer = '';

    proc.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      if (!onStdoutLine) return;
      buffer += text;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      lines.forEach((l) => onStdoutLine(l.trim()));
    });
    // Тримаємо лише хвіст stderr: FFmpeg може писати туди мегабайти.
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-4000);
    });
    proc.on('error', reject); // напр. ffmpeg не встановлений
    proc.on('close', (code) =>
      code === 0 ? resolve(stdout) : reject(new Error(`${cmd} exited with ${code}: ${stderr.trim()}`)),
    );
  });
}

/**
 * Значення в одинарних лапках filtergraph передаються буквально,
 * тож єдиний небезпечний символ — сама лапка. Наші шляхи генеруємо ми (uuid),
 * тому просто відмовляємося від "дивних" шляхів замість складного екранування.
 */
function escapeFilterValue(value: string): string {
  if (value.includes("'")) throw new Error(`Unsupported path for ffmpeg filter: ${value}`);
  return value;
}
