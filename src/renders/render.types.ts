export interface SubtitleCue {
  start: number; // секунди
  end: number;
  text: string;
}

// Шляхи зберігаються ВІДНОСНО media/inputs — так запис у БД однаково
// валідний і локально, і в контейнері.
export interface RenderInput {
  clips: string[];
  audio?: string;
  subtitles?: SubtitleCue[];
}

// 🧠 У payload задачі кладемо лише ID. Джерело правди — Postgres,
// а Redis — транспорт. Якщо Redis втратить дані, ми не втратимо рендери.
export interface RenderJobData {
  renderId: string;
}
