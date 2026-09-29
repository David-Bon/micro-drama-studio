#!/usr/bin/env bash
# Генерує тестові кліпи РІЗНИХ розмірів і fps — саме так поводяться
# відеомоделі в реальності. Пайплайн має їх нормалізувати.
set -euo pipefail
DIR="${1:-./media/inputs}"
mkdir -p "$DIR"
enc=(-c:v libx264 -pix_fmt yuv420p -loglevel error -y)

ffmpeg -f lavfi -i "testsrc2=size=1920x1080:rate=30:duration=4" "${enc[@]}" "$DIR/clip-landscape.mp4"
ffmpeg -f lavfi -i "smptebars=size=1080x1080:rate=25:duration=3" "${enc[@]}" "$DIR/clip-square.mp4"
ffmpeg -f lavfi -i "mandelbrot=size=720x1280:rate=24" -t 3 "${enc[@]}" "$DIR/clip-vertical.mp4"
# Аудіо навмисно коротше за відео (6с vs 10с) — перевіряємо apad
ffmpeg -f lavfi -i "sine=frequency=330:duration=6" -c:a aac -loglevel error -y "$DIR/music.m4a"

echo "Sample media written to $DIR:"
ls -1 "$DIR"
