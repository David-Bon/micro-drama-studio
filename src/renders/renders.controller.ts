import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  StreamableFile,
} from '@nestjs/common';
import { createReadStream } from 'node:fs';
import { CreateRenderDto } from './dto/create-render.dto';
import { RendersService } from './renders.service';

@Controller('renders')
export class RendersController {
  constructor(private readonly renders: RendersService) {}

  // 🧠 202 Accepted, а не 201: ресурс створено, але робота ще не виконана.
  // Клієнт отримує id і далі опитує GET /renders/:id (polling).
  // На тижні 4 замінимо polling на SSE.
  @Post()
  @HttpCode(202)
  create(@Body() dto: CreateRenderDto) {
    return this.renders.create(dto);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.renders.get(id);
  }

  @Get(':id/file')
  async file(@Param('id', ParseUUIDPipe) id: string) {
    const render = await this.renders.get(id);
    if (render.status !== 'completed' || !render.outputPath) {
      throw new ConflictException(`Render is ${render.status}`);
    }
    // 🧠 Стрімимо файл, а не читаємо в пам'ять: відео може важити сотні МБ.
    return new StreamableFile(createReadStream(render.outputPath), {
      type: 'video/mp4',
      disposition: `inline; filename="${id}.mp4"`,
    });
  }
}
