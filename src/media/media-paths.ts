import { BadRequestException, Injectable } from '@nestjs/common';
import * as path from 'node:path';
import { config } from '../config';

@Injectable()
export class MediaPaths {
  readonly root = config.mediaDir;
  readonly inputsDir = path.join(this.root, 'inputs');
  readonly outputsDir = path.join(this.root, 'outputs');
  readonly workDir = path.join(this.root, 'work');

  // 🧠 Захист від path traversal: без цієї перевірки запит
  // {"clips": ["../../etc/passwd"]} прочитав би довільний файл.
  // Будь-який шлях від клієнта — недовірені дані.
  resolveInput(relative: string): string {
    const abs = path.resolve(this.inputsDir, relative);
    if (!abs.startsWith(this.inputsDir + path.sep)) {
      throw new BadRequestException(`Invalid media path: ${relative}`);
    }
    return abs;
  }
}
